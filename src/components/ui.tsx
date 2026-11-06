import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useDragControls, useMotionValue, useTransform } from 'motion/react';
import { Check as CheckIcon, Loader2, Mic, Square, Trash2 } from 'lucide-react';
import { useVoice } from '../lib/voice';

export const spring = { type: 'spring', damping: 30, stiffness: 320 } as const;

export const haptic = (ms = 10) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
};

/* ---------- Bottom sheet: drag the handle down to dismiss ---------- */

export function Sheet({
  onClose,
  children,
  full,
  label,
}: {
  onClose: () => void;
  children: ReactNode;
  full?: boolean;
  label: string;
}) {
  const controls = useDragControls();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <motion.div
      className="sheet-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.section
        className={`sheet ${full ? 'full' : ''}`}
        role="dialog"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={spring}
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, i) => {
          if (i.offset.y > 110 || i.velocity.y > 650) onClose();
        }}
      >
        <div className="sheet-grip-area" onPointerDown={(e) => controls.start(e)}>
          <div className="sheet-grip" />
        </div>
        {children}
      </motion.section>
    </motion.div>
  );
}

/* ---------- Check: animated tick with a little burst ---------- */

const BURST = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);

export function Check({
  on,
  onToggle,
  size = 'md',
  label,
}: {
  on: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md';
  label: string;
}) {
  const [burst, setBurst] = useState(0);
  return (
    <button
      className={`check ${size} ${on ? 'on' : ''}`}
      aria-label={label}
      aria-pressed={on}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (!on) {
          setBurst((b) => b + 1);
          haptic(14);
        }
        onToggle();
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        <motion.path
          d="M5 12.5l4.2 4.2L19 7"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        />
      </svg>
      {burst > 0 && (
        <span className="burst" key={burst} aria-hidden>
          {BURST.map((a, i) => (
            <motion.i
              key={i}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: Math.cos(a) * 22, y: Math.sin(a) * 22, opacity: 0, scale: 0.4 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          ))}
        </span>
      )}
    </button>
  );
}

/* ---------- Swipe row: right = done, left = delete; tap = open ---------- */

export function SwipeRow({
  children,
  onDone,
  onDelete,
  onOpen,
  doneLabel = 'Done',
}: {
  children: ReactNode;
  onDone: () => void;
  onDelete: () => void;
  onOpen: () => void;
  doneLabel?: string;
}) {
  const x = useMotionValue(0);
  const doneO = useTransform(x, [16, 90], [0, 1]);
  const delO = useTransform(x, [-16, -90], [0, 1]);
  const armed = useRef(false);
  const dragged = useRef(false);
  return (
    <div className="swipe">
      <motion.div className="swipe-bg done" style={{ opacity: doneO }}>
        <CheckIcon size={18} strokeWidth={3} /> {doneLabel}
      </motion.div>
      <motion.div className="swipe-bg del" style={{ opacity: delO }}>
        Delete <Trash2 size={17} />
      </motion.div>
      <motion.div
        className="swipe-fg"
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.55}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDrag={(_, i) => {
          const past = Math.abs(i.offset.x) > 90;
          if (past && !armed.current) haptic(8);
          armed.current = past;
        }}
        onDragEnd={(_, i) => {
          armed.current = false;
          if (i.offset.x > 90) onDone();
          else if (i.offset.x < -90) onDelete();
          // let the click that ends a swipe pass without opening the item
          setTimeout(() => {
            dragged.current = false;
          }, 50);
        }}
        onClick={() => {
          if (!dragged.current) onOpen();
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      >
        {children}
      </motion.div>
    </div>
  );
}

/* ---------- Segmented control with a sliding pill ---------- */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  id,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (v: T) => void;
  id: string;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {value === o.value && <motion.span layoutId={`seg-${id}`} className="seg-pill" transition={spring} />}
          <span className="seg-label">
            {o.label}
            {o.count != null && o.count > 0 && <em>{o.count}</em>}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Mic button for any text field (on-device Whisper) ---------- */

export function MicButton({ onText, label = 'Speak' }: { onText: (t: string) => void; label?: string }) {
  const level = useRef(0);
  const voice = useVoice((l) => {
    level.current = l;
  });
  const cb = useRef(onText);
  cb.current = onText;
  useEffect(() => {
    if (voice.text.trim()) {
      cb.current(voice.text.trim());
      voice.reset();
    }
  }, [voice.text, voice]);
  const busy = voice.phase === 'transcribing';
  const rec = voice.phase === 'recording';
  return (
    <button
      type="button"
      className={`mic-mini ${rec ? 'rec' : ''}`}
      aria-label={rec ? 'Stop' : label}
      title={voice.error ?? label}
      disabled={busy}
      onClick={() => (rec ? voice.stop() : voice.start())}
    >
      {busy ? <Loader2 size={15} className="spin" /> : rec ? <Square size={12} fill="currentColor" /> : <Mic size={15} />}
    </button>
  );
}

/* ---------- Auto-growing textarea ---------- */

export function GrowText({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`grow ${className ?? ''}`}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* ---------- Animated number ---------- */

export function Count({ n }: { n: number }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={n}
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -12, opacity: 0 }}
        transition={spring}
        style={{ display: 'inline-block' }}
      >
        {n}
      </motion.span>
    </AnimatePresence>
  );
}
