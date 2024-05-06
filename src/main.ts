import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());

  const configService = app.get(ConfigService);
  const nodeEnv = configService.get("NODE_ENV");

  if (nodeEnv !== "prod") {
    const config = new DocumentBuilder()
      .setTitle("Seat reservation service")
      .setDescription("REST API service to manage an event seat reservation")
      .setVersion("1.0")
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api", app, document);
  }

  await app.listen(3000);
}
// noinspection JSIgnoredPromiseFromCall
bootstrap();
