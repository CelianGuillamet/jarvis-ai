import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { configureDevelopmentAssets } from './configure-development-assets';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors();
  configureDevelopmentAssets(app);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip les champs non définis dans les DTO
      forbidNonWhitelisted: true, // rejette les requêtes avec des champs inconnus
      transform: true, // transforme les payloads en instances de classes DTO
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((error: unknown) => {
  console.error('API startup failed', error);
  process.exitCode = 1;
});
