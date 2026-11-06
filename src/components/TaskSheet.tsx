import { CalendarClock, HelpCircle, RotateCcw, Trash2, X } from 'lucide-react';
import type { Category, SiftItem, Slot } from '../lib/types';
import { CATEGORIES } from '../lib/categories';
import { slotLabel, toLocalInput, ymd, pad } from '../lib/dates';
import { Check, GrowText, MicButton, Sheet } from './ui';

const DURATIONS = [15, 30, 45, 60, 90];

export function TaskSheet({
  item,
  onChange,
  onFindSlot,
  onDelete,
  onClose,
}: {
  item: SiftItem;
  onChange: (patch: Partial<SiftItem>) => void;
  onFindSlot: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const done = item.status === 'done';
  const dateVal = item.slot ? ymd(new Date(item.slot.start)) : '';
  const timeVal = item.slot ? toLocalInput(item.slot.start).slice(11) : '';

  const setSlot = (date: string, time: string, dur = item.durationMin) => {
    if (!date) return;
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = (time || '09:00').split(':').map(Number);
    const start = new Date(y, m - 1, d, hh, mm);
    const slot: Slot = { start: start.toISOString(), end: new Date(start.getTime() + dur * 60_000).toISOString() };
    onChange({ slot, status: done ? 'done' : 'scheduled', specificTime: `${pad(hh)}:${pad(mm)}`, earliest: date, latest: date });
  };

  return (
    <Sheet onClose={onClose} label="Edit task">
      <header className="ed-head">
        <Check
          on={done}
          label={done ? 'Mark not done' : 'Mark done'}
          onToggle={() => onChange({ status: done ? (item.slot ? 'scheduled' : 'unscheduled') : 'done' })}
        />
        <input
          className="ed-title"
          value={item.title}
          onChange={(e) => onChange({ title: e.target.value })}
          aria-label="Title"
        />
        <button className="icon-ghost" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </header>

      <div className="sheet-body">
        <div className="ed-note">
          <GrowText value={item.note} onChange={(note) => onChange({ note })} placeholder="Add a note…" />
          <MicButton label="Dictate a note" onText={(t) => onChange({ note: item.note ? `${item.note} ${t}` : t })} />
        </div>

        {item.question && (
          <div className="ed-question">
            <HelpCircle size={15} />
            <span>{item.question}</span>
            <button className="icon-ghost sm" onClick={() => onChange({ question: '' })} aria-label="Dismiss question">
              <X size={14} />
            </button>
          </div>
        )}

        <section className="ed-block">
          <h3 className="label">When</h3>
          <p className="ed-when">{item.slot ? slotLabel(item.slot.start, item.slot.end) : 'No time yet'}</p>
          <div className="ed-row">
            <label className="field">
              <span>Day</span>
              <input type="date" value={dateVal} onChange={(e) => setSlot(e.target.value, timeVal)} />
            </label>
            <label className="field">
              <span>Time</span>
              <input type="time" value={timeVal} onChange={(e) => setSlot(dateVal || ymd(new Date()), e.target.value)} />
            </label>
          </div>
          <div className="chips-row" role="radiogroup" aria-label="Duration">
            {DURATIONS.map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={item.durationMin === m}
                className={`pill ${item.durationMin === m ? 'on' : ''}`}
                onClick={() => {
                  onChange({ durationMin: m });
                  if (item.slot) setSlot(dateVal, timeVal, m);
                }}
              >
                {m < 60 ? `${m}m` : `${m / 60}h`}
              </button>
            ))}
          </div>
          <div className="ed-row">
            <button className="btn-soft" onClick={onFindSlot}>
              <CalendarClock size={15} /> Next free slot
            </button>
            {item.slot && (
              <button className="btn-soft" onClick={() => onChange({ slot: null, status: done ? 'done' : 'unscheduled', specificTime: '' })}>
                <RotateCcw size={15} /> No time
              </button>
            )}
          </div>
        </section>

        <section className="ed-block">
          <h3 className="label">Category</h3>
          <div className="chips-row wrap">
            {(Object.keys(CATEGORIES) as Category[]).map((c) => (
              <button
                key={c}
                className={`pill cat ${item.category === c ? 'on' : ''}`}
                style={{ '--cat': CATEGORIES[c].color } as React.CSSProperties}
                onClick={() => onChange({ category: c })}
              >
                <i /> {CATEGORIES[c].label}
              </button>
            ))}
          </div>
        </section>

        <section className="ed-block">
          <h3 className="label">Priority</h3>
          <div className="chips-row">
            {(['low', 'medium', 'high'] as const).map((p) => (
              <button key={p} className={`pill ${item.priority === p ? 'on' : ''}`} onClick={() => onChange({ priority: p })}>
                {p === 'high' ? 'High' : p === 'medium' ? 'Normal' : 'Someday'}
              </button>
            ))}
          </div>
        </section>

        <button className="btn-danger" onClick={onDelete}>
          <Trash2 size={15} /> Delete task
        </button>
      </div>
    </Sheet>
  );
}
