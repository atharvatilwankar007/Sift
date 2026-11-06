import type { AiResult, OnePager, QA, SiftItem } from './types';
import { addDays, timeZone, ymd } from './dates';
import { itemsForAi } from './items';

/* =====================================================================
   Prompts
   ===================================================================== */

const SIFT_SYSTEM = `You are Sift, a calm, sharp personal organizer with memory. The user speaks a messy brain dump (voice-transcribed: expect filler words, repeats, mis-heard words and self-corrections).

Understand what they MEANT, like a great assistant would:
- Self-corrections win: "call grandma Friday... no wait, Saturday" means Saturday only. "Actually forget the gym thing" means cancel it.
- Ignore filler ("um", "like", "you know") and false starts. Fix obvious mis-transcriptions from context.
- You are given the user's EXISTING items with ids. If they talk about one of them ("move the café thing to Sunday", "I paid the bill", "add to my restaurant idea: talk to Rohan"), produce an UPDATE for that id instead of creating a duplicate. Match loosely by meaning, not exact words.

Creates (new things only):
- kind "task": something to do. Short, verb-first title ("Call grandma").
- kind "idea": a project/business/app/content idea. Crisp name as title.
  - user_take: the idea in the USER'S OWN words, cleaned up into 1-3 sentences. Keep their meaning and specifics; add nothing.
  - user_steps: concrete steps the USER explicitly said they'd do ("I should talk to Rohan"). Often empty.
  - suggested_steps: 3 small, concrete next actions YOU suggest (15-45 min each, specific, not "think about it"). Do not repeat user_steps.
  - idea_angle: one sentence on the sharpest angle or open question. Concrete, no hype.
  - For tasks: user_take "", user_steps [], suggested_steps [], idea_angle "".

Updates (changes to existing ids only):
- action "edit": change title / dates / time. "complete": they did it. "cancel": drop it. "add_to_idea": add notes or steps to an idea.
- change_summary: short past-tense description shown to the user, e.g. "Moved to Sunday at 5 PM".
- Use "" (or []) for every field that does not change.

Scheduling (dates YYYY-MM-DD local; use the calendar table, don't compute weekdays yourself):
- earliest_date/latest_date: window for doing it (for ideas: the first step).
- "weekend" = coming Saturday to Sunday. Map "tomorrow", "next week", "by Friday" via the table.
- No time mentioned: money/admin within 2 days; personal calls within the week; idea first steps within 5 days.
- specific_time: "HH:MM" 24h ONLY if they named a clock time ("at 5" in an evening context = "17:00"), else "".
- deadline: only if stated or strongly implied, else "".
- time_of_day: natural fit (family calls afternoon/evening, admin morning, idea work morning/evening) or "any".
- duration_minutes: 10-120, realistic.
- clarifying_question: ONE short question only if a missing detail changes the plan, else "".

Also: category (work, business, health, money, family, personal, learning, errands), one emoji, priority (high for money/deadlines/health).
note: one short useful line of context in their terms.
summary: one warm sentence (max 18 words) reflecting what you did, mentioning changes too. No exclamation spam.
Never invent things they didn't say.`;

const STR = { type: 'string' };
const STRS = { type: 'array', items: STR };
const TOD = { type: 'string', enum: ['morning', 'afternoon', 'evening', 'any'] };
const obj = (props: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(props),
  properties: props,
});

const SIFT_SCHEMA = obj({
  summary: STR,
  creates: {
    type: 'array',
    items: obj({
      kind: { type: 'string', enum: ['task', 'idea'] },
      title: STR,
      note: STR,
      category: { type: 'string', enum: ['work', 'business', 'health', 'money', 'family', 'personal', 'learning', 'errands'] },
      emoji: STR,
      priority: { type: 'string', enum: ['high', 'medium', 'low'] },
      deadline: STR,
      earliest_date: STR,
      latest_date: STR,
      specific_time: STR,
      time_of_day: TOD,
      duration_minutes: { type: 'integer' },
      clarifying_question: STR,
      user_take: STR,
      user_steps: STRS,
      suggested_steps: STRS,
      idea_angle: STR,
    }),
  },
  updates: {
    type: 'array',
    items: obj({
      target_id: STR,
      action: { type: 'string', enum: ['edit', 'complete', 'cancel', 'add_to_idea'] },
      change_summary: STR,
      title: STR,
      note_append: STR,
      earliest_date: STR,
      latest_date: STR,
      specific_time: STR,
      time_of_day: { type: 'string', enum: ['morning', 'afternoon', 'evening', 'any', ''] },
      deadline: STR,
      add_user_steps: STRS,
    }),
  },
});

const COACH_SYSTEM = `You are Sift's idea coach: a sharp, kind, practical founder-friend. You help the user move THEIR idea forward. Respect their vision; never replace it with yours. Be concrete and brief. No hype, no jargon.`;

/* =====================================================================
   Providers: Claude (sk-ant-…) or Gemini (anything else)
   ===================================================================== */

export class SiftError extends Error {}
export type Provider = 'claude' | 'gemini';

