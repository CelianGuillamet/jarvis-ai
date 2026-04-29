import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type PredictiveMetricRecord = {
  id: string;
  sessionId: string;
  metricType: string;
  historicalData: number[];
  forecast: number[];
  accuracy: number;
  forecastedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type TrendAnalysis = {
  metricType: string;
  direction: 'up' | 'down' | 'stable';
  changePercent: number;
  recentAverage: number;
  historicalAverage: number;
};

@Injectable()
export class JarvisPredictiveAnalyticsService {
  private readonly logger = new Logger(JarvisPredictiveAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async saveForecast(
    sessionId: string,
    metricType: string,
    historicalData: number[],
    forecast: number[],
    accuracy: number = 0.0,
  ): Promise<PredictiveMetricRecord | null> {
    try {
      const metric = await this.prisma.jarvisPredictiveMetric.create({
        data: {
          sessionId,
          metricType: metricType.toLowerCase(),
          historicalData: JSON.stringify(historicalData),
          forecast: JSON.stringify(forecast),
          accuracy,
          forecastedAt: new Date(),
        },
      });

      return this.mapMetricRecord(metric);
    } catch (error) {
      this.logger.error(`Failed to save forecast for ${metricType}: ${error}`);
      return null;
    }
  }

  async getLatestForecast(
    sessionId: string,
    metricType: string,
  ): Promise<PredictiveMetricRecord | null> {
    try {
      const metric = await this.prisma.jarvisPredictiveMetric.findFirst({
        where: {
          sessionId,
          metricType: metricType.toLowerCase(),
        },
        orderBy: { forecastedAt: 'desc' },
      });

      return metric ? this.mapMetricRecord(metric) : null;
    } catch (error) {
      this.logger.error(`Failed to get forecast for ${metricType}: ${error}`);
      return null;
    }
  }

  async analyzeHistoricalTrend(
    sessionId: string,
    metricType: string,
  ): Promise<TrendAnalysis | null> {
    try {
      const latest = await this.getLatestForecast(sessionId, metricType);
      if (!latest || latest.historicalData.length < 2) return null;

      const data = latest.historicalData;
      const midpoint = Math.floor(data.length / 2);
      const historicalHalf = data.slice(0, midpoint);
      const recentHalf = data.slice(midpoint);

      const avg = (arr: number[]) =>
        arr.reduce((sum, v) => sum + v, 0) / arr.length;

      const historicalAverage = avg(historicalHalf);
      const recentAverage = avg(recentHalf);

      const changePercent =
        historicalAverage !== 0
          ? ((recentAverage - historicalAverage) /
              Math.abs(historicalAverage)) *
            100
          : 0;

      let direction: 'up' | 'down' | 'stable';
      if (Math.abs(changePercent) < 5) {
        direction = 'stable';
      } else if (changePercent > 0) {
        direction = 'up';
      } else {
        direction = 'down';
      }

      return {
        metricType: latest.metricType,
        direction,
        changePercent: Math.round(changePercent * 10) / 10,
        recentAverage: Math.round(recentAverage * 100) / 100,
        historicalAverage: Math.round(historicalAverage * 100) / 100,
      };
    } catch (error) {
      this.logger.error(`Failed to analyze trend for ${metricType}: ${error}`);
      return null;
    }
  }

  async listForecasts(
    sessionId: string,
    metricType?: string,
  ): Promise<PredictiveMetricRecord[]> {
    try {
      const metrics = await this.prisma.jarvisPredictiveMetric.findMany({
        where: {
          sessionId,
          ...(metricType ? { metricType: metricType.toLowerCase() } : {}),
        },
        orderBy: { forecastedAt: 'desc' },
        take: 20,
      });

      return metrics.map((m) => this.mapMetricRecord(m));
    } catch (error) {
      this.logger.error(`Failed to list forecasts for ${sessionId}: ${error}`);
      return [];
    }
  }

  async buildPromptContext(sessionId: string): Promise<string> {
    try {
      const metrics = await this.prisma.jarvisPredictiveMetric.findMany({
        where: { sessionId },
        orderBy: { forecastedAt: 'desc' },
        distinct: ['metricType'],
      });

      if (!metrics.length) return '';

      const lines = ['Analyses prédictives:'];

      for (const metric of metrics) {
        const trend = await this.analyzeHistoricalTrend(
          sessionId,
          metric.metricType,
        );
        if (!trend) continue;

        const directionLabel =
          trend.direction === 'up'
            ? '↑'
            : trend.direction === 'down'
              ? '↓'
              : '→';

        lines.push(
          `- ${metric.metricType}: ${directionLabel} ${Math.abs(trend.changePercent)}% (moy. récente: ${trend.recentAverage})`,
        );
      }

      return lines.join('\n');
    } catch (error) {
      this.logger.error(
        `Failed to build prompt context for ${sessionId}: ${error}`,
      );
      return '';
    }
  }

  private mapMetricRecord(metric: any): PredictiveMetricRecord {
    return {
      id: metric.id,
      sessionId: metric.sessionId,
      metricType: metric.metricType,
      historicalData: JSON.parse(metric.historicalData),
      forecast: JSON.parse(metric.forecast),
      accuracy: metric.accuracy,
      forecastedAt: metric.forecastedAt.toISOString(),
      createdAt: metric.createdAt.toISOString(),
      updatedAt: metric.updatedAt.toISOString(),
    };
  }
}
