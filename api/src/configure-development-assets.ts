import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';

export function configureDevelopmentAssets(
  app: Pick<NestExpressApplication, 'useStaticAssets'>,
  environment = process.env.NODE_ENV,
) {
  if (environment !== 'development') return;
  app.useStaticAssets(join(process.cwd(), 'public'), { prefix: '/dev/' });
}
