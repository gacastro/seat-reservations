import { IsInt, IsString, Matches, Max, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class EventIdRouteParameter {
  @IsString()
  @Matches(/^[a-zA-Z0-9_#-]{3,100}$/i, {
    message:
      "Invalid event id. Can only contain letters, numbers, hyphens, underscores and hash sign",
  })
  @ApiProperty({ example: "event-id", pattern: "^[a-zA-Z0-9_#-]{3,100}$" })
  eventId: string;
}

export class CreateEventRequest {
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{3,100}$/i, {
    message:
      "Invalid event name. Can only contain letters, numbers, hyphens and underscores",
  })
  @ApiProperty({ example: "event-name", pattern: "^[a-zA-Z0-9_-]{3,100}$" })
  eventName: string;

  @IsInt()
  @Min(10)
  @Max(1000)
  @ApiProperty({ example: "10", minimum: 10, maximum: 1000 })
  numberOfSeats: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  @ApiProperty({ example: "10", minimum: 10, maximum: 1000 })
  numberOfSeatsUserCanHoldPerEvent: number;
}

export class SeatRequest {
  @IsString()
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    {
      message: "Invalid user id. Needs to be a valid UUIDv4 string",
    },
  )
  @ApiProperty({
    example: "550e8400-e29b-41d4-a716-446655440000",
    pattern:
      "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
  })
  userId: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9_#-]{3,100}$/i, {
    message:
      "Invalid seat number. Can only contain letters, numbers, hyphens, underscores and hash sign",
  })
  @ApiProperty({ example: "event-name", pattern: "^[a-zA-Z0-9_#-]{3,100}$" })
  seatId: string;
}

export class CreateEventResponse {
  @ApiProperty({
    example: "event#event-name",
    description: "string that uniquely identifies the event",
  })
  eventId: string;
}

export class ResponseToInvalidRequest {
  @ApiProperty({ example: "['detail about the error']" })
  message: string[];

  @ApiProperty({ example: "reason" })
  error: string;

  @ApiProperty({ example: "4xx" })
  statusCode: number;
}

export class ListAvailableSeatsResponse {
  @ApiProperty({ example: "['23','45','102','845']" })
  availableSeats: string[];
}

export class SeatResponse {
  @ApiProperty({
    example: "1623108987",
    description: "time until the seat will be held, in epoch",
  })
  heldUntil: number;
}

export interface IManageEvents {
  createEvent(
    eventName: string,
    numberOfSeats: number,
    numberOfSeatsUserCanHoldPerEvent: number,
  ): Promise<string>;

  listAvailableSeats(eventId: string): Promise<string[]>;

  holdSeat(eventId: string, userId: string, seat: string): Promise<number>;

  refreshHoldSeat(
    eventId: string,
    userId: string,
    seatId: string,
  ): Promise<number>;

  reserveSeat(eventId: string, userId: string, seatId: string): Promise<void>;
}

export interface IAmRepository {
  createEvent(
    key: string,
    eventName: string,
    numberOfSeats: number,
    numberOfSeatsUserCanHoldPerEvent: number,
  ): Promise<void>;

  setAvailableSeat(availableSeatsKey: string, seatKey: string): Promise<void>;

  eventExists(key: string): Promise<boolean>;

  getAvailableSeats(key: string): Promise<string[]>;

  getSeatsBeingHeld(key: string): Promise<string[]>;

  getHeldSeat(key: string): Promise<string>;

  moveSeat(from: string, to: string, seat: string): Promise<number>;

  isAvailableSeat(key: string, seatId: string): Promise<boolean>;

  isHeldSeat(key: string, seatId: string): Promise<boolean>;

  getLock(key: string, logTarget: LogTarget): Promise<string>;

  getSeatsUserIsHolding(key: string): Promise<string[]>;

  getAmountSeatsUserCanHold(eventId: string): Promise<number>;

  releaseLock(key: string, lockHolderId: string): Promise<void>;

  addSeatToUsersSeats(key: string, seatId: string): Promise<void>;

  saveHeldSeat(key: string, userId: string): Promise<number>;

  removeSeatFromUserHeldSeats(key: string, seat: string): Promise<void>;

  removeHeldSeat(key: string): Promise<void>;

  removeSeatFromSeatsBeingHeld(key: string, seatId: string): Promise<void>;
}

export const KeyDelimiter = "#";

export enum KeyConstantFor {
  Event = "event",
  Seat = "seat",
  AvailableSeats = "available-seats",
  Lock = "lock",
  HeldSeat = "held-seat",
  SeatsBeingHeld = "seats-being-held",
  LockForWriting = "lock-for-writing",
}

export interface ILogInformation {
  error(description: string, whereItHappened: string, details?: unknown): void;

  info(description: string, whereItHappened: string, details?: unknown): void;
}

export enum LogType {
  Duplicate = "duplicate",
  UnavailableLock = "unavailable-lock",
  NotFound = "not-found",
  WrongConfiguration = "wrong-configuration",
  UnavailableSeat = "unavailable-seat",
  MaxCapacity = "max-capacity",
}

export enum LogTarget {
  Event = "event",
  Seat = "seat",
  User = "user",
}

export interface LogContext {
  type: LogType;
  target: LogTarget;
  details?: unknown;
}

export enum EventProperties {
  EventName = "event-name",
  NumberOfSeats = "number-of-seats",
  NumberOfSeatsUserCanHoldPerEvent = "number-of-seats-user-can-hold-per-event",
}
