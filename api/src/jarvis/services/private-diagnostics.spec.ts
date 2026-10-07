import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JarvisReminderService } from './jarvis-reminder.service';
import { JarvisResourceAllocationService } from './jarvis-resource-allocation.service';
import { JarvisPredictiveAnalyticsService } from './jarvis-predictive-analytics.service';

describe('Private diagnostics', () => {
  afterEach(() => jest.restoreAllMocks());

  it('never logs user text, conversation IDs or database exception payloads on failed writes', async () => {
    const secret = 'private-email-and-token';
    const error = new Error(`database rejected ${secret}`);
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const reminder = new JarvisReminderService({
      reminder: { create: jest.fn().mockRejectedValue(error) },
    } as unknown as PrismaService);
    const resources = new JarvisResourceAllocationService({
      jarvisResourceAllocation: { create: jest.fn().mockRejectedValue(error) },
    } as unknown as PrismaService);
    const forecasts = new JarvisPredictiveAnalyticsService({
      jarvisPredictiveMetric: { create: jest.fn().mockRejectedValue(error) },
    } as unknown as PrismaService);

    expect(
      await reminder.create(secret, {
        text: secret,
        triggerAt: new Date('2026-10-06T10:00:00Z'),
      }),
    ).toBeNull();
    expect(
      await resources.allocateResource(secret, {
        resourceType: secret,
        resourceName: secret,
        allocatedHours: 1,
        allocationDate: new Date('2026-10-06T10:00:00Z'),
      }),
    ).toBeNull();
    expect(await forecasts.saveForecast(secret, secret, [], [])).toBeNull();

    expect(logged).toHaveBeenCalledTimes(3);
    expect(logged).toHaveBeenNthCalledWith(1, 'Create reminder failed.');
    expect(logged).toHaveBeenNthCalledWith(2, 'Allocate resource failed.');
    expect(logged).toHaveBeenNthCalledWith(3, 'Save forecast failed.');
    expect(JSON.stringify(logged.mock.calls)).not.toContain(secret);
  });
});
