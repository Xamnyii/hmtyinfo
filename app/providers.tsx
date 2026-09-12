"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import { TransitionRouter } from "next-transition-router";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Providers({ children }: { children: ReactNode }) {
  const overlayRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <TransitionRouter
        leave={async (next) => {
          if (prefersReducedMotion()) return next();
          await overlayRef.current?.animate(
            [{ opacity: 0 }, { opacity: 1 }],
            { duration: 180, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" },
          ).finished;
          next();
        }}
        enter={async (next) => {
          if (prefersReducedMotion()) return next();
          await overlayRef.current?.animate(
            [{ opacity: 1 }, { opacity: 0 }],
            { duration: 260, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" },
          ).finished;
          next();
        }}
      >
        {children}
      </TransitionRouter>
      <div ref={overlayRef} aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 100, pointerEvents: "none", opacity: 0, background: "#009b95" }} />
    </>
  );
}