import {
  IAmRepository,
  ILogInformation,
  IManageEvents,
  KeyConstantFor,
  KeyDelimiter,
  LogContext,
  LogTarget,
  LogType,
} from "./definitions";
import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { ImplementationFor } from "./di.constants";

@Injectable()
export class EventManager implements IManageEvents {
  private name = "EventManager";

  constructor(
    @Inject(ImplementationFor.IAmRepository)
    private readonly repository: IAmRepository,
    @Inject(ImplementationFor.ILogInformation)
    private readonly logger: ILogInformation,
  ) {}

  static generateEventKey(eventName: string): string {
    return `${KeyConstantFor.Event}${KeyDelimiter}${eventName}`;
  }

  static generateSeatKey(eventName: string, seatNumber: string): string {
    return `${KeyConstantFor.Seat}${KeyDelimiter}${eventName}${KeyDelimiter}${seatNumber}`;
  }

  static generateHeldSeatKey(seatKey: string): string {
    return `${seatKey}${KeyDelimiter}${KeyConstantFor.HeldSeat}`;
  }

  static generateKeyForAvailableSeats(eventKey: string): string {
    return `${eventKey}${KeyDelimiter}${KeyConstantFor.AvailableSeats}`;
  }

  static generateKeyForSeatsBeingHeld(eventKey: string): string {
    return `${eventKey}${KeyDelimiter}${KeyConstantFor.SeatsBeingHeld}`;
  }

  static generateKeyForSeatsUserIsHolding(
    userId: string,
    eventId: string,
  ): string {
    return `${userId}${KeyDelimiter}${eventId}${KeyDelimiter}${KeyConstantFor.SeatsBeingHeld}`;
  }

  static generateLockKeyForSameUser(userId: string, eventId: string): string {
    return `${userId}${KeyDelimiter}${eventId}${KeyDelimiter}${KeyConstantFor.LockForWriting}`;
  }

  static generateLockKeyForHeldSeat(seatId: string): string {
    return `${seatId}${KeyDelimiter}${KeyConstantFor.LockForWriting}`;
  }

  async createEvent(
    eventName: string,
    numberOfSeats: number,
    numberOfSeatsUserCanHoldPerEvent: number,
  ): Promise<string> {
    const eventKey = EventManager.generateEventKey(eventName);

    await this.throwIfEventExists(eventKey);

    const lockHolderId = await this.repository.getLock(
      eventKey,
      LogTarget.Event,
    );
    await this.repository.createEvent(
      eventKey,
      eventName,
      numberOfSeats,
      numberOfSeatsUserCanHoldPerEvent,
    );
    await this.repository.releaseLock(eventKey, lockHolderId);

    const seatCreationPromises = [];
    for (let seatNumber = 0; seatNumber < numberOfSeats; seatNumber++) {
      seatCreationPromises.push(
        this.setAvailableSeat(eventKey, eventName, seatNumber.toString()),
      );
    }

    await Promise.all(seatCreationPromises);

    return eventKey;
  }

  private async setAvailableSeat(
    eventKey: string,
    eventName: string,
    seatNumber: string,
  ) {
    const seatKey = EventManager.generateSeatKey(
      eventName,
      seatNumber.toString(),
    );
    const lockHolderId = await this.repository.getLock(seatKey, LogTarget.Seat);
    await this.repository.setAvailableSeat(
      EventManager.generateKeyForAvailableSeats(eventKey),
      seatKey,
    );
    await this.repository.releaseLock(seatKey, lockHolderId);
  }

  private async throwIfEventExists(eventKey: string): Promise<void> {
    const eventExists = await this.repository.eventExists(eventKey);
    if (eventExists) {
      const errorMessage = `Event under key -${eventKey}- already exists`;
      const errorContext: LogContext = {
        type: LogType.Duplicate,
        target: LogTarget.Event,
      };
      this.logger.error(errorMessage, this.name, errorContext);
      throw new ConflictException(errorMessage);
    }
  }

