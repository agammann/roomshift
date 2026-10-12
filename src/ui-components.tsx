import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

function displayNumber(value: number): string { return String(Math.round(value * 100) / 100); }

export function NumberField({ label, value, min, max, step = 1, unit, onCommit, onInvalid, ariaLabel }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  onCommit: (value: number) => void; onInvalid?: (message: string) => void; ariaLabel?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => displayNumber(value));
  useEffect(() => { setDraft(displayNumber(value)); }, [value]);
  const commit = (raw: string) => {
    const next = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(next) || next < min || next > max) {
      setDraft(displayNumber(value));
      onInvalid?.(`${ariaLabel ?? label} must be between ${min} and ${max}${unit ? ` ${unit}` : ''}.`);
      return;
    }
    setDraft(displayNumber(next));
    if (Math.abs(next - value) > 0.000001) onCommit(next);
  };
  return <label className="field" htmlFor={id}><span>{label}</span><div className="field-input"><input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={draft} aria-label={ariaLabel ?? label} onChange={event => setDraft(event.target.value)} onBlur={event => commit(event.target.value)} onKeyDown={event => {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') { event.currentTarget.value = displayNumber(value); setDraft(displayNumber(value)); event.currentTarget.blur(); }
  }}/>{unit ? <span className="input-unit">{unit}</span> : null}</div></label>;
}

export function TextField({ label, value, onCommit, ariaLabel }: { label: string; value: string; onCommit: (value: string) => void; ariaLabel?: string }) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return <label className="field" htmlFor={id}><span>{label}</span><input id={id} type="text" maxLength={60} value={draft} aria-label={ariaLabel ?? label} onChange={event => setDraft(event.target.value)} onBlur={() => { const next = draft.trim(); if (next) onCommit(next); else setDraft(value); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}/></label>;
}

export function Modal({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { ref.current?.showModal(); return () => { ref.current?.close(); }; }, []);
  return <dialog ref={ref} className={`modal ${className}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}><div className="modal-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button></div>{children}</dialog>;
}
