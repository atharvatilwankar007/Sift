import type { AiResult } from './types';
import { addDays, timeZone, ymd } from './dates';

const MODEL = 'claude-opus-5-5';

const SYSTEM = `You are Sift, a calm, sharp personal organizer. The user speaks a messy, rambling brain dump (often transcribed by voice, so expect filler words, repeats and mis-heard words). Your job is to pull out every distinct thing they mentioned and turn it into something actionable.

For each distinct thing, decide its kind:
- "task": something they need to do (call someone, pay a bill, book, buy, send, fix). Keep the title short and verb-first, e.g. "Call grandma", "Pay credit card bill".
- "idea": a project, business, app, content or creative idea. Title is a crisp name for the idea, e.g. "AI pitch for cafés & restaurants". For ideas also give:
  - idea_angle: one sentence on why it's interesting or what the sharpest angle is. Be concrete, not hype.
  - next_steps: 3 or 4 small, concrete actions that move the idea forward, in order. The first step must be doable in 15-45 minutes today or this week (research, a sketch, a message to someone). No vague steps like "think about it".

Scheduling (dates are YYYY-MM-DD in the user's local time; use the calendar table you are given, don't compute weekdays yourself):
- earliest_date / latest_date: the window when it should happen. For tasks this is when they should do it; for ideas it is when to do the FIRST next step.
- "weekend" means the coming Saturday to Sunday. "Tomorrow", "next week", "by Friday" etc. map to the table.
- If no time is mentioned: urgent/money/admin tasks within the next 2 days; personal calls within the week; idea first steps within the next 5 days.
- deadline: only if a real deadline is stated or strongly implied, else "".
- time_of_day: when it naturally fits (calls to family: afternoon/evening; admin and bills: morning; deep work on ideas: morning or evening). Use "any" if it truly doesn't matter.
- duration_minutes: realistic, between 10 and 120. Calls 20-30, bills 10-15, idea first steps 30-45.
- clarifying_question: if a key detail is missing that changes the plan (e.g. bill due date, which grandma's number), ask ONE short question, else "".

Also pick category (work, business, health, money, family, personal, learning, errands), a single fitting emoji, and priority (high for money/deadlines/health, low for someday stuff).
note: one short line of useful context in the user's own terms (not a repeat of the title).
summary: one warm, brief sentence (max 18 words) reflecting back what you sorted, like a friend who's got it handled. No exclamation-mark spam.

Never invent things they did not say. Merge duplicates. If the dump is empty or meaningless, return an empty items list with a gentle summary.`;

const STR = { type: 'string' };
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'items'],
  properties: {
    summary: STR,
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'kind', 'title', 'note', 'category', 'emoji', 'priority', 'deadline',
          'earliest_date', 'latest_date', 'time_of_day', 'duration_minutes',
          'clarifying_question', 'idea_angle', 'next_steps',
        ],
        properties: {
          kind: { type: 'string', enum: ['task', 'idea'] },
          title: STR,
          note: STR,
          category: {
            type: 'string',
            enum: ['work', 'business', 'health', 'money', 'family', 'personal', 'learning', 'errands'],
          },
          emoji: STR,
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          deadline: STR,
          earliest_date: STR,
          latest_date: STR,
          time_of_day: { type: 'string', enum: ['morning', 'afternoon', 'evening', 'any'] },
          duration_minutes: { type: 'integer' },
          clarifying_question: STR,
          idea_angle: STR,
          next_steps: { type: 'array', items: STR },
        },
      },
    },
  },
};

function calendarTable(now: Date): string {
  const rows: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(now, i);
    const wd = d.toLocaleDateString('en-US', { weekday: 'long' });
    rows.push(`${ymd(d)} ${wd}${i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : ''}`);
  }
  return rows.join('\n');
}

export class SiftError extends Error {}

function buildContext(dump: string, now: Date): string {
  return `Current local time: ${now.toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })} (${timeZone()}).

Calendar for reference:
${calendarTable(now)}

Brain dump:
"""
${dump.trim()}
"""`;
}

export type Provider = 'claude' | 'gemini';

/** Claude keys start with "sk-ant-"; anything else is treated as a Google Gemini key. */
export function providerFor(apiKey: string): Provider {
  return apiKey.trim().startsWith('sk-ant-') ? 'claude' : 'gemini';
}

export function siftWithAI(dump: string, apiKey: string, now = new Date()): Promise<AiResult> {
  return providerFor(apiKey) === 'claude' ? siftWithClaude(dump, apiKey, now) : siftWithGemini(dump, apiKey, now);
}

/* ---------- Google Gemini (free tier available) ---------- */

// Fast, low-cost stable model; the second is a fallback if the first isn't available to this key.
const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

