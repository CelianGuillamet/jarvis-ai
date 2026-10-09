import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HealthController } from './health.controller';
import { OpsMonitorService } from './ops-monitor.service';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [OpsMonitorService],
})
export class OpsModule {}
