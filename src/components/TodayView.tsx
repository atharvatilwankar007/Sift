import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Calendar } from 'lucide-react';
import type { CalEvent, SiftItem } from '../lib/types';
import { catOf } from '../lib/categories';
import { addDays, startOfDay, timeLabel, ymd } from '../lib/dates';
import { nextStep } from '../lib/items';
import { Check, Count, SwipeRow, spring } from './ui';

type Row = { type: 'item'; at: Date; item: SiftItem } | { type: 'event'; at: Date; ev: CalEvent };

export function TodayView({
  items,
  events,
  onOpen,
  onToggleDone,
  onDelete,
}: {
  items: SiftItem[];
  events: CalEvent[];
  onOpen: (id: string) => void;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const now = new Date();
  const today = startOfDay(now);
  const [day, setDay] = useState(ymd(now));
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  const live = items.filter((i) => i.status !== 'archived' && i.stage !== 'killed' && i.stage !== 'parked');
  const scheduled = live.filter((i) => i.slot && (i.status === 'scheduled' || i.status === 'done'));
  const countOn = (d: string) => scheduled.filter((i) => ymd(new Date(i.slot!.start)) === d && i.status !== 'done').length;

  const rows: Row[] = useMemo(
    () =>
      [
        ...scheduled.filter((i) => ymd(new Date(i.slot!.start)) === day).map((item) => ({ type: 'item' as const, at: new Date(item.slot!.start), item })),
        ...events
          .filter((e) => !e.fromSift && !e.allDay && ymd(new Date(e.start)) === day)
          .map((ev) => ({ type: 'event' as const, at: new Date(ev.start), ev })),
      ].sort((a, b) => a.at.getTime() - b.at.getTime()),
    [scheduled, events, day],
  );

  const missed = day === ymd(now) ? scheduled.filter((i) => i.status === 'scheduled' && new Date(i.slot!.end) < today) : [];
  const loose = live.filter((i) => i.kind === 'task' && i.status === 'unscheduled');
  const todayLeft = countOn(ymd(now));
  const ideasMoving = items.filter((i) => i.kind === 'idea' && i.stage === 'active').length;

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1 key={day} className="display" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.18 }}>
            {day === ymd(now) ? 'Today' : day === ymd(addDays(today, 1)) ? 'Tomorrow' : days.find((d) => ymd(d) === day)?.toLocaleDateString(undefined, { weekday: 'long' })}
          </motion.h1>
        </AnimatePresence>
        <p className="sub">
          <b>
            <Count n={todayLeft} />
          </b>{' '}
          {todayLeft === 1 ? 'thing' : 'things'} left today ·{' '}
          <b>
            <Count n={ideasMoving} />
          </b>{' '}
          {ideasMoving === 1 ? 'idea' : 'ideas'} in motion
        </p>
      </header>

      <div className="days" role="tablist" aria-label="Day">
        {days.map((d) => {
          const key = ymd(d);
          const n = countOn(key);
          const on = key === day;
          return (
            <button key={key} role="tab" aria-selected={on} className={`day ${on ? 'on' : ''}`} onClick={() => setDay(key)}>
              {on && <motion.span layoutId="day-pill" className="day-pill" transition={spring} />}
              <span className="dw">{d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3)}</span>
              <span className="dn">{d.getDate()}</span>
              <span className="dots">{Array.from({ length: Math.min(n, 3) }, (_, i) => <i key={i} />)}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={day} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
          {missed.length > 0 && (
            <section>
              <h3 className="label">Missed · swipe to clear or tap to move</h3>
              <List rows={missed.map((item) => ({ type: 'item', at: new Date(item.slot!.start), item }))} {...{ onOpen, onToggleDone, onDelete }} />
            </section>
          )}

          {rows.length > 0 ? (
            <section>
              <h3 className="label">Schedule</h3>
              <List rows={rows} {...{ onOpen, onToggleDone, onDelete }} />
            </section>
          ) : (
            <div className="empty">
              <div className="empty-orb" />
              <p>Nothing planned{day === ymd(now) ? ' today' : ''}.</p>
              <p className="muted">Tap the mic and ramble. I’ll find the time.</p>
            </div>
          )}

          {loose.length > 0 && (
            <section>
              <h3 className="label">Needs a time</h3>
              <List rows={loose.map((item) => ({ type: 'item', at: new Date(), item }))} noTime {...{ onOpen, onToggleDone, onDelete }} />
            </section>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function List({
  rows,
  noTime,
  onOpen,
  onToggleDone,
  onDelete,
}: {
  rows: Row[];
  noTime?: boolean;
  onOpen: (id: string) => void;
  onToggleDone: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <ul className="timeline">
      <AnimatePresence initial={false}>
        {rows.map((r, i) =>
          r.type === 'event' ? (
            <motion.li key={r.ev.id} layout className="t-row ev" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <span className="t-time">{timeLabel(r.at)}</span>
              <div className="t-ghost">
                <Calendar size={13} /> {r.ev.title}
              </div>
            </motion.li>
          ) : (
            <motion.li
              key={r.item.id}
              layout
              className={`t-row ${r.item.status === 'done' ? 'done' : ''}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0, transition: { ...spring, delay: i * 0.035 } }}
              exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.22 } }}
              style={{ '--cat': catOf(r.item.category).color } as React.CSSProperties}
            >
              <span className="t-time">{noTime || !r.item.slot ? '' : timeLabel(r.at)}</span>
              <SwipeRow
                onOpen={() => onOpen(r.item.id)}
                onDone={() => onToggleDone(r.item.id)}
                onDelete={() => onDelete(r.item.id)}
                doneLabel={r.item.status === 'done' ? 'Undo' : 'Done'}
              >
                <div className="t-card">
                  <span className="emoji sm">{r.item.emoji}</span>
                  <div className="t-text">
                    <b>{r.item.kind === 'idea' ? nextStep(r.item)?.text ?? r.item.title : r.item.title}</b>
                    <span>
                      {r.item.kind === 'idea' ? `💡 ${r.item.title}` : catOf(r.item.category).label}
                      {r.item.slot ? ` · ${r.item.durationMin} min` : ''}
                      {r.item.question ? ' · ❓' : ''}
                    </span>
                  </div>
                  <Check
                    on={r.item.status === 'done'}
                    label={r.item.status === 'done' ? 'Mark not done' : 'Mark done'}
                    onToggle={() => onToggleDone(r.item.id)}
                  />
                </div>
              </SwipeRow>
            </motion.li>
          ),
        )}
      </AnimatePresence>
    </ul>
  );
}
