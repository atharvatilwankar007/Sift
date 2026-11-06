import { motion } from 'motion/react';
import { Archive, CalendarPlus, Check } from 'lucide-react';
import type { SiftItem } from '../lib/types';
import { catOf } from '../lib/categories';
import { slotLabel } from '../lib/dates';

export function IdeasView({
  items,
  onToggleStep,
  onPlanNext,
  onArchive,
}: {
  items: SiftItem[];
  onToggleStep: (id: string, step: number) => void;
  onPlanNext: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const ideas = items
    .filter((i) => i.kind === 'idea' && i.status !== 'archived')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Idea garden</p>
        <h1 className="display">
          Ideas, <em>growing</em>
        </h1>
        <p className="muted lead">Every idea gets a next step and a time to take it, so it actually goes somewhere.</p>
      </header>

      {ideas.length === 0 && (
        <div className="empty">
          <div className="empty-orb" />
          <p>No ideas yet.</p>
          <p className="muted">Next time inspiration hits, just say it out loud.</p>
        </div>
      )}

      <div className="ideas">
        {ideas.map((idea, i) => {
          const cat = catOf(idea.category);
          const doneCount = idea.steps.filter((s) => s.done).length;
          const pct = idea.steps.length ? doneCount / idea.steps.length : 0;
          const nextIdx = idea.steps.findIndex((s) => !s.done);
          const planned = idea.status === 'scheduled' && idea.slot && new Date(idea.slot.end) > new Date();
          return (
            <motion.article
              key={idea.id}
              className="card idea-card"
              style={{ '--cat': cat.color } as React.CSSProperties}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <div className="idea-glow" />
              <div className="card-top">
                <span className="emoji lg">{idea.emoji}</span>
                <div className="card-titles">
                  <h4 className="serif">{idea.title}</h4>
                  <p className="muted">{cat.label} · {doneCount}/{idea.steps.length} steps</p>
                </div>
                <button className="icon-ghost" onClick={() => onArchive(idea.id)} aria-label="Archive idea" title="Archive">
                  <Archive size={16} />
                </button>
              </div>
              <div className="progress">
                <motion.div className="bar" initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} />
              </div>
              {idea.angle && <p className="angle">“{idea.angle}”</p>}
              <ul className="steps check-list">
                {idea.steps.map((s, k) => (
                  <li key={k} className={`${s.done ? 'done' : ''} ${k === nextIdx ? 'next' : ''}`}>
                    <button className={`check sm ${s.done ? 'on' : ''}`} onClick={() => onToggleStep(idea.id, k)}>
                      {s.done && <Check size={11} strokeWidth={3} />}
                    </button>
                    <span>{s.text}</span>
                  </li>
                ))}
              </ul>
              {nextIdx === -1 ? (
                <p className="win">✨ All steps done. Time to decide: build it or let it go?</p>
              ) : planned ? (
                <p className="next-when">Next step · {slotLabel(idea.slot!.start, idea.slot!.end)}</p>
              ) : (
                <button className="btn-soft" onClick={() => onPlanNext(idea.id)}>
                  <CalendarPlus size={15} /> Find time for the next step
                </button>
              )}
            </motion.article>
          );
        })}
      </div>
    </div>
  );
}
