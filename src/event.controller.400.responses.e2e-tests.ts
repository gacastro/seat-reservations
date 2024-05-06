import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { CreateEventRequest, SeatRequest } from "./definitions";
import * as request from "supertest";

describe("When I call the event endpoint", () => {
  let app: INestApplication;
  const eventId = "event#event-name";
  const userId = "550e8400-e29b-41d4-a716-446655440000";
  const generateBigString = (length: number) => {
    let bigString = "";
    let isEven = false;

    for (let i = 0; i < length; i++) {
      isEven = i % 2 === 0;
      bigString += isEven ? "a" : "b";
    }

    return bigString;
  };

  beforeAll(async () => {
    const testingModule: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = testingModule.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());

    await app.init();
  });

  describe("to create an event", () => {
    it.each([
      "",
      "   ",
      undefined,
      null,
      {},
      [],
      3,
      "as",
      "@£%",
      generateBigString(101),
    ])(
      `should return 400 when "%s" is passed in as the event name`,
      (invalidName: string) => {
        const body: CreateEventRequest = {
          eventName: invalidName,
          numberOfSeats: 10,
          numberOfSeatsUserCanHoldPerEvent: 2,
        };

        return request(app.getHttpServer())
          .post("/event")
          .send(body)
          .expect(400);
      },
    );

    it.each(["string", undefined, null, {}, [], -12, 1001, 9, 1.2])(
      `should return 400 when "%s" is passed in as a seat capacity`,
      (invalidNumber: number) => {
        const body: CreateEventRequest = {
          eventName: "event name",
          numberOfSeats: invalidNumber,
          numberOfSeatsUserCanHoldPerEvent: 2,
        };

        return request(app.getHttpServer())
          .post("/event")
          .send(body)
          .expect(400);
      },
    );

    it.each(["string", undefined, null, {}, [], -12, 1001, 0, 1.2])(
      `should return 400 when "%s" is passed in as the number of seats a user can held per event`,
      (invalidNumber: number) => {
        const body: CreateEventRequest = {
          eventName: "event name",
          numberOfSeats: 15,
          numberOfSeatsUserCanHoldPerEvent: invalidNumber,
        };

        return request(app.getHttpServer())
          .post("/event")
          .send(body)
          .expect(400);
      },
    );
  });

  describe("to list available seats for an event", () => {
    it.each(["as", "@£%", generateBigString(101)])(
      `should return 400 when "%s" is passed in as the event id`,
      (invalidEventId: string) => {
        return request(app.getHttpServer())
          .get(`/event/${invalidEventId}`)
          .expect(400);
      },
    );
  });

  describe("to hold a seat for a specific user", () => {
    it.each(["as", "@£%", generateBigString(101)])(
      `should return 400 when "%s" is passed in as the event id`,
      (invalidEventId: string) => {
        return request(app.getHttpServer())
          .post(`/event/${invalidEventId}/seats/hold`)
          .expect(400);
      },
    );

    it.each([
      undefined,
      null,
      {},
      3,
      [],
      "not close to an UUIDv4",
      "550e8400-e29b-31d4-a716-446655440000",
    ])(
      `should return 400 when "%s" is passed in as the user id`,
      (invalidUserId: string) => {
        const body: SeatRequest = {
          userId: invalidUserId,
          seatId: "42",
        };
        return request(app.getHttpServer())
          .post(`/event/${encodeURIComponent(eventId)}/seats/hold`)
          .send(body)
          .expect(400);
      },
    );

    it.each(["as", "@£%", generateBigString(101)])(
      `should return 400 when "%s" is passed in as the seat number`,
      (invalidSeatNumber: string) => {
        const body: SeatRequest = {
          userId: userId,
          seatId: invalidSeatNumber,
        };
        return request(app.getHttpServer())
          .post(`/event/${encodeURIComponent(eventId)}/seats/hold`)
          .send(body)
          .expect(400);
      },
    );
  });

  describe("to refresh the hold a specific user has on a seat", () => {
    it.each(["as", "@£%", generateBigString(101)])(
      `should return 400 when "%s" is passed in as the event id`,
      (invalidEventId: string) => {
        return request(app.getHttpServer())
          .patch(`/event/${invalidEventId}/seats/hold`)
          .expect(400);
      },
    );

    it.each([
      undefined,
      null,
      {},
      3,
      [],
      "not close to an UUIDv4",
      "550e8400-e29b-31d4-a716-446655440000",
    ])(
      `should return 400 when "%s" is passed in as the user id`,
      (invalidUserId: string) => {
        const body: SeatRequest = {
          userId: invalidUserId,
          seatId: "42",
        };
        return request(app.getHttpServer())
          .patch(`/event/${encodeURIComponent(eventId)}/seats/hold`)
          .send(body)
          .expect(400);
      },
    );

    it.each(["as", "@£%", generateBigString(101)])(
      `should return 400 when "%s" is passed in as the seat number`,
      (invalidSeatNumber: string) => {
        const body: SeatRequest = {
          userId: userId,
          seatId: invalidSeatNumber,
        };
        return request(app.getHttpServer())
          .patch(`/event/${encodeURIComponent(eventId)}/seats/hold`)
          .send(body)
          .expect(400);
      },
    );
  });

  describe("to reserve a seat for a specific user", () => {
    it.each(["as", "@£%", generateBigString(101)])(
      `should return 400 when "%s" is passed in as the event id`,
      (invalidEventId: string) => {
        return request(app.getHttpServer())
          .post(`/event/${invalidEventId}/seats/reserve`)
          .expect(400);
      },
    );

    it.each([
      undefined,
      null,
      {},
      3,
      [],
      "not close to an UUIDv4",
      "550e8400-e29b-31d4-a716-446655440000",
    ])(
      `should return 400 when "%s" is passed in as the user id`,
      (invalidUserId: string) => {
        const body: SeatRequest = {
          userId: invalidUserId,
          seatId: "42",
        };
        return request(app.getHttpServer())
          .post(`/event/${encodeURIComponent(eventId)}/seats/reserve`)
          .send(body)
          .expect(400);
      },
    );

    it.each(["as", "@£%", generateBigString(101)])(
      `should return 400 when "%s" is passed in as the seat number`,
      (invalidSeatNumber: string) => {
        const body: SeatRequest = {
          userId: userId,
          seatId: invalidSeatNumber,
        };
        return request(app.getHttpServer())
          .post(`/event/${encodeURIComponent(eventId)}/seats/reserve`)
          .send(body)
          .expect(400);
      },
    );
  });
});
