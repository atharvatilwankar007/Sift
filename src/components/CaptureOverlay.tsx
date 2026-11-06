import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Keyboard, Mic, Square, Wand2, X } from 'lucide-react';
import { Orb } from './Orb';
import { useVoice } from '../lib/voice';
import { DEMO_DUMP } from '../lib/ai';
import { GrowText, haptic, spring } from './ui';

const THINKING = ['Untangling your thoughts…', 'Matching it to what you already have…', 'Separating ideas from to-dos…', 'Finding the right moments…'];

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function CaptureOverlay({
  busy,
  demo,
  typeFirst,
  onSift,
  onClose,
}: {
  busy: boolean;
  demo: boolean;
  typeFirst?: boolean;
  onSift: (text: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const energy = useRef(0);
  const voice = useVoice((l) => {
    energy.current = Math.max(energy.current, l);
  });
  const [editing, setEditing] = useState(!!typeFirst);
  const [line, setLine] = useState(0);
  const started = useRef(false);
  const recording = voice.phase === 'recording';
  const transcribing = voice.phase === 'transcribing';
  const hasText = voice.text.trim().length > 0;

  // Start listening straight away: one tap from anywhere to talking.
  useEffect(() => {
    if (started.current || typeFirst) return;
    started.current = true;
    voice.start();
  }, [voice, typeFirst]);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setLine((l) => (l + 1) % THINKING.length), 1400);
    return () => clearInterval(id);
  }, [busy]);

  const mode = busy || transcribing ? 'thinking' : recording ? 'listening' : 'idle';
  const locked = busy || transcribing;

  const toggle = () => {
    if (locked) return;
    haptic(10);
    if (recording) voice.stop();
    else {
      setEditing(false);
      voice.start();
    }
  };

  const close = () => {
    voice.stop();
    onClose();
  };

  let status: string;
  if (busy) status = THINKING[line];
  else if (transcribing)
    status = voice.download.ready ? 'Turning your voice into text…' : `Setting up voice (one time)… ${voice.download.pct}%`;
  else if (recording) status = 'Listening · pause as long as you like';
  else if (hasText) status = 'Add more, edit, or sift it';
  else status = 'Tap the orb to talk';

  return (
    <motion.div className="capture" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
      <motion.div className="capture-bg" initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.2, opacity: 0 }} transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }} />

      <div className="capture-top">
        <button className="icon-ghost" onClick={close} aria-label="Close">
          <X size={22} />
        </button>
        {!locked && (
          <button
            className="icon-ghost"
            onClick={() => {
              voice.stop();
              setEditing(true);
            }}
            aria-label="Type instead"
          >
            <Keyboard size={20} />
          </button>
        )}
      </div>

      <div className="capture-main">
        <motion.button layoutId="mic" className={`orb-btn ${mode}`} onClick={toggle} disabled={locked} aria-label={recording ? 'Finish' : 'Talk'} transition={spring}>
          <div className="orb-halo" />
          <Orb mode={mode} energy={energy} size={250} />
          <span className={`orb-icon ${recording ? 'rec' : ''}`}>
            {recording ? <Square size={20} fill="currentColor" /> : <Mic size={26} />}
          </span>
        </motion.button>

        {recording && <div className="timer">{mmss(voice.elapsed)}</div>}

        <div className="status-line">
          <AnimatePresence mode="wait">
            <motion.p key={status.replace(/\d+%$/, '')} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              {status}
            </motion.p>
          </AnimatePresence>
        </div>
        {voice.error && <p className="error-text">{voice.error}</p>}

        <div className="transcript">
          {editing ? (
            <GrowText
              className="transcript-edit"
              value={voice.text}
              onChange={voice.setText}
              autoFocus
              placeholder="Type your ramble… “café idea, call grandma Saturday at 5, pay my card bill…”"
            />
          ) : hasText ? (
            <p className="words" onClick={() => !locked && setEditing(true)} title="Tap to edit">
              {voice.text.split(/\s+/).map((w, i) => (
                <motion.span key={`${i}-${w}`} initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: Math.min(i * 0.025, 1.2), duration: 0.3 }}>
                  {w}{' '}
                </motion.span>
              ))}
            </p>
          ) : null}
        </div>
      </div>

      <div className="capture-actions">
        <AnimatePresence>
          {hasText && !recording && !transcribing && (
            <motion.div className="cap-row" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={spring}>
              <button className="btn-soft round" onClick={toggle} disabled={busy} aria-label="Add more by voice">
                <Mic size={18} />
              </button>
              <button className="btn-primary big" disabled={busy} onClick={() => onSift(voice.text).then((ok) => ok && voice.reset())}>
                <Wand2 size={18} /> {busy ? 'Sifting…' : 'Sift it'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {demo && !hasText && !recording && !locked && (
          <button
            className="link-btn"
            onClick={() => {
              setEditing(false);
              voice.setText(DEMO_DUMP);
            }}
          >
            Demo mode · use a sample ramble
          </button>
        )}
      </div>
    </motion.div>
  );
}
