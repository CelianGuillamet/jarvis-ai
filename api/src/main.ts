import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { configureDevelopmentAssets } from './configure-development-assets';
import { configureAuth } from './auth/configure-auth';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttpSafety } from './http/configure-http-safety';
import { RuntimeConfigurationError } from './config/runtime-config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  configureHttpSafety(app);
  await configureAuth(app);
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
  // Transport errors can include credential-bearing URLs or provider payloads.
  console.error(
    error instanceof RuntimeConfigurationError
      ? error.message
      : 'API startup failed.',
  );
  process.exitCode = 1;
});
