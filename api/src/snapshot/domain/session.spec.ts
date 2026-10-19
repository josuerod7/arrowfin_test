import { cmeSessionStart } from './session';

describe('cmeSessionStart', () => {
  it('dataset cut (09:30 CDT Tue) → session opened Mon 17:00 CDT', () => {
    expect(cmeSessionStart(new Date('2026-08-25T14:30:00Z')).toISOString()).toBe('2026-08-24T22:00:00.000Z');
  });

  it('after 17:00 Chicago the new session has already started', () => {
    expect(cmeSessionStart(new Date('2026-08-25T22:30:00Z')).toISOString()).toBe('2026-08-25T22:00:00.000Z');
  });

  it('uses CST (UTC-6) in winter', () => {
    expect(cmeSessionStart(new Date('2026-01-15T15:00:00Z')).toISOString()).toBe('2026-01-14T23:00:00.000Z');
  });

  it('handles the DST switch between session open and now', () => {
    // 2026-03-08 02:00 CST → CDT. Mon 09 Mar 10:00 CDT; session opened Sun 08 Mar 17:00 CDT.
    expect(cmeSessionStart(new Date('2026-03-09T15:00:00Z')).toISOString()).toBe('2026-03-08T22:00:00.000Z');
    // Sun 08 Mar 01:00 CST (before switch); session opened Sat 07 Mar 17:00 CST.
    expect(cmeSessionStart(new Date('2026-03-08T07:00:00Z')).toISOString()).toBe('2026-03-07T23:00:00.000Z');
  });
});
