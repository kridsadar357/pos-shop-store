import { describe, it, expect } from 'vitest';
import { licenseHealth, computeLicenseState } from '../license.js';

const now = new Date('2026-06-01T00:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('licenseHealth', () => {
  it('ACTIVE checked recently: no revalidation needed, within grace', () => {
    const h = licenseHealth({ status: 'ACTIVE', lastCheckedAt: daysAgo(2) }, now);
    expect(h.needsRevalidation).toBe(false);
    expect(h.withinGrace).toBe(true);
  });

  it('ACTIVE stale beyond staleDays flags revalidation but stays within grace', () => {
    const h = licenseHealth({ status: 'ACTIVE', lastCheckedAt: daysAgo(10) }, now); // >7, <30
    expect(h.daysSinceCheck).toBe(10);
    expect(h.needsRevalidation).toBe(true);
    expect(h.withinGrace).toBe(true);
  });

  it('ACTIVE past the grace window is no longer within grace', () => {
    const h = licenseHealth({ status: 'ACTIVE', lastCheckedAt: daysAgo(40) }, now);
    expect(h.needsRevalidation).toBe(true);
    expect(h.withinGrace).toBe(false);
  });

  it('DEMO and null licenses never need re-validation (expiry-only)', () => {
    expect(licenseHealth({ status: 'DEMO', lastCheckedAt: daysAgo(999) }, now).needsRevalidation).toBe(false);
    expect(licenseHealth(null, now).needsRevalidation).toBe(false);
  });

  it('honors custom stale/grace windows', () => {
    const h = licenseHealth({ status: 'ACTIVE', lastCheckedAt: daysAgo(3) }, now, { staleDays: 1, graceDays: 2 });
    expect(h.needsRevalidation).toBe(true);
    expect(h.withinGrace).toBe(false);
  });
});

describe('computeLicenseState (regression)', () => {
  it('flips ACTIVE to EXPIRED once past expiry', () => {
    expect(computeLicenseState({ status: 'ACTIVE', expiresAt: daysAgo(1) }).status).toBe('EXPIRED');
    expect(computeLicenseState({ status: 'ACTIVE', expiresAt: null }).valid).toBe(true);
  });
});
