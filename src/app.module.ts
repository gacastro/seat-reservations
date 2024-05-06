import { Module } from "@nestjs/common";
import { EventController } from "./event.controller";
import { ImplementationFor } from "./di.constants";
import { EventManager } from "./event.manager";
import { ConfigModule } from "@nestjs/config";
import { RedisManager } from "./redisManager";
import * as Joi from "joi";
import { AppLogger } from "./app.logger";

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().default("dev"),
        REDIS_PATH: Joi.string().required(),
        LOCK_EXPIRATION_MILLISECONDS: Joi.number().required().integer().min(1),
        HOLD_SEAT_EXPIRATION_MILLISECONDS: Joi.number()
          .required()
          .integer()
          .min(1),
      }),
    }),
  ],
  controllers: [EventController],
  providers: [
    {
      provide: ImplementationFor.IManageEvents,
      useClass: EventManager,
    },
    {
      provide: ImplementationFor.IAmRepository,
      useClass: RedisManager,
    },
    {
      provide: ImplementationFor.ILogInformation,
      useClass: AppLogger,
    },
  ],
})
export class AppModule {}
