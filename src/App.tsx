import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, Lightbulb, Mic, Settings2 } from 'lucide-react';
import { CaptureOverlay } from './components/CaptureOverlay';
import { ReviewSheet, type Draft, type UpdateDraft } from './components/ReviewSheet';
import { TodayView } from './components/TodayView';
import { IdeasView } from './components/IdeasView';
import { TaskSheet } from './components/TaskSheet';
import { IdeaSheet } from './components/IdeaSheet';
import { SettingsSheet } from './components/SettingsSheet';
import { haptic, spring } from './components/ui';
import { useStored } from './lib/store';
import type { AiUpdate, CalEvent, Interval, Settings, SiftItem } from './lib/types';
import { siftDump, SiftError } from './lib/ai';
import { findSlot, slotToInterval } from './lib/scheduler';
import { fromAi, nextStep, normalize, step } from './lib/items';
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

type Tab = 'today' | 'ideas';
type Toast = { text: string; bad?: boolean; undo?: () => void };

// Public OAuth client for this app (not a secret: Google only accepts it from the allowed origins).
const GOOGLE_CLIENT_ID = '750594411332-kq31dopcci6met9b612et71j7664q3ev.apps.googleusercontent.com';
const DEFAULT_SETTINGS: Settings = { name: '', apiKey: '', googleClientId: '', dayStart: 8, dayEnd: 22 };
const TABS: Tab[] = ['today', 'ideas'];

