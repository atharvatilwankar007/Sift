import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, Lightbulb, Mic, Settings2 } from 'lucide-react';
import { CaptureView } from './components/CaptureView';
import { ReviewSheet, type Draft } from './components/ReviewSheet';
import { PlanView } from './components/PlanView';
import { IdeasView } from './components/IdeasView';
import { SettingsSheet } from './components/SettingsSheet';
import { useStored, uid } from './lib/store';
import type { AiItem, CalEvent, Interval, Settings, SiftItem } from './lib/types';
import { demoSift, siftWithClaude, SiftError } from './lib/ai';
import { findSlot, slotToInterval } from './lib/scheduler';
import {
  busyFrom,
  connectGoogle,
  createEvent,
  deleteEvent,
  disconnect,
  isConnected,
  listEvents,
  loadGoogle,
  NeedsAuth,
} from './lib/calendar';
import { addDays, startOfDay } from './lib/dates';

type Tab = 'capture' | 'plan' | 'ideas';

const DEFAULT_SETTINGS: Settings = { name: '', apiKey: '', googleClientId: '', dayStart: 8, dayEnd: 22 };

function toItem(a: AiItem): SiftItem {
  return {
    id: uid(),
    kind: a.kind === 'idea' ? 'idea' : 'task',
    title: a.title,
    note: a.note,
    category: a.category,
    emoji: a.emoji || '✨',
    priority: a.priority,
    deadline: a.deadline,
    earliest: a.earliest_date,
    latest: a.latest_date,
    timeOfDay: a.time_of_day,
    durationMin: a.duration_minutes || 30,
    question: a.clarifying_question,
    angle: a.idea_angle,
    steps: (a.next_steps ?? []).map((text) => ({ text, done: false })),
    status: 'unscheduled',
    slot: null,
    eventId: null,
    createdAt: new Date().toISOString(),
  };
}

