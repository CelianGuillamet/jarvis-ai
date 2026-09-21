import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { configureDevelopmentAssets } from './configure-development-assets';

@Module({})
class TestModule {}

describe('developer assets', () => {
  it.each(['production', 'test', 'staging', ''])(
    'does not register developer assets in %s',
    (environment) => {
      const useStaticAssets = jest.fn();
      configureDevelopmentAssets({ useStaticAssets }, environment);
      expect(useStaticAssets).not.toHaveBeenCalled();
    },
  );

  it.each(['production', 'development'])(
    'serves assets only in explicit development: %s',
    async (environment) => {
      const app = await NestFactory.create<NestExpressApplication>(TestModule, {
        logger: false,
      });
      try {
        configureDevelopmentAssets(app, environment);
        await app.init();
        const server = app.getHttpServer() as Parameters<typeof request>[0];
        for (const asset of [
          'jarvis-dev.html',
          'jarvis-dev.js',
          'jarvis-dev.css',
        ]) {
          await request(server)
            .get(`/dev/${asset}`)
            .expect(environment === 'development' ? 200 : 404);
        }
      } finally {
        await app.close();
      }
    },
  );
});
