import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Pause, Play, Wand2, Wind } from 'lucide-react';
import type { SiftItem } from '../lib/types';
import { catOf } from '../lib/categories';
import { dayLabel, timeLabel } from '../lib/dates';
import { nextStep } from '../lib/items';
import { Segmented, Sheet, spring } from './ui';

type Stage = SiftItem['stage'];
const WEEK = 7 * 86_400_000;

export function IdeasView({
  items,
  onOpen,
  onStage,
}: {
  items: SiftItem[];
  onOpen: (id: string) => void;
  onStage: (id: string, stage: Stage) => void;
}) {
  const [stage, setStage] = useState<Stage>('active');
  const [reviewing, setReviewing] = useState(false);
  const ideas = items.filter((i) => i.kind === 'idea' && i.status !== 'archived');
  const shown = ideas.filter((i) => i.stage === stage).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const stale = ideas.filter((i) => i.stage === 'active' && Date.now() - new Date(i.updatedAt).getTime() > WEEK);
  const count = (s: Stage) => ideas.filter((i) => i.stage === s).length;

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Your idea garden</p>
        <h1 className="display">Ideas</h1>
        <p className="sub">Ramble it once. Sift keeps it moving.</p>
      </header>

      <Segmented
        id="ideas"
        value={stage}
        onChange={setStage}
        options={[
          { value: 'active', label: 'Active', count: count('active') },
          { value: 'parked', label: 'Parked', count: count('parked') },
          { value: 'killed', label: 'Let go', count: count('killed') },
        ]}
      />

      {stage === 'active' && stale.length > 0 && (
        <motion.button className="review-banner" onClick={() => setReviewing(true)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Wand2 size={18} />
          <span>
            <b>{stale.length === 1 ? '1 idea hasn’t' : `${stale.length} ideas haven’t`} moved in a week.</b> Quick review?
          </span>
          <ArrowRight size={16} />
        </motion.button>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={stage} className="ideas" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.18 }}>
          {shown.length === 0 && (
            <div className="empty">
              <div className="empty-orb" />
              <p>{stage === 'active' ? 'No ideas yet.' : stage === 'parked' ? 'Nothing parked.' : 'Nothing let go.'}</p>
              <p className="muted">{stage === 'active' ? 'Next time inspiration hits, just say it out loud.' : 'Ideas you set aside land here.'}</p>
            </div>
          )}
          {shown.map((idea, i) => (
            <IdeaCard key={idea.id} idea={idea} i={i} onOpen={() => onOpen(idea.id)} />
          ))}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {reviewing && (
          <ReviewIdeas
            ideas={stale}
            onClose={() => setReviewing(false)}
            onOpen={(id) => {
              setReviewing(false);
              onOpen(id);
            }}
            onStage={onStage}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function IdeaCard({ idea, i, onOpen }: { idea: SiftItem; i: number; onOpen: () => void }) {
  const cat = catOf(idea.category);
  const kept = idea.steps.filter((s) => s.accepted);
  const done = kept.filter((s) => s.done).length;
  const suggestions = idea.steps.filter((s) => !s.accepted).length;
  const next = nextStep(idea);
  const when = idea.status === 'scheduled' && idea.slot && new Date(idea.slot.end) > new Date() ? new Date(idea.slot.start) : null;
  return (
    <motion.button
      className="card idea-card"
      style={{ '--cat': cat.color } as React.CSSProperties}
      onClick={onOpen}
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { ...spring, delay: i * 0.05 } }}
      whileTap={{ scale: 0.985 }}
    >
      <div className="idea-glow" />
      <div className="card-top">
        <span className="emoji lg">{idea.emoji}</span>
        <div className="card-titles">
          <h4>{idea.title}</h4>
          <p>{idea.take || idea.note}</p>
        </div>
      </div>
      <div className="progress">
        <motion.div className="bar" initial={{ width: 0 }} animate={{ width: `${kept.length ? (done / kept.length) * 100 : 0}%` }} transition={spring} />
      </div>
      <div className="idea-meta">
        <span>
          {done}/{kept.length} steps
        </span>
        {suggestions > 0 && <span className="chip idea">{suggestions} suggestion{suggestions > 1 ? 's' : ''}</span>}
        {idea.onePager && <span className="chip">One-pager</span>}
      </div>
      {next && (
        <p className="idea-next">
          <span>Next</span> {next.text}
          {when && <em> · {dayLabel(when)} {timeLabel(when)}</em>}
        </p>
      )}
    </motion.button>
  );
}

function ReviewIdeas({
  ideas,
  onClose,
  onOpen,
  onStage,
}: {
  ideas: SiftItem[];
  onClose: () => void;
  onOpen: (id: string) => void;
  onStage: (id: string, stage: Stage) => void;
}) {
  const [idx, setIdx] = useState(0);
  const idea = ideas[idx];
  const advance = () => (idx + 1 < ideas.length ? setIdx(idx + 1) : onClose());
  if (!idea) return null;
  return (
    <Sheet onClose={onClose} label="Review ideas">
      <div className="sheet-body review-ideas">
        <p className="eyebrow">
          Idea {idx + 1} of {ideas.length}
        </p>
        <AnimatePresence mode="wait">
          <motion.div key={idea.id} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={spring}>
            <h2 className="display small">
              {idea.emoji} {idea.title}
            </h2>
            <p className="muted">{idea.take || idea.note}</p>
            {nextStep(idea) && (
              <p className="idea-next">
                <span>Next</span> {nextStep(idea)!.text}
              </p>
            )}
            <p className="q">Still excited about this one?</p>
            <div className="review-actions">
              <button className="btn-primary" onClick={() => onOpen(idea.id)}>
                <Play size={15} /> Keep going
              </button>
              <button
                className="btn-soft"
                onClick={() => {
                  onStage(idea.id, 'parked');
                  advance();
                }}
              >
                <Pause size={15} /> Park it
              </button>
              <button
                className="btn-soft"
                onClick={() => {
                  onStage(idea.id, 'killed');
                  advance();
                }}
              >
                <Wind size={15} /> Let it go
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
