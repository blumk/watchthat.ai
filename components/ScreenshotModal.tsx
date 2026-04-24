"use client";

import { useState, useRef, useEffect } from "react";
import type { ChangeEntry } from "@/lib/db";

interface Props {
  entries: ChangeEntry[];
  initialIndex: number;
  onClose: () => void;
}

const MAX_SCALE = 8;

type View = { scale: number; x: number; y: number };

// zoomAt: zoom to newScale keeping the point (cx, cy) — relative to container center — fixed
function zoomAt(v: View, newScale: number, cx: number, cy: number, minScale: number): View {
  const s = Math.min(Math.max(newScale, minScale), MAX_SCALE);
  if (s <= minScale) return { scale: minScale, x: 0, y: 0 };
  const f = s / v.scale;
  return { scale: s, x: cx + (v.x - cx) * f, y: cy + (v.y - cy) * f };
}

function touchDist(t: React.TouchList) {
  return Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
}
function touchMid(t: React.TouchList) {
  return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 };
}

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function ScreenshotModal({ entries, initialIndex, onClose }: Props) {
  const safeInitial = Math.min(Math.max(0, initialIndex), Math.max(0, entries.length - 1));
  const [index, setIndex] = useState(safeInitial);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // Mirror view in a ref so wheel/touch handlers always see latest value without stale closures
  const viewRef = useRef<View>({ scale: 1, x: 0, y: 0 });
  const fitScaleRef = useRef(1);
  const [view, _setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [fitScale, setFitScale] = useState(1);
  const [loaded, setLoaded] = useState(false);

  const dragging = useRef(false);
  const dragMoved = useRef(false);
  const lastPt = useRef({ x: 0, y: 0 });
  const pinchDist = useRef<number | null>(null);
  const pinchMid = useRef({ x: 0, y: 0 });

  const entry = entries[index];
  const src = entry?.screenshot ?? null;
  const alt = entry ? `Screenshot — ${entry.description}` : "Screenshot";

  function applyView(updater: (v: View) => View) {
    const next = updater(viewRef.current);
    viewRef.current = next;
    _setView(next);
  }

  // On image load: compute the scale that fits the natural image into the viewport
  function computeFit() {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || !img.naturalWidth) return;
    const fit = Math.min(
      container.clientWidth / img.naturalWidth,
      container.clientHeight / img.naturalHeight,
      1 // never upscale beyond natural size for the initial fit
    );
    fitScaleRef.current = fit;
    setFitScale(fit);
    applyView(() => ({ scale: fit, x: 0, y: 0 }));
    setLoaded(true);
  }

  // Reset zoom/pan whenever the displayed image changes; new <img>'s onLoad
  // will recompute fit. Without this, switching between two images keeps the
  // prior pan offset and briefly shows the new image at the wrong position.
  useEffect(() => {
    viewRef.current = { scale: 1, x: 0, y: 0 };
    _setView({ scale: 1, x: 0, y: 0 });
    setLoaded(false);
  }, [src]);

  // Keyboard: Escape closes, Arrow Up/Down (and Left/Right) step between entries
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((i) => Math.min(entries.length - 1, i + 1));
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, entries.length]);

  // Wheel zoom — non-passive so we can preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      applyView(v => zoomAt(v, v.scale * factor, cx, cy, fitScaleRef.current));
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  // Recompute fit on window resize
  useEffect(() => {
    window.addEventListener("resize", computeFit);
    return () => window.removeEventListener("resize", computeFit);
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
    if (viewRef.current.scale > fitScaleRef.current) {
      applyView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
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
    if (e.touches.length === 2 && pinchDist.current !== null) {
      const d = touchDist(e.touches);
      const m = touchMid(e.touches);
      const rect = containerRef.current!.getBoundingClientRect();
      const cx = m.x - rect.left - rect.width / 2;
      const cy = m.y - rect.top - rect.height / 2;
      const pdx = m.x - pinchMid.current.x;
      const pdy = m.y - pinchMid.current.y;
      applyView(v => {
        const zoomed = zoomAt(v, v.scale * (d / pinchDist.current!), cx, cy, fitScaleRef.current);
        return { ...zoomed, x: zoomed.x + pdx, y: zoomed.y + pdy };
      });
      pinchDist.current = d;
      pinchMid.current = m;
    } else if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastPt.current.x;
      const dy = e.touches[0].clientY - lastPt.current.y;
      if (dx || dy) dragMoved.current = true;
      lastPt.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (viewRef.current.scale > fitScaleRef.current) {
        applyView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
      }
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinchDist.current = null;
    if (e.touches.length === 0 && !dragMoved.current && viewRef.current.scale <= fitScaleRef.current) {
      onClose();
    }
  }

  // Show percentage relative to natural size (100% = pixel-perfect)
  const pct = Math.round(view.scale * 100);
  const atFit = view.scale <= fitScale + 0.001;

  if (!entry) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col md:flex-row">
      {/* ── Image column ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Zoomable image area — clicking the backdrop closes */}
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center overflow-hidden select-none"
          style={{ touchAction: "none" }}
          onClick={e => { if (!dragMoved.current && e.target === containerRef.current) onClose(); }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={src}
              alt={alt}
              draggable={false}
              onLoad={computeFit}
              className="rounded select-none"
              style={{
                // No max-width/max-height — rendered at natural resolution so zoom-in is crisp
                maxWidth: "none",
                maxHeight: "none",
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                transformOrigin: "center center",
                cursor: view.scale > fitScale ? "grab" : "zoom-in",
                willChange: "transform",
                opacity: loaded ? 1 : 0,
              }}
            />
          )}
        </div>

        {/* Controls bar */}
        <div
          className="shrink-0 h-14 flex items-center justify-between px-5 border-t border-white/10"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-2">
            <button
              aria-label="Zoom out"
              onClick={() => applyView(v => zoomAt(v, v.scale / 1.5, 0, 0, fitScale))}
              disabled={atFit}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xl leading-none flex items-center justify-center disabled:opacity-25 cursor-pointer border-none transition-colors"
            >−</button>
            <button
              aria-label="Reset zoom"
              onClick={() => applyView(() => ({ scale: fitScale, x: 0, y: 0 }))}
              className="text-xs font-mono text-white/40 hover:text-white/70 w-12 text-center cursor-pointer bg-transparent border-none transition-colors"
            >{pct}%</button>
            <button
              aria-label="Zoom in"
              onClick={() => applyView(v => zoomAt(v, v.scale * 1.5, 0, 0, fitScale))}
              disabled={view.scale >= MAX_SCALE}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xl leading-none flex items-center justify-center disabled:opacity-25 cursor-pointer border-none transition-colors"
            >+</button>
            <span className="ml-3 text-xs font-mono text-white/40 select-none">
              {index + 1} / {entries.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium cursor-pointer border-none transition-colors"
          >Close</button>
        </div>
      </div>

      {/* ── Desktop right rail: changelog ── */}
      <aside
        aria-label="Change history"
        className="hidden md:flex flex-col w-72 lg:w-80 shrink-0 border-l border-white/10 overflow-y-auto"
      >
        <div className="px-4 py-3 text-xs font-mono text-white/40 uppercase tracking-wide border-b border-white/10">
          Change history
        </div>
        <ul className="flex-1">
          {entries.map((e, i) => {
            const isSelected = i === index;
            const dotColor =
              e.classification === "major" ? "var(--red)"
              : e.classification === "error" ? "var(--red)"
              : e.classification === "quiet" ? "var(--green)"
              : "var(--t3)";
            return (
              <li key={e.id}>
                <button
                  onClick={() => setIndex(i)}
                  aria-current={isSelected ? "true" : undefined}
                  className={`w-full text-left px-4 py-3 border-b border-white/5 cursor-pointer transition-colors ${
                    isSelected ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {e.emoji ? (
                      <span className="shrink-0 text-sm leading-none mt-px">{e.emoji}</span>
                    ) : (
                      <span
                        className="shrink-0 w-1.5 h-1.5 rounded-full mt-1.5"
                        style={{ background: dotColor }}
                      />
                    )}
                    <span className={`text-xs flex-1 leading-snug ${isSelected ? "text-white" : "text-white/70"}`}>
                      {e.description}
                    </span>
                  </div>
                  <div className="mt-1 ml-4 text-[10px] font-mono text-white/30">
                    {timeAgo(e.timestamp)}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
