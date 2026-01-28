"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;

type View = { scale: number; x: number; y: number };

function zoomAt(v: View, newScale: number, cx: number, cy: number): View {
  const s = Math.min(Math.max(newScale, MIN_SCALE), MAX_SCALE);
  if (s <= MIN_SCALE) return { scale: MIN_SCALE, x: 0, y: 0 };
  const f = s / v.scale;
  return { scale: s, x: cx + (v.x - cx) * f, y: cy + (v.y - cy) * f };
}

function touchDist(t: React.TouchList) {
  return Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
}
function touchMid(t: React.TouchList) {
  return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 };
}

export default function ScreenshotModal({ src, alt = "Screenshot", onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Mirror view in a ref so wheel/touch handlers always see latest value without stale closures
  const viewRef = useRef<View>({ scale: 1, x: 0, y: 0 });
  const [view, _setView] = useState<View>({ scale: 1, x: 0, y: 0 });

  const dragging = useRef(false);
  const dragMoved = useRef(false);
  const lastPt = useRef({ x: 0, y: 0 });
  const pinchDist = useRef<number | null>(null);
  const pinchMid = useRef({ x: 0, y: 0 });

  function applyView(updater: (v: View) => View) {
    const next = updater(viewRef.current);
    viewRef.current = next;
    _setView(next);
  }

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Wheel zoom — must be non-passive to call preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      applyView(v => zoomAt(v, v.scale * factor, cx, cy));
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  // Mouse drag to pan
  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    dragging.current = true;
    dragMoved.current = false;
    lastPt.current = { x: e.clientX, y: e.clientY };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - lastPt.current.x;
    const dy = e.clientY - lastPt.current.y;
    if (dx || dy) dragMoved.current = true;
    lastPt.current = { x: e.clientX, y: e.clientY };
    if (viewRef.current.scale > 1) applyView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
  }
  function onMouseUp() { dragging.current = false; }

  // Touch: pinch-to-zoom + single-finger pan
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      pinchDist.current = touchDist(e.touches);
      pinchMid.current = touchMid(e.touches);
    } else {
      lastPt.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      dragMoved.current = false;
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    // touch-action:none on the container prevents default browser behavior
    if (e.touches.length === 2 && pinchDist.current !== null) {
      const d = touchDist(e.touches);
      const m = touchMid(e.touches);
      const rect = containerRef.current!.getBoundingClientRect();
      const cx = m.x - rect.left - rect.width / 2;
      const cy = m.y - rect.top - rect.height / 2;
      const pdx = m.x - pinchMid.current.x;
      const pdy = m.y - pinchMid.current.y;
      applyView(v => {
        const zoomed = zoomAt(v, v.scale * (d / pinchDist.current!), cx, cy);
        return { ...zoomed, x: zoomed.x + pdx, y: zoomed.y + pdy };
      });
      pinchDist.current = d;
      pinchMid.current = m;
    } else if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastPt.current.x;
      const dy = e.touches[0].clientY - lastPt.current.y;
      if (dx || dy) dragMoved.current = true;
      lastPt.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (viewRef.current.scale > 1) applyView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinchDist.current = null;
    // Tap with no movement at scale 1 → close
    if (e.touches.length === 0 && !dragMoved.current && viewRef.current.scale <= MIN_SCALE) {
      onClose();
    }
  }

  const pct = Math.round(view.scale * 100);

  return (
    <div className="fixed inset-0 z-50 bg-black/92 flex flex-col" onClick={onClose}>
      {/* Zoomable image area */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden select-none"
        style={{ touchAction: "none" }}
        onClick={e => e.stopPropagation()}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-w-[90vw] max-h-[calc(100vh-56px)] object-contain rounded select-none"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: "center center",
            cursor: view.scale > 1 ? "grab" : "zoom-in",
            willChange: "transform",
          }}
        />
      </div>

      {/* Controls bar */}
      <div
        className="shrink-0 h-14 flex items-center justify-between px-5 border-t border-white/10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <button
            aria-label="Zoom out"
            onClick={() => applyView(v => zoomAt(v, v.scale / 1.5, 0, 0))}
            disabled={view.scale <= MIN_SCALE}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xl leading-none flex items-center justify-center disabled:opacity-25 cursor-pointer border-none transition-colors"
          >
            −
          </button>
          <button
            aria-label="Reset zoom"
            onClick={() => applyView(() => ({ scale: 1, x: 0, y: 0 }))}
            className="text-xs font-mono text-white/40 hover:text-white/70 w-12 text-center cursor-pointer bg-transparent border-none transition-colors"
          >
            {pct}%
          </button>
          <button
            aria-label="Zoom in"
            onClick={() => applyView(v => zoomAt(v, v.scale * 1.5, 0, 0))}
            disabled={view.scale >= MAX_SCALE}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xl leading-none flex items-center justify-center disabled:opacity-25 cursor-pointer border-none transition-colors"
          >
            +
          </button>
        </div>
        <button
          onClick={onClose}
          className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium cursor-pointer border-none transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