  async listAvailableSeats(eventKey: string): Promise<string[]> {
    await this.throwIfEventNotFound(eventKey);

    const keyForAvailableSeats =
      EventManager.generateKeyForAvailableSeats(eventKey);
    const availableSeats =
      await this.repository.getAvailableSeats(keyForAvailableSeats);

    const keyForSeatsBeingHeld =
      EventManager.generateKeyForSeatsBeingHeld(eventKey);
    const heldSeats =
      await this.repository.getSeatsBeingHeld(keyForSeatsBeingHeld);

    let heldSeat: string;
    await Promise.all(
      heldSeats.map(async (seat) => {
        heldSeat = await this.repository.getHeldSeat(
          EventManager.generateHeldSeatKey(seat),
        );
        if (!heldSeat) {
          await this.repository.moveSeat(
            keyForSeatsBeingHeld,
            keyForAvailableSeats,
            seat,
          );
          availableSeats.push(seat);
        }
      }),
    );

    return availableSeats;
  }

  private async throwIfEventNotFound(eventKey: string): Promise<void> {
    const eventExists = await this.repository.eventExists(eventKey);
    if (!eventExists) {
      const errorMessage = `Event under key -${eventKey}- was not found`;
      const errorContext: LogContext = {
        type: LogType.NotFound,
        target: LogTarget.Event,
      };
      this.logger.error(errorMessage, this.name, errorContext);
      throw new NotFoundException(errorMessage);
    }
  }

  async holdSeat(
    eventId: string,
    userId: string,
    seatId: string,
  ): Promise<number> {
    await this.throwIfSeatDoesntExist(eventId, seatId);

    // to prevent the success of two concurrent requests from the same user but for different seats
    const sameUserKey = EventManager.generateLockKeyForSameUser(
      userId,
      eventId,
    );
    const sameUserLockId = await this.repository.getLock(
      sameUserKey,
      LogTarget.User,
    );

    const seatsUserIsHolding = await this.repository.getSeatsUserIsHolding(
      EventManager.generateKeyForSeatsUserIsHolding(userId, eventId),
    );
    const totalSeatsUserCanHold =
      await this.repository.getAmountSeatsUserCanHold(eventId);

    if (seatsUserIsHolding.length < totalSeatsUserCanHold) {
      const timeSeatIsBeingHeldFor = await this.actuallyHoldSeat(
        seatId,
        eventId,
        userId,
      );
      await this.repository.releaseLock(sameUserKey, sameUserLockId);
      return timeSeatIsBeingHeldFor;
    }

    let allowedToHoldNewSeat = false;
    await Promise.all(
      seatsUserIsHolding.map(async (seat) => {
        const heldSeat = await this.repository.getHeldSeat(
          EventManager.generateHeldSeatKey(seat),
        );
        if (!heldSeat) {
          allowedToHoldNewSeat = true;
          await this.repository.removeSeatFromUserHeldSeats(
            EventManager.generateKeyForSeatsUserIsHolding(userId, eventId),
            seat,
          );
        }
      }),
    );

    if (!allowedToHoldNewSeat) {
      await this.repository.releaseLock(sameUserKey, sameUserLockId);
      this.logAndThrowException(
        new ConflictException(`user ${userId} cannot hold more seats`),
        LogType.MaxCapacity,
        LogTarget.Seat,
      );
    }

    const timeSeatIsBeingHeldFor = await this.actuallyHoldSeat(
      seatId,
      eventId,
      userId,
    );
    await this.repository.releaseLock(sameUserKey, sameUserLockId);

    return timeSeatIsBeingHeldFor;
  }

  private async actuallyHoldSeat(
    seatId: string,
    eventId: string,
    userId: string,
  ): Promise<number> {
    const heldSeatKey = EventManager.generateHeldSeatKey(seatId);
    const heldSeat = await this.repository.getHeldSeat(heldSeatKey);

    if (heldSeat) {
      this.logAndThrowException(
        new ConflictException(`Seat -${seatId}- is no longer available`),
        LogType.UnavailableSeat,
        LogTarget.Seat,
      );
    }

    const lockKeyForHeldSeat = EventManager.generateLockKeyForHeldSeat(seatId);
    const heldSeatLockId = await this.repository.getLock(
      lockKeyForHeldSeat,
      LogTarget.Seat,
    );

    const holdSeatExpiration = await this.repository.saveHeldSeat(
      heldSeatKey,
      userId,
    );

    const totalMoved = await this.repository.moveSeat(
      EventManager.generateKeyForAvailableSeats(eventId),
      EventManager.generateKeyForSeatsBeingHeld(eventId),
      seatId,
    );
    if (totalMoved === 0) {
      this.logAndThrowException(
        new InternalServerErrorException(
          `something went terribly wrong. seat -${seatId}- was not under the available seats`,
        ),
        LogType.WrongConfiguration,
        LogTarget.Seat,
      );
    }

    await this.repository.addSeatToUsersSeats(
      EventManager.generateKeyForSeatsUserIsHolding(userId, eventId),
      seatId,
    );

    await this.repository.releaseLock(lockKeyForHeldSeat, heldSeatLockId);

    return holdSeatExpiration;
  }

