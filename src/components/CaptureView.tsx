import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Mic, Square, Sparkles, X, Wand2 } from 'lucide-react';
import { Orb } from './Orb';
import { useSpeech } from '../lib/speech';
import { DEMO_DUMP } from '../lib/ai';
import { greeting } from '../lib/dates';

const THINKING = [
  'Untangling your thoughts…',
  'Separating ideas from to-dos…',
  'Checking your calendar…',
  'Finding the right moments…',
];

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
  const speech = useSpeech(() => {
    energy.current = Math.min(1, energy.current + 0.45);
  });
  const [line, setLine] = useState(0);

  useEffect(() => {
    if (!busy) return;
    setLine(0);
    const id = setInterval(() => setLine((l) => (l + 1) % THINKING.length), 1500);
    return () => clearInterval(id);
  }, [busy]);

  const mode = busy ? 'thinking' : speech.listening ? 'listening' : 'idle';
  const hasText = speech.text.trim().length > 0;

  const toggle = () => {
    if (busy) return;
    if (speech.listening) speech.stop();
    else speech.start();
  };

  const submit = async () => {
    if (speech.listening) speech.stop();
    const ok = await onSift(speech.text);
    if (ok) speech.reset();
  };

  return (
    <div className="capture">
      <header className="capture-head">
        <p className="eyebrow">
          {greeting()}
          {name ? `, ${name}` : ''}
        </p>
        <h1 className="display">
          What’s on <em>your mind?</em>
        </h1>
      </header>

      <button
        className={`orb-btn ${mode}`}
        onClick={toggle}
        aria-label={speech.listening ? 'Stop listening' : 'Start talking'}
        disabled={busy}
      >
        <div className="orb-halo" />
        <Orb mode={mode} energy={energy} />
        <span className="orb-icon">
          {busy ? <Sparkles size={26} /> : speech.listening ? <Square size={22} fill="currentColor" /> : <Mic size={28} />}
        </span>
      </button>

      <div className="status-line">
        <AnimatePresence mode="wait">
          <motion.p
            key={busy ? `t${line}` : mode}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            {busy
              ? THINKING[line]
              : speech.listening
                ? 'Listening… ramble away, tap to stop'
                : hasText
                  ? 'Edit if you like, then sift it'
                  : 'Tap the orb and talk. Ideas, tasks, anything.'}
          </motion.p>
        </AnimatePresence>
      </div>

      {speech.error && <p className="error-text">{speech.error}</p>}

      <div className={`dump ${speech.listening ? 'live' : ''}`}>
        <textarea
          value={speech.text}
          onChange={(e) => speech.setText(e.target.value)}
          readOnly={speech.listening || busy}
          placeholder="…or type here. “Saw a cool idea for a café app, need to call grandma this weekend, pay my card bill…”"
          rows={4}
        />
        {hasText && !speech.listening && !busy && (
          <button className="icon-ghost clear" onClick={speech.reset} aria-label="Clear">
            <X size={16} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {hasText && !speech.listening && (
          <motion.button
            className="btn-primary big"
            onClick={submit}
            disabled={busy}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <Wand2 size={18} /> {busy ? 'Sifting…' : 'Sift it'}
          </motion.button>
        )}
      </AnimatePresence>

      {demo && !hasText && !speech.listening && !busy && (
        <button className="link-btn" onClick={() => speech.setText(DEMO_DUMP)}>
          Demo mode · try a sample ramble
        </button>
      )}
    </div>
  );
}
