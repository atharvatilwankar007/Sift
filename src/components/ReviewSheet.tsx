import { motion } from 'motion/react';
import { ArrowRightLeft, CalendarCheck, CalendarPlus, CircleCheck, CircleX, HelpCircle, NotebookPen, RefreshCw, X } from 'lucide-react';
import type { AiUpdate, SiftItem } from '../lib/types';
import { catOf } from '../lib/categories';
import { slotLabel, toLocalInput } from '../lib/dates';
import { Check, Sheet, spring } from './ui';

export interface Draft extends SiftItem {
  include: boolean;
}
export interface UpdateDraft {
  u: AiUpdate;
  target: SiftItem;
  include: boolean;
}

const ACTION_ICON = {
  edit: ArrowRightLeft,
  complete: CircleCheck,
  cancel: CircleX,
  add_to_idea: NotebookPen,
};

export function ReviewSheet({
  summary,
  drafts,
  updates,
  connected,
  saving,
  onChange,
  onToggleUpdate,
  onNextSlot,
  onConfirm,
  onClose,
}: {
  summary: string;
  drafts: Draft[];
  updates: UpdateDraft[];
  connected: boolean;
  saving: boolean;
  onChange: (id: string, patch: Partial<Draft>) => void;
  onToggleUpdate: (i: number) => void;
  onNextSlot: (id: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const count = drafts.filter((d) => d.include).length + updates.filter((u) => u.include).length;
  const tasks = drafts.filter((d) => d.kind === 'task');
  const ideas = drafts.filter((d) => d.kind === 'idea');
  let k = 0;

  return (
    <Sheet onClose={onClose} full label="Review">
      <header className="sheet-head">
        <div>
          <p className="eyebrow">Here’s what I heard</p>
          <motion.h2 className="display small" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {summary || 'Sorted.'}
          </motion.h2>
        </div>
        <button className="icon-ghost" onClick={onClose} aria-label="Discard">
          <X size={20} />
        </button>
      </header>

      <div className="sheet-body">
        {count === 0 && drafts.length === 0 && updates.length === 0 && (
          <p className="muted center pad">Nothing actionable in that one. Try again?</p>
        )}

        {updates.length > 0 && <h3 className="label">Changes · {updates.length}</h3>}
        {updates.map((x, i) => {
          const Icon = ACTION_ICON[x.u.action];
          return (
            <motion.div
              key={`${x.u.target_id}-${i}`}
              className={`card change ${x.include ? '' : 'off'}`}
              style={{ '--cat': catOf(x.target.category).color } as React.CSSProperties}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0, transition: { ...spring, delay: 0.08 + k++ * 0.06 } }}
            >
              <Icon size={18} className="change-icon" />
              <div className="card-titles">
                <h4>{x.target.title}</h4>
                <p>{x.u.change_summary}</p>
              </div>
              <Check on={x.include} label={x.include ? 'Skip this change' : 'Apply this change'} onToggle={() => onToggleUpdate(i)} />
            </motion.div>
          );
        })}

        {tasks.length > 0 && <h3 className="label">New to-dos · {tasks.length}</h3>}
        {tasks.map((d) => (
          <DraftCard key={d.id} d={d} i={k++} onChange={onChange} onNextSlot={onNextSlot} />
        ))}
        {ideas.length > 0 && <h3 className="label">New ideas · {ideas.length}</h3>}
        {ideas.map((d) => (
          <DraftCard key={d.id} d={d} i={k++} onChange={onChange} onNextSlot={onNextSlot} />
        ))}
      </div>

      <footer className="sheet-foot">
        <button className="btn-primary big" disabled={count === 0 || saving} onClick={onConfirm}>
          {connected ? <CalendarPlus size={18} /> : <CalendarCheck size={18} />}
          {saving ? 'Saving…' : connected ? `Save ${count} & add to calendar` : `Save ${count}`}
        </button>
      </footer>
    </Sheet>
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
  const firstKept = d.steps.find((s) => s.accepted);
  return (
    <motion.article
      className={`card draft ${d.include ? '' : 'off'}`}
      style={{ '--cat': cat.color } as React.CSSProperties}
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { ...spring, delay: 0.08 + i * 0.06 } }}
    >
      <div className="card-top">
        <span className="emoji">{d.emoji}</span>
        <div className="card-titles">
          <input className="inline-title" value={d.title} onChange={(e) => onChange(d.id, { title: e.target.value })} aria-label="Title" />
          <p>{d.kind === 'idea' ? d.take || d.note : d.note}</p>
        </div>
        <Check on={d.include} label={d.include ? 'Skip this' : 'Include this'} onToggle={() => onChange(d.id, { include: !d.include })} />
      </div>

      {d.kind === 'idea' && d.include && (
        <div className="draft-steps">
          {d.steps.map((s) => (
            <button
              key={s.id}
              className={`step-chip ${s.accepted ? 'on' : ''} ${s.source}`}
              onClick={() => onChange(d.id, { steps: d.steps.map((x) => (x.id === s.id ? { ...x, accepted: !x.accepted } : x)) })}
            >
              <span className="tick">{s.accepted ? '✓' : '+'}</span>
              {s.text}
              {s.source === 'mine' && <em>you</em>}
            </button>
          ))}
          <p className="hint">Tap to keep or drop. Your own steps come first; edit them anytime later.</p>
        </div>
      )}

      {d.question && d.include && (
        <p className="question">
          <HelpCircle size={14} /> {d.question}
        </p>
      )}

      {d.include && (d.kind === 'task' || firstKept) && (
        <div className="when">
          <label className="when-label">
            <span>
              {d.kind === 'idea' && firstKept ? 'First step · ' : ''}
              {d.slot ? slotLabel(d.slot.start, d.slot.end) : 'No free slot found'}
            </span>
            <input
              type="datetime-local"
              value={d.slot ? toLocalInput(d.slot.start) : ''}
              onChange={(e) => {
                const start = new Date(e.target.value);
                if (isNaN(start.getTime())) return;
                onChange(d.id, { slot: { start: start.toISOString(), end: new Date(start.getTime() + durMs).toISOString() } });
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
