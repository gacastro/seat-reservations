import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "./app.module";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Redis } from "ioredis";
import * as request from "supertest";
import { EventProperties, SeatRequest } from "./definitions";
import { v4 as uuidv4 } from "uuid";
import { EventManager } from "./event.manager";

describe("When I want to hold a seat", () => {
  let app: INestApplication;
  let redis: Redis;
  let userId: string;
  let eventName: string;
  let eventId: string;
  let firstSeat: string;
  let keyForAvailableSeats: string;
  let keyForSeatsBeingHeld: string;
  let secondSeat: string;
  let seatToHold: string;
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
    keyForAvailableSeats = EventManager.generateKeyForAvailableSeats(eventId);
    keyForSeatsBeingHeld = EventManager.generateKeyForSeatsBeingHeld(eventId);
    keyForSeatsUserIsHolding = EventManager.generateKeyForSeatsUserIsHolding(
      userId,
      eventId,
    );
    firstSeat = EventManager.generateSeatKey(eventName, uniqueNumber + 1);
    secondSeat = EventManager.generateSeatKey(eventName, uniqueNumber + 2);
    seatToHold = EventManager.generateSeatKey(eventName, uniqueNumber + 3);
    keyForHeldSeat = EventManager.generateHeldSeatKey(seatToHold);
    body = {
      userId,
      seatId: seatToHold,
    };
  });

  it("should return 201 when it managed to hold a seat", async () => {
    await redis.sadd(keyForSeatsUserIsHolding, firstSeat, secondSeat);
    await redis.hset(
      eventId,
      EventProperties.NumberOfSeatsUserCanHoldPerEvent,
      3,
    );
    await redis.sadd(keyForAvailableSeats, seatToHold);

    const response = await request(app.getHttpServer())
      .post(`/event/${encodeURIComponent(eventId)}/seats/hold`)
      .send(body);

    expect(response.statusCode).toBe(201);

    const heldSeat = await redis.get(keyForHeldSeat);
    expect(heldSeat).toEqual(userId);

    const isHeldSeatInRightCollection = await redis.sismember(
      keyForSeatsBeingHeld,
      seatToHold,
    );
    expect(isHeldSeatInRightCollection).toBeTruthy();

    const isSeatBeenAddedToUserHeldSeats = await redis.sismember(
      keyForSeatsUserIsHolding,
      seatToHold,
    );
    expect(isSeatBeenAddedToUserHeldSeats).toBeTruthy();

    const sameUserLockExists = await redis.exists(
      EventManager.generateLockKeyForSameUser(userId, eventId),
    );
    expect(sameUserLockExists).toBeFalsy();
  });

  it("should return 201 event though it seemed user had no more allowance", async () => {
    await redis.sadd(keyForSeatsUserIsHolding, firstSeat, secondSeat);
    await redis.hset(
      eventId,
      EventProperties.NumberOfSeatsUserCanHoldPerEvent,
      2,
    );
    await redis.sadd(keyForAvailableSeats, seatToHold);

    const response = await request(app.getHttpServer())
      .post(`/event/${encodeURIComponent(eventId)}/seats/hold`)
      .send(body);

    expect(response.statusCode).toBe(201);

    const heldSeat = await redis.get(keyForHeldSeat);
    expect(heldSeat).toEqual(userId);

    const isHeldSeatInRightCollection = await redis.sismember(
      keyForSeatsBeingHeld,
      seatToHold,
    );
    expect(isHeldSeatInRightCollection).toBeTruthy();

    const userHeldSeats = await redis.smembers(keyForSeatsUserIsHolding);
    expect(userHeldSeats.length).toEqual(1);
    expect(userHeldSeats[0]).toEqual(seatToHold);

    const sameUserLockExists = await redis.exists(
      EventManager.generateLockKeyForSameUser(userId, eventId),
    );
    expect(sameUserLockExists).toBeFalsy();
  });

  it("should return 404 when the event or seat haven't been found", async () => {
    const response = await request(app.getHttpServer())
      .post(`/event/${encodeURIComponent(eventId)}/seats/hold`)
      .send(body);

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      error: "Not Found",
      message: `Seat under key -${seatToHold}- was not found`,
      statusCode: 404,
    });
  });

  it("should return 409 when the user cannot hold more seats", async () => {
    await redis.sadd(keyForAvailableSeats, seatToHold);
    await redis.sadd(keyForSeatsUserIsHolding, firstSeat, secondSeat);
    await redis.set(EventManager.generateHeldSeatKey(firstSeat), userId);
    await redis.set(EventManager.generateHeldSeatKey(secondSeat), userId);
    await redis.hset(
      eventId,
      EventProperties.NumberOfSeatsUserCanHoldPerEvent,
      2,
    );

    const response = await request(app.getHttpServer())
      .post(`/event/${encodeURIComponent(eventId)}/seats/hold`)
      .send(body);

    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({
      error: "Conflict",
      message: `user ${userId} cannot hold more seats`,
      statusCode: 409,
    });

    const userHeldSeats = await redis.smembers(keyForSeatsUserIsHolding);
    expect(userHeldSeats.length).toEqual(2);

    const sameUserLockExists = await redis.exists(
      EventManager.generateLockKeyForSameUser(userId, eventId),
    );
    expect(sameUserLockExists).toBeFalsy();
  });

  it("should return 409 when the seat is no longer available", async () => {
    await redis.sadd(keyForAvailableSeats, seatToHold);
    await redis.sadd(keyForSeatsUserIsHolding, firstSeat, secondSeat);
    await redis.hset(
      eventId,
      EventProperties.NumberOfSeatsUserCanHoldPerEvent,
      3,
    );
    await redis.set(keyForHeldSeat, userId);

    const response = await request(app.getHttpServer())
      .post(`/event/${encodeURIComponent(eventId)}/seats/hold`)
      .send(body);

    expect(response.statusCode).toBe(409);
    expect(response.body).toEqual({
      error: "Conflict",
      message: `Seat -${seatToHold}- is no longer available`,
      statusCode: 409,
    });
  });

  it("should return 409 when another request is in the process of holding the same seat", async () => {
    await redis.sadd(keyForSeatsUserIsHolding, firstSeat, secondSeat);
    await redis.hset(
      eventId,
      EventProperties.NumberOfSeatsUserCanHoldPerEvent,
      3,
    );
    await redis.sadd(keyForAvailableSeats, seatToHold);

    const successfulRequest = request(app.getHttpServer())
      .post(`/event/${encodeURIComponent(eventId)}/seats/hold`)
      .send(body);
    const conflictingRequest = request(app.getHttpServer())
      .post(`/event/${encodeURIComponent(eventId)}/seats/hold`)
      .send({
        ...body,
        userId: uuidv4(),
      });
    const [successfulResponse, conflictingResponse] = await Promise.all([
      successfulRequest,
      conflictingRequest,
    ]);

    expect(successfulResponse.status).toEqual(201);
    expect(conflictingResponse.status).toEqual(409);
    expect(conflictingResponse.body).toEqual({
      error: "Conflict",
      message: `another process is already handling the resource -${EventManager.generateLockKeyForHeldSeat(seatToHold)}-`,
      statusCode: 409,
    });
  });

  it("should return 409 when another request from the same user is in the process of holding a seat", async () => {
    await redis.sadd(keyForSeatsUserIsHolding, firstSeat, secondSeat);
    await redis.hset(
      eventId,
      EventProperties.NumberOfSeatsUserCanHoldPerEvent,
      3,
    );
    const secondSeatToHold = "seat-id";
    await redis.sadd(keyForAvailableSeats, seatToHold, secondSeatToHold);

    const successfulRequest = request(app.getHttpServer())
      .post(`/event/${encodeURIComponent(eventId)}/seats/hold`)
      .send(body);
    const conflictingRequest = request(app.getHttpServer())
      .post(`/event/${encodeURIComponent(eventId)}/seats/hold`)
      .send({ ...body, seatId: secondSeatToHold });
    const [successfulResponse, conflictingResponse] = await Promise.all([
      successfulRequest,
      conflictingRequest,
    ]);

    expect(successfulResponse.status).toEqual(201);
    expect(conflictingResponse.status).toEqual(409);
    expect(conflictingResponse.body).toEqual({
      error: "Conflict",
      message: `another process is already handling the resource -${EventManager.generateLockKeyForSameUser(userId, eventId)}-`,
      statusCode: 409,
    });
  });
});
