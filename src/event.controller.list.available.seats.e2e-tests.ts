import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "./app.module";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Redis } from "ioredis";
import * as request from "supertest";
import { EventManager } from "./event.manager";
import { EventProperties } from "./definitions";
import { v4 as uuidv4 } from "uuid";

describe("When I want to list available seats", () => {
  let redis: Redis;
  let eventKey: string;
  let eventName: string;
  let heldSeatOne: string;
  let heldSeatTwo: string;
  let app: INestApplication;
  let heldSeatOneKey: string;
  let heldSeatTwoKey: string;
  let availableSeatOne: string;
  let availableSeatTwo: string;
  let noLongerHeldSeat: string;
  let keyForAvailableSeats: string;
  let keyForSeatsBeingHeld: string;

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
    eventKey = EventManager.generateEventKey(eventName);
    availableSeatOne = EventManager.generateSeatKey(
      eventName,
      uniqueNumber + 1,
    );
    availableSeatTwo = EventManager.generateSeatKey(
      eventName,
      uniqueNumber + 2,
    );
    heldSeatOne = EventManager.generateSeatKey(eventName, uniqueNumber + 3);
    heldSeatTwo = EventManager.generateSeatKey(eventName, uniqueNumber + 4);
    noLongerHeldSeat = EventManager.generateSeatKey(
      eventName,
      uniqueNumber + 5,
    );
    keyForAvailableSeats = EventManager.generateKeyForAvailableSeats(eventKey);
    keyForSeatsBeingHeld = EventManager.generateKeyForSeatsBeingHeld(eventKey);
    heldSeatOneKey = EventManager.generateHeldSeatKey(heldSeatOne);
    heldSeatTwoKey = EventManager.generateHeldSeatKey(heldSeatTwo);
  });

  it("should return 200 when we are able to list", async () => {
    // I could call the create event endpoint, but we need our tests to be as independent as possible
    // so if it fails its due to our code. Hence, I prefer to arrange redis
    await redis.hset(eventKey, EventProperties.EventName, eventName);
    await redis.sadd(keyForAvailableSeats, availableSeatOne, availableSeatTwo);
    const expectedAvailableSeats = [availableSeatOne, availableSeatTwo];

    const response = await request(app.getHttpServer()).get(
      `/event/${encodeURIComponent(eventKey)}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.availableSeats).toBeDefined();
    expect(new Set(response.body.availableSeats)).toEqual(
      new Set(expectedAvailableSeats),
    );
  });

  it("should return 200 and list available seats plus the seats that are no longer being held", async () => {
    await redis.hset(eventKey, EventProperties.EventName, eventName);
    await redis.sadd(keyForAvailableSeats, availableSeatOne, availableSeatTwo);
    await redis.sadd(
      keyForSeatsBeingHeld,
      heldSeatOne,
      heldSeatTwo,
      noLongerHeldSeat,
    );
    await redis.set(heldSeatOneKey, "userIdOne");
    await redis.set(heldSeatTwoKey, "userIdTwo");
    const expectedAvailableSeats = [
      availableSeatOne,
      availableSeatTwo,
      noLongerHeldSeat,
    ];

    const response = await request(app.getHttpServer()).get(
      `/event/${encodeURIComponent(eventKey)}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.availableSeats).toBeDefined();
    expect(new Set(response.body.availableSeats)).toEqual(
      new Set(expectedAvailableSeats),
    );

    const availableSeats = await redis.smembers(keyForAvailableSeats);
    expect(new Set(availableSeats)).toEqual(new Set(expectedAvailableSeats));
  });

  it("should return 200 when concurrent requests want to list", async () => {
    await redis.hset(eventKey, EventProperties.EventName, eventName);
    await redis.sadd(keyForAvailableSeats, availableSeatOne, availableSeatTwo);
    await redis.sadd(
      keyForSeatsBeingHeld,
      heldSeatOne,
      heldSeatTwo,
      noLongerHeldSeat,
    );
    await redis.set(heldSeatOneKey, "userIdOne");
    await redis.set(heldSeatTwoKey, "userIdTwo");
    const expectedAvailableSeats = [
      availableSeatOne,
      availableSeatTwo,
      noLongerHeldSeat,
    ];

    const firstRequest = request(app.getHttpServer()).get(
      `/event/${encodeURIComponent(eventKey)}`,
    );
    const secondRequest = request(app.getHttpServer()).get(
      `/event/${encodeURIComponent(eventKey)}`,
    );
    const [firstResponse, secondResponse] = await Promise.all([
      firstRequest,
      secondRequest,
    ]);

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.availableSeats).toBeDefined();
    expect(new Set(firstResponse.body.availableSeats)).toEqual(
      new Set(expectedAvailableSeats),
    );

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.availableSeats).toBeDefined();
    expect(new Set(secondResponse.body.availableSeats)).toEqual(
      new Set(expectedAvailableSeats),
    );

    const availableSeats = await redis.smembers(keyForAvailableSeats);
    expect(new Set(availableSeats)).toEqual(new Set(expectedAvailableSeats));
  });

  it("should return 404 when the event doesnt exist", async () => {
    const response = await request(app.getHttpServer()).get(
      `/event/${encodeURIComponent(eventKey)}`,
    );

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      error: "Not Found",
      message: `Event under key -${eventKey}- was not found`,
      statusCode: 404,
    });
  });
});
