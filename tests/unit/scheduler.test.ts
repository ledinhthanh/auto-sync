import { describe, it, expect } from 'vitest';
import { validateCron } from '../../src/services/scheduler.service';

describe('scheduler.service - validateCron', () => {
  it('should allow valid cron expressions', () => {
    expect(() => validateCron('0 0 * * *')).not.toThrow();
    expect(() => validateCron('*/15 * * * *')).not.toThrow();
    expect(() => validateCron('0 12 * * 1-5')).not.toThrow();
  });

  it('should throw for invalid cron expressions', () => {
    expect(() => validateCron('invalid')).toThrow();
    expect(() => validateCron('0 0 * * * * *')).toThrow();
    expect(() => validateCron('60 0 * * *')).toThrow();
  });
});