export default function App() {
  const [items, setItems] = useStored<SiftItem[]>('sift.items', [], normalize);
  const [storedSettings, setSettings] = useStored<Settings>('sift.settings', DEFAULT_SETTINGS);
  const settings: Settings = { ...storedSettings, googleClientId: storedSettings.googleClientId || GOOGLE_CLIENT_ID };
  const [tab, setTab] = useState<Tab>('today');
  const [dir, setDir] = useState(1);
  const [capture, setCapture] = useState<false | 'voice' | 'type'>(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState<{ summary: string; drafts: Draft[]; updates: UpdateDraft[] } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connected, setConnected] = useState(isConnected());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const dirty = useRef(new Set<string>());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const say = useCallback((text: string, bad = false, undo?: () => void) => {
    setToast({ text, bad, undo });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), undo ? 5000 : 3400);
  }, []);

  const lostAuth = useCallback(() => {
    setConnected(false);
    say('Google sign-in expired. Reconnect in Settings.', true);
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

  /* In-app nudges while Sift is open (Google Calendar handles reminders otherwise). */
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
      for (const it of itemsRef.current) {
        if (it.status !== 'scheduled' || !it.slot) continue;
        const key = `${it.id}@${it.slot.start}`;
        const t = new Date(it.slot.start).getTime();
        if (t - now > 10 * 60_000 || t < now - 60_000 || sent.includes(key)) continue;
        sent.push(key);
        const body = it.kind === 'idea' ? nextStep(it)?.text ?? it.title : it.note;
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
  }, []);

  /* ---------- helpers ---------- */

  const busyFromItems = (except?: string): Interval[] =>
    itemsRef.current
      .filter((i) => i.id !== except && i.status === 'scheduled' && i.slot && !i.eventId)
      .map((i) => slotToInterval(i.slot!));

  const update = useCallback(
    (id: string, patch: Partial<SiftItem>, markDirty = true) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: new Date().toISOString() } : i)));
      if (markDirty) dirty.current.add(id);
    },
    [setItems],
  );

  /** Push an item's current state to Google Calendar (create, update or remove its event). */
  const syncCalendar = useCallback(
    async (it: SiftItem) => {
      if (!isConnected()) return;
      const wantsEvent =
        it.slot && it.status !== 'archived' && it.stage !== 'killed' && it.stage !== 'parked' && new Date(it.slot.end) > new Date();
      try {
        if (wantsEvent) {
          const eventId = await createEvent(it);
          if (eventId !== it.eventId) update(it.id, { eventId }, false);
        } else if (it.eventId && it.slot && new Date(it.slot.start) > new Date()) {
          await deleteEvent(it.eventId);
          update(it.id, { eventId: null }, false);
        }
      } catch (e) {
        if (e instanceof NeedsAuth) lostAuth();
        else console.error(e);
      }
    },
    [update, lostAuth],
  );

  const closeSheet = () => {
    const id = openId;
    setOpenId(null);
    if (id && dirty.current.has(id)) {
      dirty.current.delete(id);
      const it = itemsRef.current.find((i) => i.id === id);
      if (it && isConnected()) syncCalendar(it).then(() => void refreshEvents());
    }
  };

  /* ---------- sifting ---------- */

  const runSift = async (text: string): Promise<boolean> => {
    if (!text.trim()) return false;
    setBusy(true);
    try {
      const now = new Date();
      const [res, evs] = await Promise.all([siftDump(text, itemsRef.current, settings.apiKey, now), refreshEvents()]);
      const busyList = [...busyFrom(evs), ...busyFromItems()];
      const drafts: Draft[] = res.creates.map((a) => {
        const it = fromAi(a);
        const schedulable = it.kind === 'task' || nextStep(it);
        const slot = schedulable ? findSlot(it, busyList, settings, now) : null;
        if (slot) busyList.push(slotToInterval(slot));
        return { ...it, slot, include: true };
      });
      const byId = new Map(itemsRef.current.map((i) => [i.id, i]));
      const updates: UpdateDraft[] = res.updates.map((u) => ({ u, target: byId.get(u.target_id)!, include: true }));
      setCapture(false);
      setReview({ summary: res.summary, drafts, updates });
      return true;
    } catch (e) {
      say(e instanceof SiftError ? e.message : 'Something went wrong. Try again.', true);
      console.error(e);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const applyUpdate = (it: SiftItem, u: AiUpdate, busyList: Interval[]): SiftItem => {
    const n: SiftItem = { ...it, updatedAt: new Date().toISOString() };
    if (u.action === 'complete') {
      if (n.kind === 'idea') {
        const s = nextStep(n);
        if (s) n.steps = n.steps.map((x) => (x.id === s.id ? { ...x, done: true } : x));
        n.status = 'unscheduled';
        n.slot = null;
      } else n.status = 'done';
      return n;
    }
    if (u.action === 'cancel') {
      if (n.kind === 'idea') n.stage = 'killed';
      else n.status = 'archived';
      return n;
    }
    if (u.title) n.title = u.title;
    if (u.note_append) {
      if (n.kind === 'idea') n.notes = [...n.notes, u.note_append];
      else n.note = n.note ? `${n.note} · ${u.note_append}` : u.note_append;
    }
    if (u.add_user_steps?.length) {
      const fresh = u.add_user_steps.map((t) => step(t, 'mine'));
      n.steps = [...n.steps.filter((s) => s.accepted), ...fresh, ...n.steps.filter((s) => !s.accepted)];
    }
    if (u.deadline) n.deadline = u.deadline;
    const timing = u.earliest_date || u.latest_date || u.specific_time || u.time_of_day;
    if (timing) {
      n.earliest = u.earliest_date || n.earliest;
      n.latest = u.latest_date || u.earliest_date || n.latest;
      n.specificTime = u.specific_time;
      if (u.time_of_day) n.timeOfDay = u.time_of_day;
      const slot = findSlot(n, busyList, settings);
      if (slot) {
        n.slot = slot;
        n.status = 'scheduled';
        busyList.push(slotToInterval(slot));
      }
    }
    return n;
  };

  const confirmReview = async () => {
    if (!review) return;
    setSaving(true);
    const busyList = [...busyFrom(events), ...busyFromItems()];
    const changed = new Map<string, SiftItem>();
    for (const x of review.updates) {
      if (!x.include) continue;
      const base = changed.get(x.target.id) ?? itemsRef.current.find((i) => i.id === x.target.id);
      if (base) changed.set(base.id, applyUpdate(base, x.u, busyList));
    }
    const created: SiftItem[] = review.drafts
      .filter((d) => d.include)
      .map(({ include: _drop, ...d }) => {
        void _drop;
        return { ...d, status: d.slot ? 'scheduled' : 'unscheduled' };
      });
    setItems((prev) => [...prev.map((i) => changed.get(i.id) ?? i), ...created]);
    setReview(null);
    setSaving(false);
    haptic(18);
    const n = created.length + changed.size;
    say(`Saved ${n} ${n === 1 ? 'thing' : 'things'} ✓`);
    setDir(created.some((c) => c.kind === 'task') || changed.size ? -1 : 1);
    setTab(created.length && created.every((c) => c.kind === 'idea') ? 'ideas' : 'today');
    if (isConnected()) {
      for (const it of [...changed.values(), ...created]) await syncCalendar(it);
      refreshEvents();
    }
  };

  const nextSlotForDraft = (id: string) => {
    if (!review) return;
    const d = review.drafts.find((x) => x.id === id);
    if (!d) return;
    const others = review.drafts.filter((x) => x.id !== id && x.include && x.slot).map((x) => slotToInterval(x.slot!));
    const after = d.slot ? new Date(new Date(d.slot.start).getTime() + 5 * 60_000) : new Date();
    const slot = findSlot({ ...d, specificTime: '' }, [...busyFrom(events), ...busyFromItems(), ...others], settings, after);
    if (slot) setReview({ ...review, drafts: review.drafts.map((x) => (x.id === id ? { ...x, slot } : x)) });
    else say('No other free time found in the next week.', true);
  };

  /* ---------- item actions ---------- */

  const toggleDone = (id: string) => {
    const it = itemsRef.current.find((i) => i.id === id);
    if (!it) return;
    if (it.kind === 'idea') {
      const s = nextStep(it);
      if (!s) return;
      update(id, { steps: it.steps.map((x) => (x.id === s.id ? { ...x, done: true } : x)), status: 'unscheduled', slot: null, eventId: null }, false);
      say('Step done ✓ Pick the next one in Ideas.');
      return;
    }
    update(id, { status: it.status === 'done' ? (it.slot ? 'scheduled' : 'unscheduled') : 'done' }, false);
  };

  const remove = (id: string) => {
    const it = itemsRef.current.find((i) => i.id === id);
    if (!it) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (openId === id) setOpenId(null);
    if (it.eventId && it.slot && new Date(it.slot.start) > new Date()) {
      deleteEvent(it.eventId).catch((e) => e instanceof NeedsAuth && lostAuth());
    }
    say(`Deleted “${it.title}”`, false, () => {
      const back = { ...it, eventId: null };
      setItems((prev) => [...prev, back]);
      if (isConnected()) syncCalendar(back);
      setToast(null);
    });
  };

  const findSlotFor = async (id: string) => {
    const it = itemsRef.current.find((i) => i.id === id);
    if (!it) return;
    const evs = await refreshEvents();
    const slot = findSlot({ ...it, specificTime: '', earliest: '', latest: '', deadline: '' }, [...busyFrom(evs), ...busyFromItems(id)], settings, new Date());
    if (!slot) return say('No free time found this week.', true);
    update(id, { slot, status: 'scheduled', specificTime: '' });
    say('Found a slot ✓');
  };

  const planNext = async (id: string) => {
    const it = itemsRef.current.find((i) => i.id === id);
    if (!it || !nextStep(it)) return;
    const evs = await refreshEvents();
    const after = it.slot && new Date(it.slot.end) > new Date() ? new Date(new Date(it.slot.start).getTime() + 5 * 60_000) : new Date();
    const slot = findSlot({ ...it, specificTime: '', earliest: '', latest: '', deadline: '' }, [...busyFrom(evs), ...busyFromItems(id)], settings, after);
    if (!slot) return say('No free time found this week.', true);
    const next = { ...it, slot, status: 'scheduled' as const };
    update(id, { slot, status: 'scheduled' });
    if (isConnected()) {
      await syncCalendar(next);
      dirty.current.delete(id);
    }
    say(isConnected() ? 'Next step is on your calendar ✓' : 'Next step planned ✓');
  };

  const setStage = (id: string, stage: SiftItem['stage']) => {
    update(id, { stage });
    const it = itemsRef.current.find((i) => i.id === id);
    if (it) syncCalendar({ ...it, stage });
    say(stage === 'parked' ? 'Parked for later' : stage === 'killed' ? 'Let go. It’s in the “Let go” tab if you change your mind.' : 'Back in motion');
  };

  const syncAll = async () => {
    const todo = itemsRef.current.filter((i) => i.status === 'scheduled' && i.slot && !i.eventId && new Date(i.slot.end) > new Date());
    for (const it of todo) await syncCalendar(it);
    refreshEvents();
    say(`Added ${todo.length} to Google Calendar ✓`);
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

  const go = (t: Tab) => {
    setDir(TABS.indexOf(t) > TABS.indexOf(tab) ? 1 : -1);
    setTab(t);
  };

  const open = openId ? items.find((i) => i.id === openId) : undefined;
  const unsynced = items.filter((i) => i.status === 'scheduled' && i.slot && !i.eventId && new Date(i.slot.end) > new Date()).length;

  return (
    <div className="app">
      <div className="glow" aria-hidden />
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
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={tab}
            custom={dir}
            variants={{
              enter: (d: number) => ({ x: d * 60, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => ({ x: d * -60, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={spring}
          >
            {tab === 'today' ? (
              <TodayView items={items} events={events} onOpen={setOpenId} onToggleDone={toggleDone} onDelete={remove} />
            ) : (
              <IdeasView items={items} onOpen={setOpenId} onStage={setStage} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="tabbar">
        <button className={`tab ${tab === 'today' ? 'active' : ''}`} onClick={() => go('today')} aria-label="Today">
          <CalendarDays size={21} />
          <span>Today</span>
        </button>
        <div className="fab-slot">
          {!capture && (
            <motion.button
              layoutId="mic"
              className="fab"
              onClick={() => {
                haptic(12);
                setCapture('voice');
              }}
              aria-label="Talk to Sift"
              whileTap={{ scale: 0.92 }}
              transition={spring}
            >
              <Mic size={24} />
            </motion.button>
          )}
        </div>
        <button className={`tab ${tab === 'ideas' ? 'active' : ''}`} onClick={() => go('ideas')} aria-label="Ideas">
          <Lightbulb size={21} />
          <span>Ideas</span>
        </button>
      </nav>

      <AnimatePresence>
        {capture && (
          <CaptureOverlay key="capture" busy={busy} demo={!settings.apiKey} typeFirst={capture === 'type'} onSift={runSift} onClose={() => setCapture(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {review && (
          <ReviewSheet
            key="review"
            summary={review.summary}
            drafts={review.drafts}
            updates={review.updates}
            connected={connected}
            saving={saving}
            onChange={(id, patch) => setReview((r) => r && { ...r, drafts: r.drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)) })}
            onToggleUpdate={(i) => setReview((r) => r && { ...r, updates: r.updates.map((u, j) => (j === i ? { ...u, include: !u.include } : u)) })}
            onNextSlot={nextSlotForDraft}
            onConfirm={confirmReview}
            onClose={() => setReview(null)}
          />
        )}
        {open && open.kind === 'task' && (
          <TaskSheet
            key={`t-${open.id}`}
            item={open}
            onChange={(p) => update(open.id, p)}
            onFindSlot={() => findSlotFor(open.id)}
            onDelete={() => remove(open.id)}
            onClose={closeSheet}
          />
        )}
        {open && open.kind === 'idea' && (
          <IdeaSheet
            key={`i-${open.id}`}
            item={open}
            apiKey={settings.apiKey}
            onChange={(p) => update(open.id, p)}
            onPlanNext={() => planNext(open.id)}
            onDelete={() => remove(open.id)}
            onClose={closeSheet}
            say={say}
          />
        )}
        {settingsOpen && (
          <SettingsSheet
            key="settings"
            settings={settings}
            onChange={setSettings}
            connected={connected}
            unsynced={unsynced}
            onSync={syncAll}
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
            initial={{ opacity: 0, y: 24, x: '-50%', scale: 0.96 }}
            animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
            exit={{ opacity: 0, y: 24, x: '-50%' }}
            transition={spring}
          >
            <span>{toast.text}</span>
            {toast.undo && (
              <button className="toast-undo" onClick={toast.undo}>
                Undo
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
