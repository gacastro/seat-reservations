import { Injectable, Logger } from "@nestjs/common";
import { ILogInformation } from "./definitions";

@Injectable()
export class AppLogger implements ILogInformation {
  error(description: string, whereItHappened: string, details?: unknown): void {
    Logger.error(this.buildLogMessage(description, details), whereItHappened);
  }

  info(description: string, whereItHappened: string, details?: unknown): void {
    Logger.log(this.buildLogMessage(description, details), whereItHappened);
  }

  private buildLogMessage(description: string, details: unknown): string {
    const detailsAsString = details
      ? this.getDetailsAsString(details)
      : "no details";

    return JSON.stringify({ description, details: detailsAsString });
  }

  private getDetailsAsString(details: unknown) {
    let result: string;
    try {
      result = JSON.stringify(details);
    } catch (exception) {
      result = "an error occurred while trying to stringify the details object";
    }

    return result;
  }
}
