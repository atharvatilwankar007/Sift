import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarPlus, Check as CheckIcon, Loader2, Plus, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import type { QA, SiftItem, Step } from '../lib/types';
import { catOf } from '../lib/categories';
import { slotLabel } from '../lib/dates';
import { refineIdea, sharpenQuestions, SiftError, suggestSteps } from '../lib/ai';
import { nextStep, step } from '../lib/items';
import { Check, GrowText, MicButton, Segmented, Sheet, spring } from './ui';

const STEERS = ['Quicker to test', 'Find customers', 'Cheaper', 'More technical'];

export function IdeaSheet({
  item,
  apiKey,
  onChange,
  onPlanNext,
  onDelete,
  onClose,
  say,
}: {
  item: SiftItem;
  apiKey: string;
  onChange: (patch: Partial<SiftItem>) => void;
  onPlanNext: () => void;
  onDelete: () => void;
  onClose: () => void;
  say: (t: string, bad?: boolean) => void;
}) {
  const cat = catOf(item.category);
  const [newStep, setNewStep] = useState('');
  const [suggesting, setSuggesting] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QA[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [refining, setRefining] = useState(false);

  const kept = item.steps.filter((s) => s.accepted);
  const pending = item.steps.filter((s) => !s.accepted);
  const done = kept.filter((s) => s.done).length;
  const next = nextStep(item);
  const upcoming = item.status === 'scheduled' && item.slot && new Date(item.slot.end) > new Date();

  const setSteps = (fn: (s: Step[]) => Step[]) => onChange({ steps: fn(item.steps) });
  const patchStep = (id: string, p: Partial<Step>) => setSteps((all) => all.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const removeStep = (id: string) => setSteps((all) => all.filter((s) => s.id !== id));

  const addStep = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setSteps((all) => [...all.filter((s) => s.accepted), step(t, 'mine'), ...all.filter((s) => !s.accepted)]);
    setNewStep('');
  };

  const more = async (steer: string) => {
    setSuggesting(steer);
    try {
      const got = await suggestSteps(item, steer, apiKey);
      setSteps((all) => [...all, ...got.map((t) => step(t, 'suggested'))]);
    } catch (e) {
      say(e instanceof SiftError ? e.message : 'Couldn’t get suggestions.', true);
    } finally {
      setSuggesting(null);
    }
  };

  const sharpen = async () => {
    setAsking(true);
    try {
      const qs = await sharpenQuestions(item, apiKey);
      setQuestions(qs.map((q) => ({ q, a: '' })));
    } catch (e) {
      say(e instanceof SiftError ? e.message : 'Couldn’t get questions.', true);
    } finally {
      setAsking(false);
    }
  };

  const refine = async () => {
    if (!questions) return;
    setRefining(true);
    try {
      const r = await refineIdea(item, questions, apiKey);
      onChange({
        onePager: r.onePager,
        angle: r.angle || item.angle,
        qa: [...item.qa, ...questions.filter((x) => x.a.trim())],
        steps: [...item.steps, ...r.suggested.map((t) => step(t, 'suggested'))],
      });
      setQuestions(null);
      say('One-pager updated ✓');
    } catch (e) {
      say(e instanceof SiftError ? e.message : 'Couldn’t update the idea.', true);
    } finally {
      setRefining(false);
    }
  };

  return (
    <Sheet onClose={onClose} full label="Idea">
      <header className="ed-head idea">
        <span className="emoji lg" style={{ '--cat': cat.color } as React.CSSProperties}>
          {item.emoji}
        </span>
        <input className="ed-title" value={item.title} onChange={(e) => onChange({ title: e.target.value })} aria-label="Idea name" />
        <button className="icon-ghost" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </header>

      <div className="sheet-body">
        <Segmented
          id="stage"
          value={item.stage}
          onChange={(stage) => onChange({ stage })}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'parked', label: 'Parked' },
            { value: 'killed', label: 'Let go' },
          ]}
        />

        <section className="ed-block">
          <h3 className="label">In your words</h3>
          <div className="take">
            <GrowText value={item.take} onChange={(take) => onChange({ take })} placeholder="What’s the idea, in your own words?" />
            <MicButton label="Add by voice" onText={(t) => onChange({ take: item.take ? `${item.take} ${t}` : t })} />
          </div>
          {item.angle && (
            <p className="angle">
              <Sparkles size={13} /> {item.angle}
            </p>
          )}
        </section>

        <section className="ed-block">
          <div className="label-row">
            <h3 className="label">Steps</h3>
            <span className="muted small">
              {done}/{kept.length} done
            </span>
          </div>
          <div className="progress">
            <motion.div className="bar" animate={{ width: `${kept.length ? (done / kept.length) * 100 : 0}%` }} transition={spring} />
          </div>

          <ul className="steps-list">
            <AnimatePresence initial={false}>
              {kept.map((s) => (
                <motion.li
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 30 }}
                  transition={spring}
                  className={`${s.done ? 'done' : ''} ${next?.id === s.id ? 'next' : ''}`}
                >
                  <Check size="sm" on={s.done} label={s.done ? 'Mark not done' : 'Mark done'} onToggle={() => patchStep(s.id, { done: !s.done })} />
                  <GrowText className="step-text" value={s.text} onChange={(text) => patchStep(s.id, { text })} />
                  {s.source === 'mine' && <span className="who">you</span>}
                  <button className="icon-ghost sm" onClick={() => removeStep(s.id)} aria-label="Remove step">
                    <X size={14} />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          <div className="add-step">
            <Plus size={16} />
            <input
              value={newStep}
              placeholder="Add your own step…"
              onChange={(e) => setNewStep(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addStep(newStep)}
            />
            {newStep.trim() ? (
              <button className="mic-mini on" onClick={() => addStep(newStep)} aria-label="Add step">
                <CheckIcon size={15} />
              </button>
            ) : (
              <MicButton label="Say a step" onText={addStep} />
            )}
          </div>

          {pending.length > 0 && (
            <>
              <h4 className="sub-label">
                <Wand2 size={13} /> Suggestions · keep what fits, edit, or drop
              </h4>
              <ul className="steps-list suggested">
                <AnimatePresence initial={false}>
                  {pending.map((s, i) => (
                    <motion.li
                      key={s.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0, transition: { ...spring, delay: i * 0.05 } }}
                      exit={{ opacity: 0, scale: 0.96 }}
                    >
                      <GrowText className="step-text" value={s.text} onChange={(text) => patchStep(s.id, { text })} />
                      <button className="keep" onClick={() => patchStep(s.id, { accepted: true })} aria-label="Keep">
                        <CheckIcon size={15} />
                      </button>
                      <button className="icon-ghost sm" onClick={() => removeStep(s.id)} aria-label="Drop">
                        <X size={14} />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </>
          )}

          <div className="steer">
            <span className="muted small">More ideas for steps:</span>
            <div className="chips-row wrap">
              {STEERS.map((s) => (
                <button key={s} className="pill" disabled={!!suggesting} onClick={() => more(s)}>
                  {suggesting === s && <Loader2 size={13} className="spin" />} {s}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="ed-block">
          <h3 className="label">Next up</h3>
          {next ? (
            upcoming ? (
              <div className="next-card">
                <b>{next.text}</b>
                <span>{slotLabel(item.slot!.start, item.slot!.end)}</span>
                <button className="btn-soft" onClick={onPlanNext}>
                  <CalendarPlus size={15} /> Different time
                </button>
              </div>
            ) : (
              <div className="next-card">
                <b>{next.text}</b>
                <button className="btn-primary" onClick={onPlanNext}>
                  <CalendarPlus size={16} /> Find time for this
                </button>
              </div>
            )
          ) : (
            <p className="muted small">Keep or add a step to plan what’s next.</p>
          )}
        </section>

        <section className="ed-block">
          <h3 className="label">Sharpen</h3>
          {!questions ? (
            <button className="btn-soft wide" onClick={sharpen} disabled={asking}>
              {asking ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} Ask me 2 questions about this idea
            </button>
          ) : (
            <div className="qa">
              {questions.map((x, i) => (
                <motion.div key={i} className="qa-item" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.08 } }}>
                  <p className="q">{x.q}</p>
                  <div className="a">
                    <GrowText
                      value={x.a}
                      placeholder="Answer in a sentence…"
                      onChange={(a) => setQuestions((qs) => qs!.map((y, j) => (j === i ? { ...y, a } : y)))}
                    />
                    <MicButton
                      label="Answer by voice"
                      onText={(t) => setQuestions((qs) => qs!.map((y, j) => (j === i ? { ...y, a: y.a ? `${y.a} ${t}` : t } : y)))}
                    />
                  </div>
                </motion.div>
              ))}
              <div className="ed-row">
                <button className="btn-soft" onClick={() => setQuestions(null)}>
                  Not now
                </button>
                <button className="btn-primary" disabled={refining || !questions.some((x) => x.a.trim())} onClick={refine}>
                  {refining ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />} Update my idea
                </button>
              </div>
            </div>
          )}

          {item.onePager && (
            <motion.div className="one-pager" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {(
                [
                  ['Problem', item.onePager.problem],
                  ['For who', item.onePager.audience],
                  ['Insight', item.onePager.insight],
                  ['Risks', item.onePager.risks],
                  ['First experiment', item.onePager.experiment],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </motion.div>
          )}
        </section>

        {item.notes.length > 0 && (
          <section className="ed-block">
            <h3 className="label">Added later</h3>
            <ul className="notes">
              {item.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </section>
        )}

        <button className="btn-danger" onClick={onDelete}>
          <Trash2 size={15} /> Delete idea
        </button>
      </div>
    </Sheet>
  );
}
