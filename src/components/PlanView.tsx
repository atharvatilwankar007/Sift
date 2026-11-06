import { motion } from 'motion/react';
import { Check, Calendar } from 'lucide-react';
import type { CalEvent, SiftItem } from '../lib/types';
import { catOf } from '../lib/categories';
import { dayLabel, startOfDay, timeLabel, ymd } from '../lib/dates';
import { eventTitle } from '../lib/calendar';

type Row =
  | { type: 'item'; at: Date; item: SiftItem }
  | { type: 'event'; at: Date; ev: CalEvent };

export function PlanView({
  items,
  events,
  onToggleDone,
}: {
  items: SiftItem[];
  events: CalEvent[];
  onToggleDone: (id: string) => void;
}) {
  const now = new Date();
  const today0 = startOfDay(now).getTime();
  const scheduled = items.filter((i) => i.slot && (i.status === 'scheduled' || i.status === 'done'));
  const loose = items.filter((i) => i.kind === 'task' && i.status === 'unscheduled');

  const rows: Row[] = [
    ...scheduled
      .filter((i) => i.status !== 'done' || new Date(i.slot!.start).getTime() >= today0)
      .map((item) => ({ type: 'item' as const, at: new Date(item.slot!.start), item })),
    ...events
      .filter((e) => !e.fromSift && !e.allDay && new Date(e.end).getTime() > today0)
      .map((ev) => ({ type: 'event' as const, at: new Date(ev.start), ev })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.at.getTime() < today0 ? 'earlier' : ymd(r.at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const todayCount = scheduled.filter((i) => i.status === 'scheduled' && ymd(new Date(i.slot!.start)) === ymd(now)).length;
  const ideaCount = items.filter((i) => i.kind === 'idea' && i.status !== 'archived' && i.steps.some((s) => !s.done)).length;

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 className="display">
          Your <em>plan</em>
        </h1>
        <div className="stats">
          <div className="stat">
            <b>{todayCount}</b>
            <span>today</span>
          </div>
          <div className="stat">
            <b>{scheduled.filter((i) => i.status === 'scheduled').length}</b>
            <span>coming up</span>
          </div>
          <div className="stat">
            <b>{ideaCount}</b>
            <span>ideas brewing</span>
          </div>
        </div>
      </header>

      {rows.length === 0 && loose.length === 0 && (
        <div className="empty">
          <div className="empty-orb" />
          <p>Nothing planned yet.</p>
          <p className="muted">Go ramble at the orb, I’ll sort it out.</p>
        </div>
      )}

      {[...groups.entries()].map(([key, list]) => (
        <section key={key} className="day">
          <h3 className="section-label">
            {key === 'earlier' ? 'Missed' : dayLabel(list[0].at, now)}
          </h3>
          <div className="timeline">
            {list.map((r, i) =>
              r.type === 'item' ? (
                <PlanRow key={r.item.id} item={r.item} i={i} onToggle={() => onToggleDone(r.item.id)} />
              ) : (
                <div key={r.ev.id} className="t-row ev">
                  <span className="t-time">{timeLabel(r.at)}</span>
                  <div className="t-card ghost">
                    <Calendar size={13} /> {r.ev.title}
                  </div>
                </div>
              ),
            )}
          </div>
        </section>
      ))}

      {loose.length > 0 && (
        <section className="day">
          <h3 className="section-label">No time yet</h3>
          <div className="timeline">
            {loose.map((it, i) => (
              <PlanRow key={it.id} item={it} i={i} onToggle={() => onToggleDone(it.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PlanRow({ item, i, onToggle }: { item: SiftItem; i: number; onToggle: () => void }) {
  const cat = catOf(item.category);
  const done = item.status === 'done';
  return (
    <motion.div
      className={`t-row ${done ? 'done' : ''}`}
      style={{ '--cat': cat.color } as React.CSSProperties}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: i * 0.04 }}
    >
      <span className="t-time">{item.slot ? timeLabel(new Date(item.slot.start)) : '—'}</span>
      <div className="t-card">
        <span className="emoji sm">{item.emoji}</span>
        <div className="t-text">
          <b>{item.kind === 'idea' ? eventTitle(item).replace(`${item.emoji} `, '') : item.title}</b>
          <span className="muted">
            {item.slot ? `${item.durationMin} min · ` : ''}
            {cat.label}
            {item.eventId ? ' · in Google Calendar' : ''}
          </span>
        </div>
        <button className={`check ${done ? 'on' : ''}`} onClick={onToggle} aria-label={done ? 'Mark not done' : 'Mark done'}>
          {done && <Check size={14} strokeWidth={3} />}
        </button>
      </div>
    </motion.div>
  );
}
