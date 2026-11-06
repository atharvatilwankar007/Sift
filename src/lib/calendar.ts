import type { CalEvent, Interval, SiftItem } from './types';
import { catOf } from './categories';
import { timeZone } from './dates';

/*
 * Google Calendar straight from the browser using Google Identity Services (token model).
 * No server: the short-lived access token is kept in localStorage and refreshed by
 * tapping "Connect" again when it expires (about an hour).
 */

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const TOKEN_KEY = 'sift.gtoken';
const API = 'https://www.googleapis.com/calendar/v3';

interface TokenClient { requestAccessToken(o?: { prompt?: string }): void }
interface GoogleOAuth {
  accounts: {
    oauth2: {
      initTokenClient(o: {
        client_id: string;
        scope: string;
        callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void;
        error_callback?: (e: { type: string }) => void;
      }): TokenClient;
    };
  };
}

let scriptPromise: Promise<void> | null = null;
export function loadGoogle(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load Google sign-in'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

function readToken(): string | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') as { v: string; exp: number } | null;
    if (t && t.exp > Date.now() + 60_000) return t.v;
  } catch {
    /* ignore */
  }
  return null;
}

export function isConnected(): boolean {
  return readToken() != null;
}

export function disconnect() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Must be called from a tap so the Google popup isn't blocked. */
export async function connectGoogle(clientId: string): Promise<void> {
  await loadGoogle();
  const g = (window as unknown as { google?: GoogleOAuth }).google;
  if (!g) throw new Error('Google sign-in unavailable');
  await new Promise<void>((resolve, reject) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: clientId.trim(),
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error || 'No access granted'));
        try {
          localStorage.setItem(
            TOKEN_KEY,
            JSON.stringify({ v: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000 }),
          );
        } catch {
          /* ignore */
        }
        resolve();
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Sign-in was closed' : e.type)),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

export class NeedsAuth extends Error {}

async function gfetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readToken();
  if (!token) throw new NeedsAuth('Reconnect Google Calendar');
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (res.status === 401) {
    disconnect();
    throw new NeedsAuth('Google session expired. Reconnect.');
  }
  if (!res.ok) throw new Error(`Google Calendar error ${res.status}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

interface GEvent {
  id: string;
  summary?: string;
  transparency?: string;
  status?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

export async function listEvents(from: Date, to: Date): Promise<CalEvent[]> {
  const q = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const data = await gfetch<{ items: GEvent[] }>(`/calendars/primary/events?${q}`);
  return (data.items ?? [])
    .filter((e) => e.status !== 'cancelled')
    .map((e) => ({
      id: e.id,
      title: e.summary || '(busy)',
      start: e.start.dateTime ?? e.start.date ?? '',
      end: e.end.dateTime ?? e.end.date ?? '',
      allDay: !e.start.dateTime,
      fromSift: e.extendedProperties?.private?.sift === '1',
      // transparent ("free") events don't block time
      ...(e.transparency === 'transparent' ? { allDay: true } : {}),
    }));
}

export function busyFrom(events: CalEvent[]): Interval[] {
  return events
    .filter((e) => !e.allDay)
    .map((e) => ({ start: new Date(e.start).getTime(), end: new Date(e.end).getTime() }));
}

export function eventTitle(item: SiftItem): string {
  if (item.kind === 'idea') {
    const step = item.steps.find((s) => !s.done)?.text ?? 'Work on it';
    return `${item.emoji} ${step} · ${item.title}`;
  }
  return `${item.emoji} ${item.title}`;
}

export async function createEvent(item: SiftItem): Promise<string> {
  if (!item.slot) throw new Error('No time picked');
  const tz = timeZone();
  const lines = [item.note];
  if (item.kind === 'idea') {
    if (item.angle) lines.push('', `💡 ${item.angle}`);
    lines.push('', 'Next steps:', ...item.steps.map((s) => `${s.done ? '✓' : '○'} ${s.text}`));
  }
  if (item.question) lines.push('', `❓ ${item.question}`);
  lines.push('', '— planned by Sift');
  const body = {
    summary: eventTitle(item),
    description: lines.filter((l) => l != null).join('\n'),
    start: { dateTime: item.slot.start, timeZone: tz },
    end: { dateTime: item.slot.end, timeZone: tz },
    colorId: catOf(item.category).gcal,
    reminders: {
      useDefault: false,
      overrides:
        item.priority === 'high'
          ? [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 10 }]
          : [{ method: 'popup', minutes: 10 }],
    },
    extendedProperties: { private: { sift: '1', siftId: item.id } },
  };
  if (item.eventId) {
    await gfetch(`/calendars/primary/events/${encodeURIComponent(item.eventId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return item.eventId;
  }
  const created = await gfetch<{ id: string }>('/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return created.id;
}

export async function deleteEvent(eventId: string): Promise<void> {
  try {
    await gfetch(`/calendars/primary/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
  } catch (e) {
    if (e instanceof NeedsAuth) throw e;
    /* already gone: fine */
  }
}
