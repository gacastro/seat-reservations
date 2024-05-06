import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Redis } from "ioredis";
import { CreateEventRequest, EventProperties } from "./definitions";
import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "./app.module";
import * as request from "supertest";
import { EventManager } from "./event.manager";
import { v4 as uuidv4 } from "uuid";

describe("When I want to create an event", () => {
  let app: INestApplication;
  let redis: Redis;

  const createEventRequest: CreateEventRequest = {
    eventName: uuidv4(),
    numberOfSeats: 10,
    numberOfSeatsUserCanHoldPerEvent: 2,
  };
  const eventKey = EventManager.generateEventKey(createEventRequest.eventName);

  beforeAll(async () => {
    const testingModule: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = testingModule.createNestApplication();

    app.useGlobalPipes(new ValidationPipe());

    await app.init();
    redis = new Redis();
  });

  it("should return 201 when the service is able to create an event", async () => {
    const response = await request(app.getHttpServer())
      .post("/event")
      .send(createEventRequest);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ eventId: eventKey });

    const wasEventCreated = await redis.exists(eventKey);
    expect(wasEventCreated).toEqual(1);

    const numberOfSeats = await redis.smembers(
      EventManager.generateKeyForAvailableSeats(eventKey),
    );
    expect(numberOfSeats.length).toBe(createEventRequest.numberOfSeats);
  });

  it("should return 409 when the event already exists", async () => {
    await redis.hset(
      eventKey,
      EventProperties.EventName,
      createEventRequest.eventName,
    );
    const expectedBody = {
      error: "Conflict",
      message: `Event under key -${EventManager.generateEventKey(createEventRequest.eventName)}- already exists`,
      statusCode: 409,
    };

    const response = await request(app.getHttpServer())
      .post("/event")
      .send(createEventRequest);

    expect(response.status).toBe(409);
    expect(response.body).toEqual(expectedBody);
  });

  it("should return 409 when event is already being handled by another process", async () => {
    const newEventName = `event-name-${Date.now()}`;
    const successfulResponsePromise = request(app.getHttpServer())
      .post("/event")
      .send({ ...createEventRequest, eventName: newEventName });
    const conflictResponsePromise = request(app.getHttpServer())
      .post("/event")
      .send({ ...createEventRequest, eventName: newEventName });

    const [successfulResponse, conflictResponse] = await Promise.all([
      successfulResponsePromise,
      conflictResponsePromise,
    ]);

    expect(successfulResponse.status).toEqual(201);
    expect(conflictResponse.status).toEqual(409);
    expect(conflictResponse.body).toEqual({
      error: "Conflict",
      message: `another process is already handling the resource -${EventManager.generateEventKey(newEventName)}-`,
      statusCode: 409,
    });
  });
});
