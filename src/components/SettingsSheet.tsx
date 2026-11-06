import { useState } from 'react';
import { motion } from 'motion/react';
import { Bell, CalendarCheck2, Eye, EyeOff, KeyRound, Trash2, X } from 'lucide-react';
import type { Settings } from '../lib/types';
import { providerFor } from '../lib/ai';

export function SettingsSheet({
  settings,
  onChange,
  connected,
  onConnect,
  onDisconnect,
  onClearData,
  onClose,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onClearData: () => void;
  onClose: () => void;
}) {
  const [show, setShow] = useState(false);
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' });

  return (
    <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 260 }}
      >
        <div className="sheet-grip" />
        <header className="sheet-head">
          <h2 className="display small">Settings</h2>
          <button className="icon-ghost" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>
        <div className="sheet-body form">
          <label className="field">
            <span>What should I call you?</span>
            <input value={settings.name} onChange={(e) => set({ name: e.target.value })} placeholder="Your first name" />
          </label>

          <div className="group">
            <h3 className="section-label">
              <KeyRound size={13} /> AI key (Gemini or Claude)
            </h3>
            <div className="field-row">
              <input
                type={show ? 'text' : 'password'}
                value={settings.apiKey}
                onChange={(e) => set({ apiKey: e.target.value.trim() })}
                placeholder="Paste your Gemini key (AIza…)"
                autoComplete="off"
                spellCheck={false}
              />
              <button className="icon-ghost" onClick={() => setShow(!show)} aria-label={show ? 'Hide key' : 'Show key'}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="hint">
              {settings.apiKey && (
                <>
                  Using <b>{providerFor(settings.apiKey) === 'claude' ? 'Claude' : 'Gemini'}</b>.{' '}
                </>
              )}
              Stored only on this phone. Get a free key at{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                aistudio.google.com/apikey
              </a>
              . A Claude key (sk-ant-…) works too. Without a key Sift runs in demo mode.
            </p>
          </div>

          <div className="group">
            <h3 className="section-label">
              <CalendarCheck2 size={13} /> Google Calendar
            </h3>
            <label className="field">
              <span>OAuth Client ID</span>
              <input
                value={settings.googleClientId}
                onChange={(e) => set({ googleClientId: e.target.value.trim() })}
                placeholder="1234…apps.googleusercontent.com"
                spellCheck={false}
              />
            </label>
            {connected ? (
              <div className="field-row between">
                <span className="ok-pill">● Connected</span>
                <button className="btn-soft" onClick={onDisconnect}>
                  Disconnect
                </button>
              </div>
            ) : (
              <button className="btn-soft" disabled={!settings.googleClientId} onClick={onConnect}>
                Connect Google Calendar
              </button>
            )}
            <p className="hint">Events get phone reminders through the Google Calendar app.</p>
          </div>

          <div className="group">
            <h3 className="section-label">My day</h3>
            <div className="field-row">
              <label className="field">
                <span>Plan from</span>
                <select value={settings.dayStart} onChange={(e) => set({ dayStart: Number(e.target.value) })}>
                  {hours.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>until</span>
                <select value={settings.dayEnd} onChange={(e) => set({ dayEnd: Number(e.target.value) })}>
                  {hours.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="group">
            <h3 className="section-label">
              <Bell size={13} /> In-app nudges
            </h3>
            {perm === 'granted' ? (
              <p className="hint">On. Sift also pings you while it’s open, 10 minutes before things.</p>
            ) : (
              <button
                className="btn-soft"
                disabled={perm === 'denied' || typeof Notification === 'undefined'}
                onClick={async () => setPerm(await Notification.requestPermission())}
              >
                Allow notifications
              </button>
            )}
          </div>

          <button className="btn-danger" onClick={onClearData}>
            <Trash2 size={15} /> Clear all my tasks & ideas
          </button>
          <p className="hint center">Sift · your thoughts, sorted</p>
        </div>
      </motion.section>
    </motion.div>
  );
}
