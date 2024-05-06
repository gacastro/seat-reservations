import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  CreateEventRequest,
  CreateEventResponse,
  ResponseToInvalidRequest,
  EventIdRouteParameter,
  IManageEvents,
  ListAvailableSeatsResponse,
  SeatRequest,
  SeatResponse,
} from "./definitions";
import { ApiBody, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ImplementationFor } from "./di.constants";

@Controller("/event")
export class EventController {
  constructor(
    @Inject(ImplementationFor.IManageEvents)
    private readonly eventManager: IManageEvents,
  ) {}

  @Post()
  @ApiOperation({
    summary: "Create an event with the specified amount of seats",
  })
  @ApiBody({
    type: CreateEventRequest,
  })
  @ApiResponse({
    status: 201,
    description: "Created",
    type: CreateEventResponse,
  })
  @ApiResponse({
    status: 400,
    type: ResponseToInvalidRequest,
    description: "Invalid input",
  })
  @ApiResponse({
    status: 409,
    type: ResponseToInvalidRequest,
    description:
      "Conflict: Event already exists or another process is already handling it",
  })
  async createEvent(
    @Body() body: CreateEventRequest,
  ): Promise<CreateEventResponse> {
    const eventId = await this.eventManager.createEvent(
      body.eventName,
      body.numberOfSeats,
      body.numberOfSeatsUserCanHoldPerEvent,
    );

    return { eventId };
  }

  @Get(":eventId")
  @ApiOperation({ summary: "List the available seats for an event" })
  @ApiResponse({
    status: 200,
    description: "Okay",
    type: ListAvailableSeatsResponse,
  })
  @ApiResponse({
    status: 400,
    type: ResponseToInvalidRequest,
    description: "Invalid input",
  })
  @ApiResponse({
    status: 404,
    type: ResponseToInvalidRequest,
    description: "Event id not found",
  })
  async listAvailableSeats(
    @Param() routeParameters: EventIdRouteParameter,
  ): Promise<ListAvailableSeatsResponse> {
    const availableSeats = await this.eventManager.listAvailableSeats(
      routeParameters.eventId,
    );

    return { availableSeats };
  }

  @Post(":eventId/seats/hold")
  @ApiOperation({ summary: "Allow a user to hold a seat for a specific event" })
  @ApiBody({
    type: SeatRequest,
  })
  @ApiResponse({
    status: 201,
    description: "Created",
    type: SeatResponse,
  })
  @ApiResponse({
    status: 400,
    type: ResponseToInvalidRequest,
    description: "Invalid input",
  })
  @ApiResponse({
    status: 404,
    type: ResponseToInvalidRequest,
    description: "Seat id not found",
  })
  @ApiResponse({
    status: 409,
    type: ResponseToInvalidRequest,
    description:
      "Conflict: Seat is no longer available or user has reached the limit of held seats",
  })
  async holdSeat(
    @Param() routeParameters: EventIdRouteParameter,
    @Body() body: SeatRequest,
  ): Promise<SeatResponse> {
    const heldUntil = await this.eventManager.holdSeat(
      routeParameters.eventId,
      body.userId,
      body.seatId,
    );

    return { heldUntil };
  }

  @Patch(":eventId/seats/hold")
  @ApiOperation({
    summary: "Allow a user to refresh the hold he has on a seat",
  })
  @ApiBody({
    type: SeatRequest,
  })
  @ApiResponse({
    status: 200,
    description: "Okay",
    type: SeatResponse,
  })
  @ApiResponse({
    status: 400,
    type: ResponseToInvalidRequest,
    description: "Invalid input",
  })
  @ApiResponse({
    status: 404,
    type: ResponseToInvalidRequest,
    description: "Event id or seat not found",
  })
  @ApiResponse({
    status: 409,
    type: ResponseToInvalidRequest,
    description: "Conflict: User no longer holds the seat",
  })
  async refreshHoldSeat(
    @Param() routeParameters: EventIdRouteParameter,
    @Body() body: SeatRequest,
  ): Promise<SeatResponse> {
    const heldUntil = await this.eventManager.refreshHoldSeat(
      routeParameters.eventId,
      body.userId,
      body.seatId,
    );

    return { heldUntil };
  }

  @Post(":eventId/seats/reserve")
  @ApiOperation({
    summary: "Allow a user to reserve a seat he is currently holding",
  })
  @ApiBody({
    type: SeatRequest,
  })
  @ApiResponse({
    status: 201,
    description: "Created",
    schema: {},
  })
  @ApiResponse({
    status: 400,
    type: ResponseToInvalidRequest,
    description: "Invalid input",
  })
  @ApiResponse({
    status: 404,
    type: ResponseToInvalidRequest,
    description: "Seat id not found",
  })
  @ApiResponse({
    status: 409,
    type: ResponseToInvalidRequest,
    description: "Conflict: User no longer holds the seat",
  })
  async reserveSeat(
    @Param() routeParameters: EventIdRouteParameter,
    @Body() body: SeatRequest,
  ): Promise<void> {
    await this.eventManager.reserveSeat(
      routeParameters.eventId,
      body.userId,
      body.seatId,
    );
  }
}