export function providerFor(apiKey: string): Provider {
  return apiKey.trim().startsWith('sk-ant-') ? 'claude' : 'gemini';
}

const CLAUDE_MODEL = 'claude-opus-5-5';
const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

async function askJson<T>(system: string, prompt: string, schema: object, apiKey: string): Promise<T> {
  return providerFor(apiKey) === 'claude' ? askClaude<T>(system, prompt, schema, apiKey) : askGemini<T>(system, prompt, schema, apiKey);
}

function parse<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SiftError('Got an unexpected response. Try again.');
  }
}

async function askClaude<T>(system: string, prompt: string, schema: object, apiKey: string): Promise<T> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk'); // loaded on first use
  // Personal app with no server: the key lives only in this browser's storage.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  let res;
  try {
    res = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema as Record<string, unknown> } },
      system,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new SiftError('Your Claude API key was rejected. Check it in Settings.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new SiftError('This API key isn’t allowed to use the model. Check your Anthropic Console.');
    if (e instanceof Anthropic.RateLimitError) throw new SiftError('Rate limited by the API. Give it a minute and try again.');
    if (e instanceof Anthropic.BadRequestError) {
      if (/credit|balance/i.test(e.message)) throw new SiftError('Your Anthropic credit balance is empty. Top up in the Console.');
      throw new SiftError(`The API rejected the request: ${e.message}`);
    }
    // connection errors subclass APIError, so check them first
    if (e instanceof Anthropic.APIConnectionError) throw new SiftError('Couldn’t reach Claude. Are you online?');
    if (e instanceof Anthropic.APIError) throw new SiftError(`Claude API error (${e.status ?? '?'}). Try again.`);
    throw e;
  }
  if (res.stop_reason === 'refusal') throw new SiftError('Claude declined to process that one. Try rephrasing.');
  if (res.stop_reason === 'max_tokens') throw new SiftError('That was a lot! Try splitting it in two.');
  return parse<T>(res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(''));
}

async function askGemini<T>(system: string, prompt: string, schema: object, apiKey: string): Promise<T> {
  const { GoogleGenAI, ApiError } = await import('@google/genai'); // loaded on first use
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  for (const model of GEMINI_MODELS) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { systemInstruction: system, responseMimeType: 'application/json', responseJsonSchema: schema },
      });
      if (!res.text) throw new SiftError('Gemini returned nothing. Try rephrasing.');
      return parse<T>(res.text);
    } catch (e) {
      if (e instanceof SiftError) throw e;
      if (e instanceof ApiError) {
        if (e.status === 404) continue; // model not available: try the next one
        if (e.status === 400 && /api key/i.test(e.message)) throw new SiftError('Your Gemini API key was rejected. Check it in Settings.');
        if (e.status === 429) throw new SiftError('Free Gemini limit reached for now. Try again later.');
        throw new SiftError(`Gemini error (${e.status}). Try again.`);
      }
      throw new SiftError('Couldn’t reach Gemini. Are you online?');
    }
  }
  throw new SiftError('No Gemini model was available for this key.');
}

/* =====================================================================
   Context helpers
   ===================================================================== */

function calendarTable(now: Date): string {
  const rows: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(now, i);
    const wd = d.toLocaleDateString('en-US', { weekday: 'long' });
    rows.push(`${ymd(d)} ${wd}${i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : ''}`);
  }
  return rows.join('\n');
}

function nowLine(now: Date) {
  return `Current local time: ${now.toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })} (${timeZone()}).`;
}

function ideaContext(idea: SiftItem): string {
  const steps = idea.steps
    .filter((s) => s.accepted)
    .map((s) => `${s.done ? '[done]' : '[todo]'} ${s.text}`)
    .join('\n');
  const qa = idea.qa.filter((x) => x.a.trim()).map((x) => `Q: ${x.q}\nA: ${x.a}`).join('\n');
  return `Idea: ${idea.title}
In the user's words: ${idea.take || idea.note || '(none)'}
${idea.notes.length ? `Notes they added later:\n${idea.notes.join('\n')}\n` : ''}Kept steps:
${steps || '(none)'}
${qa ? `Previous Q&A:\n${qa}` : ''}`;
}

/* =====================================================================
   Public API
   ===================================================================== */

export async function siftDump(dump: string, items: SiftItem[], apiKey: string, now = new Date()): Promise<AiResult> {
  if (!apiKey) return demoSift(now);
  const prompt = `${nowLine(now)}

Calendar for reference:
${calendarTable(now)}

Existing items (use these ids for updates):
${itemsForAi(items)}

Brain dump:
"""
${dump.trim()}
"""`;
  const r = await askJson<AiResult>(SIFT_SYSTEM, prompt, SIFT_SCHEMA, apiKey);
  const ids = new Set(items.map((i) => i.id));
  return { summary: r.summary, creates: r.creates ?? [], updates: (r.updates ?? []).filter((u) => ids.has(u.target_id)) };
}

