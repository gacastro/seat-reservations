import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "./app.module";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Redis } from "ioredis";
import { SeatRequest } from "./definitions";
import { EventManager } from "./event.manager";
import { v4 as uuidv4 } from "uuid";
import * as request from "supertest";

describe("When I want to reserve a seat", () => {
  let app: INestApplication;
  let redis: Redis;
  let userId: string;
  let eventName: string;
  let eventId: string;
  let keyForSeatsBeingHeld: string;
  let seatToReserve: string;
  let lockKeyForHeldSeat: string;
  let keyForHeldSeat: string;
  let body: SeatRequest;
  let keyForSeatsUserIsHolding: string;

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
    keyForSeatsUserIsHolding = EventManager.generateKeyForSeatsUserIsHolding(
      userId,
      eventId,
    );
    seatToReserve = EventManager.generateSeatKey(eventName, uniqueNumber + 3);
    keyForHeldSeat = EventManager.generateHeldSeatKey(seatToReserve);
    lockKeyForHeldSeat = EventManager.generateLockKeyForHeldSeat(seatToReserve);
    body = {
      userId,
      seatId: seatToReserve,
    };
  });

  it("should return 201 when it is able to reserve the seat", async () => {
    await redis.sadd(keyForSeatsBeingHeld, seatToReserve);
    await redis.set(keyForHeldSeat, userId);

    const response = await request(app.getHttpServer())
      .post(`/event/${encodeURIComponent(eventId)}/seats/reserve`)
      .send(body);

    expect(response.statusCode).toBe(201);

    const heldSeat = await redis.get(keyForHeldSeat);
    expect(heldSeat).toBeFalsy();

    const isSeatInSeatsBeingHeld = await redis.sismember(
      keyForSeatsBeingHeld,
      seatToReserve,
    );
    expect(isSeatInSeatsBeingHeld).toBeFalsy();

    const isSeatInSeatsUserIsHolding = await redis.sismember(
      keyForSeatsUserIsHolding,
      seatToReserve,
    );
    expect(isSeatInSeatsUserIsHolding).toBeFalsy();

    const lockExists = await redis.exists(lockKeyForHeldSeat);
    expect(lockExists).toBeFalsy();
  });

  it("should return 404 when seat does not exist", async () => {
    const response = await request(app.getHttpServer())
      .post(`/event/${encodeURIComponent(eventId)}/seats/hold`)
      .send(body);

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      error: "Not Found",
      message: `Seat under key -${seatToReserve}- was not found`,
      statusCode: 404,
    });
  });

  it("should return 409 when seat is not being held by the user", async () => {
    await redis.sadd(keyForSeatsBeingHeld, seatToReserve);
    await redis.set(keyForHeldSeat, "another-user-id");

    const response = await request(app.getHttpServer())
      .post(`/event/${encodeURIComponent(eventId)}/seats/reserve`)
      .send(body);

    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({
      error: "Conflict",
      message: `seat -${seatToReserve}- is no longer being held. cannot be reserved anymore`,
      statusCode: 409,
    });

    const seatIsStillHeld = await redis.get(keyForHeldSeat);
    expect(seatIsStillHeld).toBeTruthy();
  });

  it("should return 409 when another request is already handling the held seat", async () => {
    await redis.sadd(keyForSeatsBeingHeld, seatToReserve);
    await redis.set(keyForHeldSeat, userId);

    const successfulRequest = request(app.getHttpServer())
      .post(`/event/${encodeURIComponent(eventId)}/seats/reserve`)
      .send(body);

    const conflictingRequest = request(app.getHttpServer())
      .post(`/event/${encodeURIComponent(eventId)}/seats/reserve`)
      .send(body);

    const [successfulResponse, conflictingResponse] = await Promise.all([
      successfulRequest,
      conflictingRequest,
    ]);

    expect(successfulResponse.statusCode).toBe(201);
    expect(conflictingResponse.statusCode).toBe(409);
    expect(conflictingResponse.body).toEqual({
      error: "Conflict",
      message: `another process is already handling the resource -${lockKeyForHeldSeat}-`,
      statusCode: 409,
    });
  });
});
