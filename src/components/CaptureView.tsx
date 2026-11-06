import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Mic, Square, Sparkles, X, Wand2 } from 'lucide-react';
import { Orb } from './Orb';
import { useVoice } from '../lib/voice';
import { DEMO_DUMP } from '../lib/ai';
import { greeting } from '../lib/dates';

const THINKING = [
  'Untangling your thoughts…',
  'Separating ideas from to-dos…',
  'Checking your calendar…',
  'Finding the right moments…',
];

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function CaptureView({
  name,
  busy,
  demo,
  onSift,
}: {
  name: string;
  busy: boolean;
  demo: boolean;
  onSift: (text: string) => Promise<boolean>;
}) {
  const energy = useRef(0);
  const voice = useVoice((lvl) => {
    energy.current = Math.max(energy.current, lvl);
  });
  const [line, setLine] = useState(0);
  const recording = voice.phase === 'recording';
  const transcribing = voice.phase === 'transcribing';

  useEffect(() => {
    if (!busy) return;
    setLine(0);
    const id = setInterval(() => setLine((l) => (l + 1) % THINKING.length), 1500);
    return () => clearInterval(id);
  }, [busy]);

  const mode = busy || transcribing ? 'thinking' : recording ? 'listening' : 'idle';
  const hasText = voice.text.trim().length > 0;
  const locked = busy || transcribing;

  const toggle = () => {
    if (locked) return;
    if (recording) voice.stop();
    else voice.start();
  };

  const submit = async () => {
    const ok = await onSift(voice.text);
    if (ok) voice.reset();
  };

  let status: string;
  if (busy) status = THINKING[line];
  else if (transcribing)
    status = voice.download.ready
      ? 'Turning your voice into text…'
      : `Getting the voice model ready (one time)… ${voice.download.pct}%`;
  else if (recording) status = `Listening · ${mmss(voice.elapsed)} · pause as long as you like`;
  else if (hasText) status = 'Add more, edit, or sift it';
  else status = 'Tap and talk. Ideas, tasks, anything.';

  return (
    <div className="capture">
      <header className="capture-head">
        <p className="eyebrow">
          {greeting()}
          {name ? `, ${name}` : ''}
        </p>
        <h1 className="display">What’s on your mind?</h1>
      </header>

      <button
        className={`orb-btn ${mode}`}
        onClick={toggle}
        aria-label={recording ? 'Stop and transcribe' : 'Start talking'}
        disabled={locked}
      >
        <div className="orb-halo" />
        <Orb mode={mode} energy={energy} />
        <span className={`orb-icon ${recording ? 'rec' : ''}`}>
          {locked ? <Sparkles size={24} /> : recording ? <Square size={20} fill="currentColor" /> : <Mic size={26} />}
        </span>
      </button>

      <div className="status-line">
        <AnimatePresence mode="wait">
          <motion.p
            key={busy ? `t${line}` : transcribing ? 'tr' : recording ? 'rec' : hasText ? 'has' : 'idle'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {status}
          </motion.p>
        </AnimatePresence>
      </div>

      {voice.error && <p className="error-text">{voice.error}</p>}

      <div className={`dump ${recording ? 'live' : ''}`}>
        <textarea
          value={voice.text}
          onChange={(e) => voice.setText(e.target.value)}
          readOnly={locked}
          placeholder="…or type here. “Saw a cool idea for a café app, need to call grandma this weekend, pay my card bill…”"
          rows={4}
        />
        {hasText && !recording && !locked && (
          <button className="icon-ghost clear" onClick={voice.reset} aria-label="Clear">
            <X size={16} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {hasText && !recording && !transcribing && (
          <motion.button
            className="btn-primary big"
            onClick={submit}
            disabled={busy}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <Wand2 size={18} /> {busy ? 'Sifting…' : 'Sift it'}
          </motion.button>
        )}
      </AnimatePresence>

      {demo && !hasText && voice.phase === 'idle' && !busy && (
        <button className="link-btn" onClick={() => voice.setText(DEMO_DUMP)}>
          Demo mode · try a sample ramble
        </button>
      )}
    </div>
  );
}