export async function suggestSteps(idea: SiftItem, steer: string, apiKey: string): Promise<string[]> {
  if (!apiKey) {
    await wait(900);
    return ['Write a one-line promise for this idea', 'Find 3 people who have this problem', 'Sketch the smallest version you could test'];
  }
  const existing = idea.steps.map((s) => s.text).join('; ');
  const r = await askJson<{ steps: string[] }>(
    COACH_SYSTEM,
    `${ideaContext(idea)}

Suggest 3 NEW small, concrete next steps (15-45 min each) that build on what's already there.${steer ? ` The user wants them to be: ${steer}.` : ''} Don't repeat: ${existing || 'n/a'}.`,
    obj({ steps: STRS }),
    apiKey,
  );
  return r.steps.slice(0, 4);
}

export async function sharpenQuestions(idea: SiftItem, apiKey: string): Promise<string[]> {
  if (!apiKey) {
    await wait(900);
    return ['Who exactly has this problem? Name one real person or business.', 'What do they do today instead, and what annoys them about it?'];
  }
  const r = await askJson<{ questions: string[] }>(
    COACH_SYSTEM,
    `${ideaContext(idea)}

Ask the 2 most useful questions that would sharpen this idea right now. Short, specific, answerable out loud in a sentence or two. Don't repeat earlier questions.`,
    obj({ questions: STRS }),
    apiKey,
  );
  return r.questions.slice(0, 3);
}

export async function refineIdea(
  idea: SiftItem,
  answers: QA[],
  apiKey: string,
): Promise<{ onePager: OnePager; angle: string; suggested: string[] }> {
  if (!apiKey) {
    await wait(1200);
    return {
      onePager: {
        problem: 'Small restaurants lose hours to repetitive admin.',
        audience: 'Owner-run cafés and restaurants with 1–3 locations.',
        insight: answers[0]?.a || 'Owners will pay to get evenings back.',
        risks: 'Owners are busy and skeptical of “AI”.',
        experiment: 'Offer one café a free week of automated review replies.',
      },
      angle: 'Sell the hours saved, not the AI.',
      suggested: ['Draft the one-week free offer message', 'Pick the first café to approach'],
    };
  }
  const qa = answers.filter((x) => x.a.trim()).map((x) => `Q: ${x.q}\nA: ${x.a}`).join('\n');
  const r = await askJson<{ one_pager: OnePager; angle: string; suggested_steps: string[] }>(
    COACH_SYSTEM,
    `${ideaContext(idea)}

New answers from the user:
${qa}

Update the idea's one-pager using ONLY what the user has said (fill gaps with short, clearly reasonable assumptions). Each field is one or two plain sentences. Then give one sharp angle sentence and 2 concrete next steps that follow from the answers.`,
    obj({
      one_pager: obj({ problem: STR, audience: STR, insight: STR, risks: STR, experiment: STR }),
      angle: STR,
      suggested_steps: STRS,
    }),
    apiKey,
  );
  return { onePager: r.one_pager, angle: r.angle, suggested: r.suggested_steps.slice(0, 3) };
}

/* =====================================================================
   Demo mode (no API key yet)
   ===================================================================== */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const DEMO_DUMP =
  "Okay so I saw this video about pitching AI to baristas and restaurants, like automating their ordering or reviews, that could be a business, I should ask Rohan since he runs a bakery. Oh and I need to call grandma on Friday, no wait, Saturday at 5. And pay my credit card bill.";

async function demoSift(now: Date): Promise<AiResult> {
  await wait(2000);
  const d = (n: number) => ymd(addDays(now, n));
  const dow = now.getDay();
  const toSat = dow === 6 ? 7 : (6 - dow + 7) % 7 || 7;
  const blank = { clarifying_question: '', user_take: '', user_steps: [] as string[], suggested_steps: [] as string[], idea_angle: '', deadline: '', specific_time: '' };
  return {
    summary: 'A bill to clear, grandma on Saturday at 5, and a restaurant idea worth chasing.',
    updates: [],
    creates: [
      {
        ...blank, kind: 'task', title: 'Pay credit card bill', note: 'Avoid late fees and interest', category: 'money',
        emoji: '💳', priority: 'high', earliest_date: d(0), latest_date: d(1), time_of_day: 'morning',
        duration_minutes: 15, clarifying_question: 'When is the bill due?',
      },
      {
        ...blank, kind: 'task', title: 'Call grandma', note: 'Weekend catch-up', category: 'family', emoji: '📞',
        priority: 'medium', earliest_date: d(toSat), latest_date: d(toSat), specific_time: '17:00',
        time_of_day: 'evening', duration_minutes: 30,
      },
      {
        ...blank, kind: 'idea', title: 'AI automation for restaurants', note: 'From a video on selling AI to cafés',
        category: 'business', emoji: '🍽️', priority: 'medium', earliest_date: d(1), latest_date: d(4),
        time_of_day: 'evening', duration_minutes: 45,
        user_take: 'Pitch AI tools to baristas and restaurants that automate ordering or replying to reviews.',
        user_steps: ['Ask Rohan about his bakery’s biggest admin headache'],
        suggested_steps: ['List 5 nearby cafés and their review ratings', 'Draft a 3-line pitch around review replies'],
        idea_angle: 'Which single workflow costs owners the most time each week?',
      },
    ],
  };
}
