import type { Interval, Settings, SiftItem, Slot, TimeOfDay } from './types';
import { addDays, parseYmd, startOfDay } from './dates';

const STEP = 15 * 60_000;
const BUFFER = 10 * 60_000;

const RANGES: Record<Exclude<TimeOfDay, 'any'>, [number, number]> = {
  morning: [8, 12],
  afternoon: [12, 17],
  evening: [17, 21],
};

function overlaps(a: Interval, busy: Interval[]) {
  return busy.some((b) => a.start < b.end + BUFFER && a.end + BUFFER > b.start);
}

/**
 * Find the earliest free slot for an item inside its date window, preferring its time of day,
 * inside the user's waking hours and around everything already on the calendar.
 */
export function findSlot(
  item: Pick<SiftItem, 'earliest' | 'latest' | 'deadline' | 'timeOfDay' | 'durationMin'> & { specificTime?: string },
  busy: Interval[],
  settings: Settings,
  now = new Date(),
): Slot | null {
  const dur = Math.max(10, Math.min(180, item.durationMin || 30)) * 60_000;
  const today = startOfDay(now);

  // You named an exact time: respect it, even if something else is on the calendar.
  const tm = /^(\d{1,2}):(\d{2})$/.exec(item.specificTime ?? '');
  if (tm) {
    const day = parseYmd(item.earliest) ?? today;
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(tm[1]), Number(tm[2]));
    if (start.getTime() < now.getTime()) start.setDate(start.getDate() + 1);
    return { start: start.toISOString(), end: new Date(start.getTime() + dur).toISOString() };
  }

  let first = parseYmd(item.earliest) ?? today;
  if (first < today) first = today;
  let last = parseYmd(item.latest) ?? addDays(first, 3);
  const deadline = parseYmd(item.deadline);
  if (deadline && deadline < last) last = deadline;
  if (last < first) last = first;
  const earliestStart = Math.ceil((now.getTime() + 10 * 60_000) / STEP) * STEP;

  const tryRange = (from: Date, to: Date, pref: TimeOfDay): Slot | null => {
    for (let day = new Date(from); day <= to; day = addDays(day, 1)) {
      let [h0, h1] = pref === 'any' ? [settings.dayStart, settings.dayEnd] : RANGES[pref];
      h0 = Math.max(h0, settings.dayStart);
      h1 = Math.min(h1, settings.dayEnd);
      if (h1 <= h0) continue;
      const base = startOfDay(day).getTime();
      let t = Math.max(base + h0 * 3_600_000, earliestStart);
      const end = base + h1 * 3_600_000;
      for (; t + dur <= end; t += STEP) {
        const cand = { start: t, end: t + dur };
        if (!overlaps(cand, busy)) {
          return { start: new Date(cand.start).toISOString(), end: new Date(cand.end).toISOString() };
        }
      }
    }
    return null;
  };

  return (
    tryRange(first, last, item.timeOfDay) ??
    tryRange(first, last, 'any') ??
    tryRange(addDays(last, 1), addDays(last, 7), item.timeOfDay) ??
    tryRange(addDays(last, 1), addDays(last, 7), 'any')
  );
}

export function slotToInterval(s: Slot): Interval {
  return { start: new Date(s.start).getTime(), end: new Date(s.end).getTime() };
}
