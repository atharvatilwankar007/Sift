import type { AiItem, Category, SiftItem, Step } from './types';
import { uid } from './store';

const CATS: Category[] = ['work', 'business', 'health', 'money', 'family', 'personal', 'learning', 'errands'];

export function step(text: string, source: Step['source'], accepted = source === 'mine'): Step {
  return { id: uid(), text, done: false, source, accepted };
}

export function fromAi(a: AiItem): SiftItem {
  const now = new Date().toISOString();
  const isIdea = a.kind === 'idea';
  const mine = (a.user_steps ?? []).filter(Boolean).map((t) => step(t, 'mine'));
  const sugg = (a.suggested_steps ?? []).filter(Boolean).map((t) => step(t, 'suggested'));
  // Middle ground: your own steps lead. If you gave none, Sift pre-keeps its first suggestion
  // so there's something to schedule, and the rest wait for you to keep or drop.
  if (isIdea && mine.length === 0 && sugg.length) sugg[0].accepted = true;
  return {
    id: uid(),
    kind: isIdea ? 'idea' : 'task',
    title: a.title,
    note: a.note,
    category: CATS.includes(a.category) ? a.category : 'personal',
    emoji: a.emoji || (isIdea ? '💡' : '✅'),
    priority: a.priority,
    deadline: a.deadline,
    earliest: a.earliest_date,
    latest: a.latest_date,
    specificTime: a.specific_time ?? '',
    timeOfDay: a.time_of_day,
    durationMin: a.duration_minutes || 30,
    question: a.clarifying_question,
    status: 'unscheduled',
    slot: null,
    eventId: null,
    createdAt: now,
    updatedAt: now,
    angle: a.idea_angle ?? '',
    take: a.user_take ?? '',
    steps: isIdea ? [...mine, ...sugg] : [],
    stage: 'active',
    onePager: null,
    qa: [],
    notes: [],
  };
}

/** The step an idea's calendar slot is for: first kept, unfinished step. */
export function nextStep(it: SiftItem): Step | undefined {
  return it.steps.find((s) => s.accepted && !s.done);
}

/** Bring items saved by older versions of Sift up to the current shape. */
export function normalize(raw: unknown): SiftItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const o = r as Partial<SiftItem> & { steps?: Array<Partial<Step> & { text: string; done: boolean }> };
    return {
      id: o.id ?? uid(),
      kind: o.kind === 'idea' ? 'idea' : 'task',
      title: o.title ?? 'Untitled',
      note: o.note ?? '',
      category: (o.category as Category) ?? 'personal',
      emoji: o.emoji ?? '✨',
      priority: o.priority ?? 'medium',
      deadline: o.deadline ?? '',
      earliest: o.earliest ?? '',
      latest: o.latest ?? '',
      specificTime: o.specificTime ?? '',
      timeOfDay: o.timeOfDay ?? 'any',
      durationMin: o.durationMin ?? 30,
      question: o.question ?? '',
      status: o.status ?? 'unscheduled',
      slot: o.slot ?? null,
      eventId: o.eventId ?? null,
      createdAt: o.createdAt ?? new Date().toISOString(),
      updatedAt: o.updatedAt ?? o.createdAt ?? new Date().toISOString(),
      angle: o.angle ?? '',
      take: o.take ?? '',
      steps: (o.steps ?? []).map((s) => ({
        id: s.id ?? uid(),
        text: s.text,
        done: !!s.done,
        source: s.source ?? 'suggested',
        accepted: s.accepted ?? true,
      })),
      stage: o.stage ?? 'active',
      onePager: o.onePager ?? null,
      qa: o.qa ?? [],
      notes: o.notes ?? [],
    };
  });
}

/** Compact description of current items, so the AI can edit them by voice. */
export function itemsForAi(items: SiftItem[]): string {
  const live = items.filter((i) => i.status !== 'archived' && i.status !== 'done' && i.stage !== 'killed');
  if (!live.length) return '(nothing yet)';
  return live
    .slice(-60)
    .map((i) => {
      const when = i.slot
        ? new Date(i.slot.start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : 'no time yet';
      if (i.kind === 'idea') {
        const steps = i.steps.filter((s) => s.accepted).map((s) => `${s.done ? '✓' : '○'} ${s.text}`).join('; ');
        return `[${i.id}] IDEA "${i.title}" (${i.stage}) — next step ${when}${steps ? ` — steps: ${steps}` : ''}`;
      }
      return `[${i.id}] TASK "${i.title}" — ${when}${i.deadline ? `, due ${i.deadline}` : ''} (${i.category})`;
    })
    .join('\n');
}