export default function App() {
  const [items, setItems] = useStored<SiftItem[]>('sift.items', []);
  const [settings, setSettings] = useStored<Settings>('sift.settings', DEFAULT_SETTINGS);
  const [tab, setTab] = useState<Tab>('capture');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState<{ summary: string; drafts: Draft[] } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connected, setConnected] = useState(isConnected());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const say = useCallback((text: string, bad = false) => {
    setToast({ text, bad });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  const lostAuth = useCallback(() => {
    setConnected(false);
    say('Google session expired. Reconnect in Settings.', true);
  }, [say]);

  const refreshEvents = useCallback(async (): Promise<CalEvent[]> => {
    if (!isConnected()) {
      setConnected(false);
      return [];
    }
    try {
      const now = new Date();
      const evs = await listEvents(startOfDay(now), addDays(now, 21));
      setEvents(evs);
      return evs;
    } catch (e) {
      if (e instanceof NeedsAuth) lostAuth();
      return [];
    }
  }, [lostAuth]);

  useEffect(() => {
    if (settings.googleClientId) loadGoogle().catch(() => {});
    refreshEvents();
  }, [settings.googleClientId, refreshEvents]);

  /* Gentle in-app nudges while Sift is open (Google Calendar handles reminders otherwise). */
  useEffect(() => {
    const check = async () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      let sent: string[] = [];
      try {
        sent = JSON.parse(localStorage.getItem('sift.notified') || '[]');
      } catch {
        /* ignore */
      }
      const now = Date.now();
      for (const it of items) {
        if (it.status !== 'scheduled' || !it.slot) continue;
        const key = `${it.id}@${it.slot.start}`;
        const t = new Date(it.slot.start).getTime();
        if (t - now > 10 * 60_000 || t < now - 60_000 || sent.includes(key)) continue;
        sent.push(key);
        const body = it.kind === 'idea' ? it.steps.find((s) => !s.done)?.text ?? it.title : it.note;
        try {
          const reg = await navigator.serviceWorker?.getRegistration();
          if (reg) await reg.showNotification(`${it.emoji} ${it.title}`, { body, tag: key, icon: 'icon-192.png' });
          else new Notification(`${it.emoji} ${it.title}`, { body });
        } catch {
          /* ignore */
        }
      }
      try {
        localStorage.setItem('sift.notified', JSON.stringify(sent.slice(-200)));
      } catch {
        /* ignore */
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [items]);

  const itemBusy = (except?: string): Interval[] =>
    items
      .filter((i) => i.id !== except && i.status === 'scheduled' && i.slot && !i.eventId)
      .map((i) => slotToInterval(i.slot!));

  const runSift = async (text: string): Promise<boolean> => {
    if (!text.trim()) return false;
    setBusy(true);
    try {
      const now = new Date();
      const [res, evs] = await Promise.all([
        settings.apiKey ? siftWithClaude(text, settings.apiKey, now) : demoSift(text, now),
        refreshEvents(),
      ]);
      const busyList = [...busyFrom(evs), ...itemBusy()];
      const drafts: Draft[] = res.items.map((a) => {
        const it = toItem(a);
        const slot = findSlot(it, busyList, settings, now);
        if (slot) busyList.push(slotToInterval(slot));
        return { ...it, slot, include: true };
      });
      setReview({ summary: res.summary, drafts });
      return true;
    } catch (e) {
      say(e instanceof SiftError ? e.message : 'Something went wrong. Try again.', true);
      console.error(e);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const patchDraft = (id: string, patch: Partial<Draft>) =>
    setReview((r) => r && { ...r, drafts: r.drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)) });

  const nextSlot = (id: string) => {
    if (!review) return;
    const d = review.drafts.find((x) => x.id === id);
    if (!d) return;
    const others = review.drafts.filter((x) => x.id !== id && x.include && x.slot).map((x) => slotToInterval(x.slot!));
    const after = d.slot ? new Date(new Date(d.slot.start).getTime() + 5 * 60_000) : new Date();
    const slot = findSlot(d, [...busyFrom(events), ...itemBusy(), ...others], settings, after);
    if (slot) patchDraft(id, { slot });
    else say('No other free time found in the next week.', true);
  };

  const confirmReview = async () => {
    if (!review) return;
    setSaving(true);
    const chosen = review.drafts.filter((d) => d.include);
    let gcalOk = connected && isConnected();
    let synced = 0;
    const saved: SiftItem[] = [];
    for (const d of chosen) {
      const { include: _include, ...item } = d;
      void _include;
      const it: SiftItem = { ...item, status: item.slot ? 'scheduled' : 'unscheduled' };
      if (gcalOk && it.slot) {
        try {
          it.eventId = await createEvent(it);
          synced++;
        } catch (e) {
          if (e instanceof NeedsAuth) {
            gcalOk = false;
            lostAuth();
          } else console.error(e);
        }
      }
      saved.push(it);
    }
    setItems((prev) => [...prev, ...saved]);
    setSaving(false);
    setReview(null);
    say(synced ? `Added ${synced} to Google Calendar ✓` : `Saved ${saved.length} to your plan ✓`);
    setTab(saved.some((s) => s.kind === 'task') || saved.every((s) => s.slot) ? 'plan' : 'ideas');
    if (synced) refreshEvents();
  };

  const update = (id: string, fn: (i: SiftItem) => SiftItem) => setItems((prev) => prev.map((i) => (i.id === id ? fn(i) : i)));

  const toggleDone = (id: string) => {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    if (it.kind === 'idea') {
      const k = it.steps.findIndex((s) => !s.done);
      if (k >= 0) {
        update(id, (i) => ({
          ...i,
          steps: i.steps.map((s, j) => (j === k ? { ...s, done: true } : s)),
          status: 'unscheduled',
          slot: null,
          eventId: null,
        }));
        say('Step done. Find time for the next one in Ideas ✨');
      }
      return;
    }
    update(id, (i) => ({ ...i, status: i.status === 'done' ? (i.slot ? 'scheduled' : 'unscheduled') : 'done' }));
  };

  const toggleStep = (id: string, k: number) =>
    update(id, (i) => ({ ...i, steps: i.steps.map((s, j) => (j === k ? { ...s, done: !s.done } : s)) }));

  const planNext = async (id: string) => {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    const now = new Date();
    const evs = await refreshEvents();
    const slot = findSlot(
      { ...it, earliest: '', latest: '', deadline: '' },
      [...busyFrom(evs), ...itemBusy(id)],
      settings,
      now,
    );
    if (!slot) return say('No free time found this week.', true);
    let next: SiftItem = { ...it, slot, status: 'scheduled', eventId: null };
    if (isConnected()) {
      try {
        next = { ...next, eventId: await createEvent(next) };
      } catch (e) {
        if (e instanceof NeedsAuth) lostAuth();
      }
    }
    update(id, () => next);
    say(next.eventId ? 'Next step is on your calendar ✓' : 'Next step planned ✓');
  };

  const archive = async (id: string) => {
    const it = items.find((i) => i.id === id);
    update(id, (i) => ({ ...i, status: 'archived' }));
    if (it?.eventId && it.slot && new Date(it.slot.start) > new Date()) {
      deleteEvent(it.eventId).catch((e) => e instanceof NeedsAuth && lostAuth());
    }
    say('Idea archived');
  };

  const connect = async () => {
    try {
      await connectGoogle(settings.googleClientId);
      setConnected(true);
      say('Google Calendar connected ✓');
      refreshEvents();
    } catch (e) {
      say(`Couldn’t connect: ${(e as Error).message}`, true);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'plan', label: 'Plan', icon: <CalendarDays size={20} /> },
    { id: 'capture', label: 'Capture', icon: <Mic size={22} /> },
    { id: 'ideas', label: 'Ideas', icon: <Lightbulb size={20} /> },
  ];

  return (
    <div className="app">
      <div className="aurora" aria-hidden>
        <span className="a1" />
        <span className="a2" />
        <span className="a3" />
      </div>
      <div className="grain" aria-hidden />

      <div className="topbar">
        <div className="brand">
          <span className="brand-dot" /> sift
        </div>
        <div className="topbar-right">
          {!settings.apiKey && (
            <button className="demo-pill" onClick={() => setSettingsOpen(true)}>
              Demo
            </button>
          )}
          <button className="icon-ghost" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            <Settings2 size={20} />
          </button>
        </div>
      </div>

      <main className="main">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            {tab === 'capture' && (
              <CaptureView name={settings.name} busy={busy} demo={!settings.apiKey} onSift={runSift} />
            )}
            {tab === 'plan' && <PlanView items={items} events={events} onToggleDone={toggleDone} />}
            {tab === 'ideas' && (
              <IdeasView items={items} onToggleStep={toggleStep} onPlanNext={planNext} onArchive={archive} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="tabbar">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''} ${t.id === 'capture' ? 'center' : ''}`}
            onClick={() => setTab(t.id)}
            aria-label={t.label}
          >
            {tab === t.id && <motion.span layoutId="tab-pill" className="tab-pill" />}
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <AnimatePresence>
        {review && (
          <ReviewSheet
            summary={review.summary}
            drafts={review.drafts}
            connected={connected}
            saving={saving}
            onChange={patchDraft}
            onNextSlot={nextSlot}
            onConfirm={confirmReview}
            onClose={() => setReview(null)}
          />
        )}
        {settingsOpen && (
          <SettingsSheet
            settings={settings}
            onChange={setSettings}
            connected={connected}
            onConnect={connect}
            onDisconnect={() => {
              disconnect();
              setConnected(false);
              setEvents([]);
            }}
            onClearData={() => {
              if (confirm('Delete all tasks and ideas saved in Sift? (Google Calendar events stay.)')) setItems([]);
            }}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            className={`toast ${toast.bad ? 'bad' : ''}`}
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
