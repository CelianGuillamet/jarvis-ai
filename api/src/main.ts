import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors();
  app.useStaticAssets(join(process.cwd(), 'public'), {
    prefix: '/dev/',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip les champs non définis dans les DTO
      forbidNonWhitelisted: true, // rejette les requêtes avec des champs inconnus
      transform: true, // transforme les payloads en instances de classes DTO
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
