import { motion } from 'motion/react';
import { CalendarCheck, CalendarPlus, Check, HelpCircle, RefreshCw, X } from 'lucide-react';
import type { SiftItem } from '../lib/types';
import { catOf } from '../lib/categories';
import { slotLabel, toLocalInput } from '../lib/dates';

export interface Draft extends SiftItem {
  include: boolean;
}

export function ReviewSheet({
  summary,
  drafts,
  connected,
  saving,
  onChange,
  onNextSlot,
  onConfirm,
  onClose,
}: {
  summary: string;
  drafts: Draft[];
  connected: boolean;
  saving: boolean;
  onChange: (id: string, patch: Partial<Draft>) => void;
  onNextSlot: (id: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const count = drafts.filter((d) => d.include).length;
  const tasks = drafts.filter((d) => d.kind === 'task');
  const ideas = drafts.filter((d) => d.kind === 'idea');

  return (
    <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section
        className="sheet review"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 260 }}
      >
        <div className="sheet-grip" />
        <header className="sheet-head">
          <div>
            <p className="eyebrow">Sifted</p>
            <h2 className="display small">{summary || 'Here’s what I heard'}</h2>
          </div>
          <button className="icon-ghost" onClick={onClose} aria-label="Discard">
            <X size={20} />
          </button>
        </header>

        <div className="sheet-body">
          {drafts.length === 0 && <p className="muted center pad">Nothing actionable in that one. Try again?</p>}
          {tasks.length > 0 && <h3 className="section-label">To do · {tasks.length}</h3>}
          {tasks.map((d, i) => (
            <DraftCard key={d.id} d={d} i={i} onChange={onChange} onNextSlot={onNextSlot} />
          ))}
          {ideas.length > 0 && <h3 className="section-label">Ideas · {ideas.length}</h3>}
          {ideas.map((d, i) => (
            <DraftCard key={d.id} d={d} i={i + tasks.length} onChange={onChange} onNextSlot={onNextSlot} />
          ))}
        </div>

        <footer className="sheet-foot">
          <button className="btn-primary big" disabled={count === 0 || saving} onClick={onConfirm}>
            {connected ? <CalendarPlus size={18} /> : <CalendarCheck size={18} />}
            {saving
              ? 'Adding…'
              : connected
                ? `Add ${count} to Google Calendar`
                : `Save ${count} to my plan`}
          </button>
          {!connected && <p className="hint center">Connect Google Calendar in Settings to get reminders on your phone.</p>}
        </footer>
      </motion.section>
    </motion.div>
  );
}

function DraftCard({
  d,
  i,
  onChange,
  onNextSlot,
}: {
  d: Draft;
  i: number;
  onChange: (id: string, patch: Partial<Draft>) => void;
  onNextSlot: (id: string) => void;
}) {
  const cat = catOf(d.category);
  const durMs = d.durationMin * 60_000;
  return (
    <motion.article
      className={`card draft ${d.include ? '' : 'off'} ${d.kind}`}
      style={{ '--cat': cat.color } as React.CSSProperties}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 + i * 0.07 }}
    >
      <div className="card-top">
        <span className="emoji">{d.emoji}</span>
        <div className="card-titles">
          <h4>{d.title}</h4>
          <p className="muted">{d.note}</p>
        </div>
        <button
          className={`check ${d.include ? 'on' : ''}`}
          onClick={() => onChange(d.id, { include: !d.include })}
          aria-label={d.include ? 'Skip this' : 'Include this'}
        >
          {d.include && <Check size={14} strokeWidth={3} />}
        </button>
      </div>

      <div className="chips">
        <span className="chip cat">{cat.label}</span>
        {d.priority === 'high' && <span className="chip hot">Priority</span>}
        {d.kind === 'idea' && <span className="chip idea">Idea</span>}
      </div>

      {d.kind === 'idea' && (
        <>
          {d.angle && <p className="angle">“{d.angle}”</p>}
          <ol className="steps">
            {d.steps.map((s, k) => (
              <li key={k} className={k === 0 ? 'first' : ''}>
                {s.text}
                {k === 0 && <span className="tag">scheduled</span>}
              </li>
            ))}
          </ol>
        </>
      )}

      {d.question && (
        <p className="question">
          <HelpCircle size={14} /> {d.question}
        </p>
      )}

      {d.include && (
        <div className="when">
          <label className="when-label">
            <span>{d.slot ? slotLabel(d.slot.start, d.slot.end) : 'No free slot found'}</span>
            <input
              type="datetime-local"
              value={d.slot ? toLocalInput(d.slot.start) : ''}
              onChange={(e) => {
                const start = new Date(e.target.value);
                if (isNaN(start.getTime())) return;
                onChange(d.id, {
                  slot: { start: start.toISOString(), end: new Date(start.getTime() + durMs).toISOString() },
                });
              }}
              aria-label="Change time"
            />
          </label>
          <button className="icon-ghost" onClick={() => onNextSlot(d.id)} aria-label="Next free slot" title="Next free slot">
            <RefreshCw size={15} />
          </button>
        </div>
      )}
    </motion.article>
  );
}
