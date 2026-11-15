import { useId, useLayoutEffect, useRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { drawInstrumentPlate, drawInstrumentWell } from '../../../src/render/instrument-material.js';
import { drawHardwareCap, hardwareMotionReduced } from '../../../src/render/hardware-material.js';
import { drawHardwarePrint } from '../../../src/render/hardware-faceplate.js';
import { BAG_TAB_MATERIALS } from '../../../src/render/bag-tabs.js';
import { cancelControlScope, pressControl, releaseControl, sampleControl } from '../../../src/game/control-mechanics.js';

// These are the *game's* field-case painters. DOM elements retain input,
// accessibility and text editing; no second CSS rendering of the hardware.
export function FieldCaseSurface() {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current!, root = canvas.parentElement!;
    const paint = () => {
      const width = root.clientWidth, height = root.clientHeight, dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      drawInstrumentPlate(ctx, { x: 0, y: 0, w: canvas.width, h: canvas.height, dpr, finish: 'aluminum', seed: 'AUDIOCORP::FIELD CASE / 4417-C' });
      const workspace = root.querySelector('.story-workspace, .timeline-workspace, .media-workspace, .audio-workspace, .workspace-error');
      if (workspace) {
        const outer = root.getBoundingClientRect(), bounds = workspace.getBoundingClientRect();
        drawInstrumentWell(ctx, { x: (bounds.x - outer.x) * dpr, y: (bounds.y - outer.y) * dpr, w: bounds.width * dpr, h: bounds.height * dpr, dpr });
      }
    };
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(paint); };
    const observer = new ResizeObserver(schedule), mutation = new MutationObserver(schedule);
    observer.observe(root); mutation.observe(root, { childList: true }); paint();
    return () => { observer.disconnect(); mutation.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  return <canvas ref={ref} className="field-case-surface" data-renderer="drawInstrumentPlate drawInstrumentWell" aria-hidden="true" />;
}

export function CaseLegend({ children }: { children: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current!;
    const paint = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr;
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      drawHardwarePrint(ctx, children, 0, 0, Object.assign({ width: canvas.width, height: canvas.height, color: '#333830', finish: 'etched', darkPanel: false, dpr }));
    };
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(paint); };
    const observer = new ResizeObserver(schedule); observer.observe(canvas);
    document.fonts.ready.then(schedule); paint(); return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [children]);
  return <span className="case-legend"><span className="case-accessible-label">{children}</span><canvas aria-hidden="true" ref={ref} /></span>;
}

type CaseButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { material?: keyof typeof BAG_TAB_MATERIALS; children: ReactNode };
export function CaseButton({ material, children, className = '', onPointerDown, onPointerUp, onPointerCancel, onKeyDown, onKeyUp, onFocus, onBlur, ...props }: CaseButtonProps) {
  const id = `studio-case:${useId()}`, ref = useRef<HTMLButtonElement>(null), animation = useRef(0);
  const active = className.includes('is-active') || props['aria-pressed'] === true;
  const painter = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    const button = ref.current!, canvas = button.querySelector('canvas')!;
    const paint = () => {
      const dpr = window.devicePixelRatio || 1, width = button.clientWidth * dpr, height = button.clientHeight * dpr;
      if (!width || !height) return;
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      const state = sampleControl(id, { lit: active && !!material, enabled: !button.disabled, reducedMotion: hardwareMotionReduced() });
      const cap = drawHardwareCap(ctx, 0, 0, width, height, { color: material ? BAG_TAB_MATERIALS[material].color : 'white', dpr,
        travel: state.travel, lampHeat: state.lampHeat, illumination: material ? 'powered' : 'standard', enabled: !button.disabled,
        focused: button.matches(':focus-visible'), active });
      const box = cap.content;
      drawHardwarePrint(ctx, button.textContent || '', box.x + 2 * dpr, box.y, Object.assign({ width: Math.max(1, box.w - 4 * dpr), height: box.h,
        color: '#12150d', dpr, align: 'center', finish: 'screenprint' }));
    };
    painter.current = () => {
      cancelAnimationFrame(animation.current);
      const until = performance.now() + 380;
      const frame = () => { paint(); if (performance.now() < until) animation.current = requestAnimationFrame(frame); };
      frame();
    };
    const observer = new ResizeObserver(() => { cancelAnimationFrame(animation.current); animation.current = requestAnimationFrame(painter.current); }); observer.observe(button);
    document.fonts.ready.then(painter.current); painter.current();
    return () => { observer.disconnect(); cancelAnimationFrame(animation.current); };
  }, [id, active, material, children, props.disabled]);
  useLayoutEffect(() => () => { cancelControlScope(id); }, [id]);
  return <button {...props} ref={ref} className={`case-hardware ${className}`} data-renderer="drawHardwareCap" data-material={material || 'white'}
    onPointerDown={event => { if (event.button === 0) { pressControl(id); painter.current(); } onPointerDown?.(event); }}
    onPointerUp={event => { releaseControl(id); painter.current(); onPointerUp?.(event); }}
    onPointerCancel={event => { releaseControl(id); painter.current(); onPointerCancel?.(event); }}
    onKeyDown={event => { if (['Enter', ' '].includes(event.key) && !event.repeat) { pressControl(id); painter.current(); } onKeyDown?.(event); }}
    onKeyUp={event => { if (['Enter', ' '].includes(event.key)) { releaseControl(id); painter.current(); } onKeyUp?.(event); }}
    onFocus={event => { painter.current(); onFocus?.(event); }} onBlur={event => { releaseControl(id); painter.current(); onBlur?.(event); }}>
    <canvas aria-hidden="true" /><span className="case-accessible-label">{children}</span>
  </button>;
}
