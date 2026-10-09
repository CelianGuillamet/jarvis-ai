import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PublicEndpoint } from '../auth/public-endpoint';
import { PrismaService } from '../prisma/prisma.service';
import { mutationsSuspended } from './mutation-kill-switch';
import { currentAlerts } from './ops-monitor.service';

/** Liveness and readiness expose states and alert codes only, never counters or content. */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @PublicEndpoint()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @PublicEndpoint()
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Base de données indisponible.');
    }
    return {
      status: 'ok',
      database: 'ok',
      mutations: mutationsSuspended() ? 'suspended' : 'enabled',
      alerts: currentAlerts().map((alert) => alert.code),
    };
  }
}
