"use client";

import { useEffect, useState } from "react";

/**
 * Forces a re-render whenever the tab becomes visible or the window regains
 * focus. Components rendering relative timestamps ("5min ago") include the
 * returned value as a dependency so the displayed offset refreshes when the
 * user returns to the page — otherwise the strings stay frozen at whatever
 * Date.now() was on the last render.
 *
 * The returned number itself is meaningless; React re-renders on state
 * change regardless of whether the value is read.
 */
export function useVisibilityTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    function bump() {
      if (
        typeof document === "undefined" ||
        document.visibilityState === "visible"
      ) {
        setTick((t) => t + 1);
      }
    }
    document.addEventListener("visibilitychange", bump);
    window.addEventListener("focus", bump);
    return () => {
      document.removeEventListener("visibilitychange", bump);
      window.removeEventListener("focus", bump);
    };
  }, []);
  return tick;
}
