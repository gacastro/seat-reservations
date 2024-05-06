import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Redis } from "ioredis";
import { SeatRequest } from "./definitions";
import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "./app.module";
import { EventManager } from "./event.manager";
import { v4 as uuidv4 } from "uuid";
import * as request from "supertest";

describe("When I want to refresh an hold on a seat", () => {
  let app: INestApplication;
  let redis: Redis;
  let userId: string;
  let eventName: string;
  let eventId: string;
  let keyForSeatsBeingHeld: string;
  let seatToRefresh: string;
  let lockKeyForHeldSeat: string;
  let keyForHeldSeat: string;
  let body: SeatRequest;

  beforeAll(async () => {
    const testingModule: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = testingModule.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());

    await app.init();
    redis = new Redis();
  });

  beforeEach(() => {
    const uniqueNumber = uuidv4();
    eventName = `event-name-${uniqueNumber}`;
    eventId = EventManager.generateEventKey(eventName);
    userId = uuidv4();
    keyForSeatsBeingHeld = EventManager.generateKeyForSeatsBeingHeld(eventId);
    seatToRefresh = EventManager.generateSeatKey(eventName, uniqueNumber + 3);
    keyForHeldSeat = EventManager.generateHeldSeatKey(seatToRefresh);
    lockKeyForHeldSeat = EventManager.generateLockKeyForHeldSeat(seatToRefresh);
    body = {
      userId,
      seatId: seatToRefresh,
    };
  });

  it("should return 200 when we are able to refresh", async () => {
    await redis.sadd(keyForSeatsBeingHeld, seatToRefresh);
    await redis.set(keyForHeldSeat, userId);

    const response = await request(app.getHttpServer())
      .patch(`/event/${encodeURIComponent(eventId)}/seats/hold`)
      .send(body);

    expect(response.statusCode).toBe(200);

    // time assertions are always tricky, please refer to the notes on readme

    const heldSeat = await redis.get(keyForHeldSeat);
    expect(heldSeat).toBeTruthy();

    const lockExists = await redis.exists(lockKeyForHeldSeat);
    expect(lockExists).toBeFalsy();
  });

  it("should return 404 when seat cannot be found", async () => {
    const response = await request(app.getHttpServer())
      .patch(`/event/${encodeURIComponent(eventId)}/seats/hold`)
      .send(body);

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      error: "Not Found",
      message: `Seat under key -${seatToRefresh}- was not found`,
      statusCode: 404,
    });
  });

  it("should return 409 when user no longer holds the seat", async () => {
    await redis.sadd(keyForSeatsBeingHeld, seatToRefresh);

    const response = await request(app.getHttpServer())
      .patch(`/event/${encodeURIComponent(eventId)}/seats/hold`)
      .send(body);

    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({
      error: "Conflict",
      message: `seat -${seatToRefresh}- is no longer being held. cannot be reserved anymore`,
      statusCode: 409,
    });
  });

  it("should return 409 when another request is already managing the held seat", async () => {
    await redis.sadd(keyForSeatsBeingHeld, seatToRefresh);
    await redis.set(keyForHeldSeat, userId);

    const successfulRequest = request(app.getHttpServer())
      .patch(`/event/${encodeURIComponent(eventId)}/seats/hold`)
      .send(body);

    const conflictingRequest = request(app.getHttpServer())
      .patch(`/event/${encodeURIComponent(eventId)}/seats/hold`)
      .send(body);

    const [successfulResponse, conflictingResponse] = await Promise.all([
      successfulRequest,
      conflictingRequest,
    ]);

    expect(successfulResponse.statusCode).toBe(200);
    expect(conflictingResponse.statusCode).toBe(409);
    expect(conflictingResponse.body).toEqual({
      error: "Conflict",
      message: `another process is already handling the resource -${lockKeyForHeldSeat}-`,
      statusCode: 409,
    });
  });
});
