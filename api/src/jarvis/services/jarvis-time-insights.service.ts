import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type TimeInsightRecord = {
  id: string;
  metricName: string;
  value: number;
  unit: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
};

export type TimeSummary = {
  period: string;
  metrics: Record<
    string,
    { total: number; avg: number; unit: string; count: number }
  >;
  productivityScore: number;
};

@Injectable()
export class JarvisTimeInsightsService {
  private readonly logger = new Logger(JarvisTimeInsightsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    sessionId: string,
    input: {
      metricName: string;
      value: number;
      unit?: string;
      period?: string;
      periodStart?: Date;
      periodEnd?: Date;
    },
  ): Promise<TimeInsightRecord | null> {
    try {
      const now = new Date();
      const period = input.period ?? 'day';
      const periodStart = input.periodStart ?? this.getPeriodStart(now, period);
      const periodEnd = input.periodEnd ?? this.getPeriodEnd(now, period);

      const row = await this.prisma.jarvisTimeInsight.create({
        data: {
          sessionId,
          metricName: input.metricName,
          value: input.value,
          unit: input.unit ?? 'minutes',
          period,
          periodStart,
          periodEnd,
        },
      });

      return this.map(row);
    } catch (error) {
      this.logger.error(
        `Failed to record time insight for ${sessionId}: ${error}`,
      );
      return null;
    }
  }

  async summary(
    sessionId: string,
    options?: { period?: string; limit?: number },
  ): Promise<TimeSummary> {
    try {
      const period = options?.period ?? 'week';
      const limit = options?.limit ?? 100;

      const now = new Date();
      const since = this.getPeriodStart(now, period);

      const rows = await this.prisma.jarvisTimeInsight.findMany({
        where: {
          sessionId,
          periodStart: { gte: since },
        },
        orderBy: { periodStart: 'desc' },
        take: limit,
      });

      const metrics: TimeSummary['metrics'] = {};
      for (const row of rows) {
        if (!metrics[row.metricName]) {
          metrics[row.metricName] = {
            total: 0,
            avg: 0,
            unit: row.unit,
            count: 0,
          };
        }
        metrics[row.metricName].total += row.value;
        metrics[row.metricName].count += 1;
      }

      for (const key of Object.keys(metrics)) {
        const m = metrics[key];
        m.avg = m.count > 0 ? m.total / m.count : 0;
      }

      const productivityScore = this.computeProductivityScore(metrics);

      return { period, metrics, productivityScore };
    } catch (error) {
      this.logger.warn(`Failed to get time summary for ${sessionId}: ${error}`);
      return {
        period: options?.period ?? 'week',
        metrics: {},
        productivityScore: 0,
      };
    }
  }

  async buildPromptContext(sessionId: string): Promise<string> {
    const s = await this.summary(sessionId, { period: 'week' });
    if (!Object.keys(s.metrics).length) return '';

    const lines = [
      `Insights temporels (semaine) — score productivité: ${s.productivityScore.toFixed(0)}/100:`,
    ];
    for (const [name, m] of Object.entries(s.metrics)) {
      lines.push(
        `- ${name}: total ${m.total.toFixed(0)} ${m.unit}, moy ${m.avg.toFixed(0)} ${m.unit}`,
      );
    }
    return lines.join('\n');
  }

  private computeProductivityScore(metrics: TimeSummary['metrics']): number {
    let score = 50;
    const focused = metrics['focus_time']?.total ?? 0;
    const breaks = metrics['break_time']?.total ?? 0;
    const tasks = metrics['tasks_completed']?.total ?? 0;

    if (focused > 0) score += Math.min(focused / 60, 25);
    if (breaks > 0 && focused > 0) {
      const ratio = breaks / focused;
      if (ratio >= 0.1 && ratio <= 0.3) score += 10;
    }
    if (tasks > 0) score += Math.min(tasks * 2, 15);

    return Math.min(Math.max(score, 0), 100);
  }

  private getPeriodStart(date: Date, period: string): Date {
    const d = new Date(date);
    switch (period) {
      case 'day':
        d.setHours(0, 0, 0, 0);
        break;
      case 'week':
        d.setDate(d.getDate() - d.getDay());
        d.setHours(0, 0, 0, 0);
        break;
      case 'month':
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        break;
      default:
        d.setHours(0, 0, 0, 0);
    }
    return d;
  }

  private getPeriodEnd(date: Date, period: string): Date {
    const start = this.getPeriodStart(date, period);
    const end = new Date(start);
    switch (period) {
      case 'day':
        end.setDate(end.getDate() + 1);
        break;
      case 'week':
        end.setDate(end.getDate() + 7);
        break;
      case 'month':
        end.setMonth(end.getMonth() + 1);
        break;
      default:
        end.setDate(end.getDate() + 1);
    }
    return end;
  }

  private map(row: any): TimeInsightRecord {
    return {
      id: row.id,
      metricName: row.metricName,
      value: row.value,
      unit: row.unit,
      period: row.period,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
