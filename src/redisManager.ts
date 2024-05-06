import Redis, { Result } from "ioredis";
import { ConfigService } from "@nestjs/config";
import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import {
  EventProperties,
  IAmRepository,
  ILogInformation,
  KeyConstantFor,
  KeyDelimiter,
  LogContext,
  LogTarget,
  LogType,
} from "./definitions";
import { v4 as uuidv4 } from "uuid";
import { ImplementationFor } from "./di.constants";

declare module "ioredis" {
  interface RedisCommander<Context> {
    deleteIfValueMatches(key: string, match: string): Result<number, Context>;
  }
}

@Injectable()
export class RedisManager implements IAmRepository {
  private readonly name = "RedisManager";
  private readonly redis;
  private readonly lockExpiration: number;
  private readonly holdSeatExpiration: number;

  private readonly luaScript = `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
    else
        return 0
    end
  `;

  constructor(
    @Inject(ImplementationFor.ILogInformation)
    private readonly logger: ILogInformation,
    configService: ConfigService,
  ) {
    const redisPath = configService.get<string>("REDIS_PATH");
    this.lockExpiration = configService.get<number>(
      "LOCK_EXPIRATION_MILLISECONDS",
    )!;
    this.holdSeatExpiration = configService.get<number>(
      "HOLD_SEAT_EXPIRATION_MILLISECONDS",
    )!;

    this.redis = new Redis(redisPath!);
    this.redis.defineCommand("deleteIfValueMatches", {
      numberOfKeys: 1,
      lua: this.luaScript,
    });
  }

  async eventExists(key: string): Promise<boolean> {
    //more performant than redis.exists() its O(1) vs O(n)
    return !!(await this.redis.hexists(key, EventProperties.EventName));
  }

  async createEvent(
    key: string,
    eventName: string,
    numberOfSeats: number,
    numberOfSeatsUserCanHoldPerEvent: number,
  ): Promise<void> {
    await this.redis.hset(
      key,
      EventProperties.EventName,
      eventName,
      EventProperties.NumberOfSeats,
      numberOfSeats,
      EventProperties.NumberOfSeatsUserCanHoldPerEvent,
      numberOfSeatsUserCanHoldPerEvent,
    );
  }

  async setAvailableSeat(
    availableSeatsKey: string,
    seatKey: string,
  ): Promise<void> {
    await this.redis.sadd(availableSeatsKey, seatKey);
  }

  async getAvailableSeats(key: string): Promise<string[]> {
    return this.redis.smembers(key);
  }

  async getSeatsBeingHeld(key: string): Promise<string[]> {
    return await this.redis.smembers(key);
  }

  async addSeatToUsersSeats(key: string, seatId: string): Promise<void> {
    await this.redis.sadd(key, seatId);
  }

  async saveHeldSeat(key: string, userId: string): Promise<number> {
    const expiration = new Date(Date.now() + this.holdSeatExpiration).getTime();
    const savedHeldSeat = await this.redis.set(
      key,
      userId,
      "PX",
      expiration,
      "NX",
    );

    const saved = savedHeldSeat && savedHeldSeat === "OK";

    if (!saved) {
      const errorMessage = `something went terribly wrong. seat -${key}- could not be saved`;
      const errorContext: LogContext = {
        type: LogType.WrongConfiguration,
        target: LogTarget.Seat,
      };
      this.logger.error(errorMessage, this.name, errorContext);
      throw new InternalServerErrorException(errorMessage);
    }

    return expiration;
  }

  async isAvailableSeat(key: string, seatId: string): Promise<boolean> {
    return !!(await this.redis.sismember(key, seatId));
  }

  async isHeldSeat(key: string, seatId: string): Promise<boolean> {
    return !!(await this.redis.sismember(key, seatId));
  }

  async getHeldSeat(key: string): Promise<string> {
    const heldSeat = await this.redis.get(key);
    return heldSeat ?? "";
  }

  async removeSeatFromUserHeldSeats(
    key: string,
    seatId: string,
  ): Promise<void> {
    await this.redis.srem(key, seatId);
  }

  async moveSeat(from: string, to: string, seat: string): Promise<number> {
    return await this.redis.smove(from, to, seat);
  }

  private generateLockKey(key: string): string {
    return `${KeyConstantFor.Lock}${KeyDelimiter}${key}`;
  }

  async getLock(key: string, logTarget: LogTarget): Promise<string> {
    const lockHolderId: string = uuidv4();

    const redisLock = await this.redis.set(
      this.generateLockKey(key),
      lockHolderId,
      "PX",
      this.lockExpiration,
      "NX",
    );

    const lockAcquired = redisLock && redisLock === "OK";

    if (!lockAcquired) {
      const errorMessage = `another process is already handling the resource -${key}-`;
      const errorContext: LogContext = {
        type: LogType.UnavailableLock,
        target: logTarget,
      };
      this.logger.error(errorMessage, this.name, errorContext);
      throw new ConflictException(errorMessage);
    }

    return lockHolderId;
  }

  async getAmountSeatsUserCanHold(eventId: string): Promise<number> {
    const heldSeatsPerUser = await this.redis.hget(
      eventId,
      EventProperties.NumberOfSeatsUserCanHoldPerEvent,
    );

    if (!heldSeatsPerUser) {
      const errorMessage = `something went terribly wrong. event -${eventId}- has no amount of seats a user can hold`;
      const errorContext: LogContext = {
        type: LogType.WrongConfiguration,
        target: LogTarget.Event,
      };
      this.logger.error(errorMessage, this.name, errorContext);
      throw new InternalServerErrorException(errorMessage);
    }

    return Number(heldSeatsPerUser);
  }

  async releaseLock(key: string, lockHolderId: string): Promise<void> {
    const result = await this.redis.deleteIfValueMatches(
      this.generateLockKey(key),
      lockHolderId,
    );

    // processes will get paused and when they resume, lock previously held has been reassigned,
    // but it's okay, just means a concurrency happened and we should flag it to take metrics
    if (result === 0) {
      this.logger.info(
        `lock for ${key} has been taken by another process`,
        this.name,
      );
    }
  }

  async getSeatsUserIsHolding(key: string): Promise<string[]> {
    return await this.redis.smembers(key);
  }

  async removeHeldSeat(key: string): Promise<void> {
    //more performant than redis.del() its O(1) vs O(n)
    await this.redis.getdel(key);
  }

  async removeSeatFromSeatsBeingHeld(
    key: string,
    seatId: string,
  ): Promise<void> {
    await this.redis.srem(key, seatId);
  }
}
