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
  // Hovering a rail row shows that entry in the main panel without pinning
  // it. Leaving the rail reverts to the pinned `index`. Keyboard/clicks pin.
  const [hoverIndex, _setHoverIndex] = useState<number | null>(null);
  const hoverIndexRef = useRef<number | null>(null);
  function setHoverIndex(v: number | null) {
    hoverIndexRef.current = v;
    _setHoverIndex(v);
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
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

  const displayIndex = hoverIndex ?? index;
  const displayEntry = entries[displayIndex];
  const displaySrc = displayEntry?.screenshot ?? null;
  const alt = displayEntry ? `Screenshot — ${displayEntry.description}` : "Screenshot";

  function applyView(updater: (v: View) => View) {
    const next = updater(viewRef.current);
    viewRef.current = next;
    _setView(next);
  }

  function computeFit() {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container || !img.naturalWidth) return;
    const fit = Math.min(
      container.clientWidth / img.naturalWidth,
      container.clientHeight / img.naturalHeight,
      1,
    );
    fitScaleRef.current = fit;
    setFitScale(fit);
    applyView(() => ({ scale: fit, x: 0, y: 0 }));
    setLoaded(true);
  }

  // When the displayed src changes: reset pan/zoom, then decide whether to
  // hide the image. If the new src is already cached (preloaded below), the
  // onLoad handler effectively never fires for it, so we compute fit
  // synchronously and skip the blank-flash that setLoaded(false) would cause.
  useEffect(() => {
    viewRef.current = { scale: 1, x: 0, y: 0 };
    _setView({ scale: 1, x: 0, y: 0 });
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0 && img.currentSrc) {
      computeFit();
    } else {
      setLoaded(false);
    }
  }, [displaySrc]);

  // Keyboard: Escape closes, arrows step (navigates from whichever entry the
  // user is currently looking at — hover if any, otherwise the pinned index).
  useEffect(() => {
    const step = (delta: 1 | -1) => {
      setIndex((i) => {
        const from = hoverIndexRef.current ?? i;
        const next = from + delta;
        return Math.min(entries.length - 1, Math.max(0, next));
      });
      setHoverIndex(null);
    };
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, entries.length]);

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

  useEffect(() => {
    window.addEventListener("resize", computeFit);
    return () => window.removeEventListener("resize", computeFit);
  }, []);

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

  const pct = Math.round(view.scale * 100);
  const atFit = view.scale <= fitScale + 0.001;

  if (!displayEntry) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* ── Top bar: clearly frames the modal as its own surface ── */}
      <header className="shrink-0 h-14 flex items-center justify-between px-5 border-b border-white/10 bg-black">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-mono text-white/50 uppercase tracking-widest">
            Screenshot browser
          </span>
          <span className="hidden md:inline text-[11px] font-mono text-white/25 truncate">
            {displayEntry.description}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden md:inline text-[10px] font-mono text-white/30 tracking-wide">
            ↑/↓ navigate · Esc close
          </span>
          <button
            aria-label="Close"
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xl leading-none flex items-center justify-center cursor-pointer border-none transition-colors"
          >×</button>
        </div>
      </header>

      {/* ── Body: image + rail ── */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Image column */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
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
            {displaySrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                src={displaySrc}
                alt={alt}
                draggable={false}
                onLoad={computeFit}
                className="rounded select-none"
                style={{
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

          {/* Zoom controls */}
          <div
            className="shrink-0 h-12 flex items-center gap-2 px-5 border-t border-white/10"
            onClick={e => e.stopPropagation()}
          >
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
              {displayIndex + 1} / {entries.length}
            </span>
          </div>
        </div>

        {/* ── Desktop right rail: changelog ── */}
        <aside
          aria-label="Change history"
          onMouseLeave={() => setHoverIndex(null)}
          className="hidden md:flex flex-col w-72 lg:w-80 shrink-0 border-l border-white/10 bg-white/[0.03] overflow-y-auto"
        >
          <div className="px-5 py-4 border-b border-white/10 sticky top-0 bg-black/90 backdrop-blur">
            <div className="text-[11px] font-mono text-white/40 uppercase tracking-widest">
              Change history
            </div>
            <div className="text-[10px] font-mono text-white/25 mt-1">
              {entries.length} {entries.length === 1 ? "entry" : "entries"} · hover to preview
            </div>
          </div>
          <ul className="flex-1">
            {entries.map((e, i) => {
              const isSelected = i === displayIndex;
              const isPinned = i === index;
              const dotColor =
                e.classification === "major" ? "var(--red)"
                : e.classification === "error" ? "var(--red)"
                : e.classification === "quiet" ? "var(--green)"
                : "var(--t3)";
              return (
                <li key={e.id}>
                  <button
                    onClick={() => { setIndex(i); setHoverIndex(null); }}
                    onMouseEnter={() => setHoverIndex(i)}
                    aria-current={isPinned ? "true" : undefined}
                    className={`w-full text-left px-5 py-3 border-b border-white/5 cursor-pointer transition-colors ${
                      isSelected ? "bg-white/10" : "hover:bg-white/5"
                    } ${isSelected ? "border-l-2 border-l-white/60" : "border-l-2 border-l-transparent"}`}
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

      {/* Preload every entry's screenshot so keyboard/hover/click
          navigation is instant — no blank flash between images. */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}
      >
        {entries.map((e) =>
          e.screenshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={e.id} src={e.screenshot} alt="" />
          ) : null,
        )}
      </div>
    </div>
  );
}