  private async throwIfSeatDoesntExist(
    eventId: string,
    seatId: string,
  ): Promise<void> {
    const isAvailableSeat = await this.repository.isAvailableSeat(
      EventManager.generateKeyForAvailableSeats(eventId),
      seatId,
    );
    const isHeldSeat = await this.repository.isHeldSeat(
      EventManager.generateKeyForSeatsBeingHeld(eventId),
      seatId,
    );

    if (!isAvailableSeat && !isHeldSeat) {
      this.logAndThrowException(
        new NotFoundException(`Seat under key -${seatId}- was not found`),
        LogType.NotFound,
        LogTarget.Event,
      );
    }
  }

  private logAndThrowException(
    exception: HttpException,
    logType: LogType,
    logTarget: LogTarget,
  ): void {
    this.logger.error(exception.message, this.name, {
      type: logType,
      target: logTarget,
    });
    throw exception;
  }

  async refreshHoldSeat(
    eventId: string,
    userId: string,
    seatId: string,
  ): Promise<number> {
    await this.throwIfSeatDoesntExist(eventId, seatId);

    const heldSeatId = EventManager.generateHeldSeatKey(seatId);
    const heldSeat = await this.repository.getHeldSeat(heldSeatId);

    if (!heldSeat || heldSeat !== userId) {
      this.logAndThrowException(
        new ConflictException(
          `seat -${seatId}- is no longer being held. cannot be reserved anymore`,
        ),
        LogType.UnavailableSeat,
        LogTarget.Seat,
      );
    }

    const lockKeyForHeldSeat = EventManager.generateLockKeyForHeldSeat(seatId);
    const heldSeatLockId = await this.repository.getLock(
      lockKeyForHeldSeat,
      LogTarget.Seat,
    );

    await this.repository.removeHeldSeat(heldSeatId);
    const timeSeatIsBeingHeldFor = await this.repository.saveHeldSeat(
      heldSeatId,
      userId,
    );

    await this.repository.releaseLock(lockKeyForHeldSeat, heldSeatLockId);

    return timeSeatIsBeingHeldFor;
  }

  async reserveSeat(
    eventId: string,
    userId: string,
    seatId: string,
  ): Promise<void> {
    await this.throwIfSeatDoesntExist(eventId, seatId);

    const heldSeatId = EventManager.generateHeldSeatKey(seatId);
    const heldSeat = await this.repository.getHeldSeat(heldSeatId);

    if (!heldSeat || heldSeat !== userId) {
      this.logAndThrowException(
        new ConflictException(
          `seat -${seatId}- is no longer being held. cannot be reserved anymore`,
        ),
        LogType.UnavailableSeat,
        LogTarget.Seat,
      );
    }

    const lockKeyForHeldSeat = EventManager.generateLockKeyForHeldSeat(seatId);
    const heldSeatLockId = await this.repository.getLock(
      lockKeyForHeldSeat,
      LogTarget.Seat,
    );

    await this.repository.removeHeldSeat(heldSeatId);
    await this.repository.removeSeatFromSeatsBeingHeld(
      EventManager.generateKeyForSeatsBeingHeld(eventId),
      seatId,
    );
    await this.repository.removeSeatFromUserHeldSeats(
      EventManager.generateKeyForSeatsUserIsHolding(userId, eventId),
      seatId,
    );

    await this.repository.releaseLock(lockKeyForHeldSeat, heldSeatLockId);
  }
}