export async function siftWithGemini(dump: string, apiKey: string, now = new Date()): Promise<AiResult> {
  const { GoogleGenAI, ApiError } = await import('@google/genai'); // loaded on first use
  // Personal app with no server: the key lives only in this browser's storage.
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

  let lastErr: unknown;
  for (const model of GEMINI_MODELS) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: buildContext(dump, now),
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: 'application/json',
          responseJsonSchema: SCHEMA,
        },
      });
      const text = res.text ?? '';
      if (!text) throw new SiftError('Gemini returned nothing (it may have blocked that one). Try rephrasing.');
      try {
        return JSON.parse(text) as AiResult;
      } catch {
        throw new SiftError('Got an unexpected response. Try again.');
      }
    } catch (e) {
      if (e instanceof SiftError) throw e;
      lastErr = e;
      if (e instanceof ApiError && e.status === 404) continue; // model not available: try the next one
      if (e instanceof ApiError) {
        const msg = e.message || '';
        if (e.status === 400 && /api key/i.test(msg)) throw new SiftError('Your Gemini API key was rejected. Check it in Settings.');
        if (e.status === 403) throw new SiftError('This Gemini key isn’t allowed to do that. Check it in Google AI Studio.');
        if (e.status === 429) throw new SiftError('Free Gemini limit reached for now. Wait a minute (or until tomorrow) and try again.');
        if (e.status >= 500) throw new SiftError('Gemini is having a moment. Try again shortly.');
        throw new SiftError(`Gemini error (${e.status}). Try again.`);
      }
      throw new SiftError('Couldn’t reach Gemini. Are you online?');
    }
  }
  console.error(lastErr);
  throw new SiftError('No Gemini model was available for this key.');
}

/* ---------- Anthropic Claude (paid) ---------- */

export async function siftWithClaude(dump: string, apiKey: string, now = new Date()): Promise<AiResult> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk'); // loaded on first use
  // Personal app with no server: the key lives only in this browser's storage.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const context = buildContext(dump, now);

  let res;
  try {
    res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: context }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new SiftError('Your Claude API key was rejected. Check it in Settings.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new SiftError('This API key isn’t allowed to use the model. Check your Anthropic Console.');
    if (e instanceof Anthropic.RateLimitError) throw new SiftError('Rate limited by the API. Give it a minute and try again.');
    if (e instanceof Anthropic.BadRequestError) throw new SiftError(`The API rejected the request: ${e.message}`);
    // connection errors subclass APIError, so check them first
    if (e instanceof Anthropic.APIConnectionError) throw new SiftError('Couldn’t reach Claude. Are you online?');
    if (e instanceof Anthropic.APIError) throw new SiftError(`Claude API error (${e.status ?? '?'}). Try again.`);
    throw e;
  }

  if (res.stop_reason === 'refusal') throw new SiftError('Claude declined to process that one. Try rephrasing.');
  if (res.stop_reason === 'max_tokens') throw new SiftError('That was a lot! Try splitting it into two dumps.');

  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  try {
    return JSON.parse(text) as AiResult;
  } catch {
    throw new SiftError('Got an unexpected response. Try again.');
  }
}

/* ---------- Demo mode (no API key yet) ---------- */

export const DEMO_DUMP =
  "Okay so I saw this video about pitching AI tools to baristas and restaurants, like automating their ordering or reviews, that could be a business. Oh and I want to build an app to track my gym workouts. I need to call grandma on the weekend. And I have to pay my credit card bill.";

export async function demoSift(_dump: string, now = new Date()): Promise<AiResult> {
  await new Promise((r) => setTimeout(r, 2200));
  const d = (n: number) => ymd(addDays(now, n));
  const dow = now.getDay(); // 0 Sun .. 6 Sat
  const toSat = dow === 6 ? 0 : dow === 0 ? 0 : 6 - dow;
  const sat = d(toSat);
  const sun = d(dow === 0 ? 0 : toSat + 1);
  return {
    summary: 'Two ideas worth chasing, one bill to clear, and a call that matters. Here’s your plan.',
    items: [
      {
        kind: 'task', title: 'Pay credit card bill', note: 'Avoid late fees and interest', category: 'money',
        emoji: '💳', priority: 'high', deadline: '', earliest_date: d(0), latest_date: d(1),
        time_of_day: 'morning', duration_minutes: 15, clarifying_question: 'When is the bill due?',
        idea_angle: '', next_steps: [],
      },
      {
        kind: 'task', title: 'Call grandma', note: 'Weekend catch-up', category: 'family', emoji: '📞',
        priority: 'medium', deadline: '', earliest_date: sat, latest_date: sun, time_of_day: 'afternoon',
        duration_minutes: 30, clarifying_question: '', idea_angle: '', next_steps: [],
      },
      {
        kind: 'idea', title: 'AI pitch for cafés & restaurants', note: 'From a video on selling AI to baristas',
        category: 'business', emoji: '☕', priority: 'medium', deadline: '', earliest_date: d(1), latest_date: d(4),
        time_of_day: 'evening', duration_minutes: 45, clarifying_question: '',
        idea_angle: 'Small cafés drown in reviews and repeat orders; one painful workflow automated is an easy yes.',
        next_steps: [
          'List 5 local cafés and the one task that annoys them most',
          'Draft a 3-line pitch around review replies or pre-orders',
          'Walk into 2 cafés and ask the owner for 5 minutes',
          'Build a tiny demo for the most common pain',
        ],
      },
      {
        kind: 'idea', title: 'Gym workout tracker app', note: 'For tracking your own workouts', category: 'health',
        emoji: '🏋️', priority: 'low', deadline: '', earliest_date: d(2), latest_date: d(6), time_of_day: 'morning',
        duration_minutes: 30, clarifying_question: '',
        idea_angle: 'Logging sets is slow mid-workout; voice-first logging between sets could be the hook.',
        next_steps: [
          'Write down the 3 things you hate about current gym apps',
          'Sketch the log-a-set screen on paper',
          'Track one workout in Notes to see what you actually record',
        ],
      },
    ],
  };
}
