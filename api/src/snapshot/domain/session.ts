// CME Globex session: 17:00 America/Chicago → 16:00 next day. A session is named by the day it
// closes, so "today" is the session that opened at the most recent 17:00 Chicago time.
const TZ = 'America/Chicago';
const OPEN_HOUR = 17;

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

function chicagoWallClock(d: Date) {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, Number(x.value)]));
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}

// Chicago offset in ms at instant d (negative: -5h in CDT, -6h in CST).
function offsetMs(d: Date): number {
  const w = chicagoWallClock(d);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - d.getTime();
}

export function cmeSessionStart(now: Date): Date {
  const w = chicagoWallClock(now);
  const day = w.hour >= OPEN_HOUR ? w.day : w.day - 1; // Date.UTC normalises day 0 / negatives
  const wallAsUtc = Date.UTC(w.year, w.month - 1, day, OPEN_HOUR);
  // Second pass corrects when a DST switch sits between `now` and the session open.
  const guess = wallAsUtc - offsetMs(now);
  return new Date(wallAsUtc - offsetMs(new Date(guess)));
}
