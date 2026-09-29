import { RequestQuotaService } from './request-quota.service';
import { REQUEST_QUOTAS } from './request-limits';

describe('RequestQuotaService', () => {
  it('isolates owners, refuses exhausted windows and recovers at expiry', () => {
    const quota = new RequestQuotaService();
    expect(quota.consume('owner-a', 1, 0)).toBeNull();
    expect(quota.consume('owner-a', 1, 1000)).toBe(59);
    expect(quota.consume('owner-b', 1, 1000)).toBeNull();
    expect(quota.consume('owner-a', 1, 60000)).toBeNull();
  });
  it('bounds memory without evicting active quotas', () => {
    const quota = new RequestQuotaService();
    for (let i = 0; i < REQUEST_QUOTAS.maxEntries; i++)
      quota.consume(String(i), 1, 0);
    expect(quota.consume('extra', 1, 0)).toBe(60);
    expect(quota.consume('0', 1, 0)).toBe(60);
    expect(quota.consume('extra', 1, 60000)).toBeNull();
  });
});
