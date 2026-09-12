"use client";

import type React from "react";

interface ShinyButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function ShinyButton({ children, onClick, className = "" }: ShinyButtonProps) {
  return (
    <>
      <style jsx>{`
        @property --gradient-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
        @property --gradient-angle-offset { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
        @property --gradient-percent { syntax: "<percentage>"; initial-value: 5%; inherits: false; }
        @property --gradient-shine { syntax: "<color>"; initial-value: white; inherits: false; }
        .shiny-cta {
          --shiny-cta-bg: #007e79;
          --shiny-cta-bg-subtle: #006c67;
          --shiny-cta-fg: #cefcf8;
          --shiny-cta-highlight: #36b783;
          --shiny-cta-highlight-subtle: #9af6f2;
          --duration: 3s;
          isolation: isolate;
          position: relative;
          overflow: hidden;
          cursor: pointer;
          outline-offset: 4px;
          padding: 0.9rem 1.35rem;
          font: 600 0.76rem/1.2 var(--font-montserrat), sans-serif;
          letter-spacing: 0.11em;
          text-transform: uppercase;
          border: 1px solid transparent;
          border-radius: 6px;
          color: var(--shiny-cta-fg);
          background: linear-gradient(var(--shiny-cta-bg), var(--shiny-cta-bg)) padding-box,
            conic-gradient(from calc(var(--gradient-angle) - var(--gradient-angle-offset)), transparent, var(--shiny-cta-highlight) var(--gradient-percent), var(--gradient-shine) calc(var(--gradient-percent) * 2), var(--shiny-cta-highlight) calc(var(--gradient-percent) * 3), transparent calc(var(--gradient-percent) * 4)) border-box;
          box-shadow: inset 0 0 0 1px var(--shiny-cta-bg-subtle);
          transition: 800ms cubic-bezier(0.25, 1, 0.5, 1);
          transition-property: --gradient-angle-offset, --gradient-percent, --gradient-shine, transform;
        }
        .shiny-cta::before, .shiny-cta::after, .shiny-cta span::before { content: ""; pointer-events: none; position: absolute; inset-inline-start: 50%; inset-block-start: 50%; translate: -50% -50%; z-index: -1; }
        .shiny-cta:active { translate: 0 1px; }
        .shiny-cta::before { width: calc(100% - 6px); height: calc(100% - 6px); background: radial-gradient(circle at 2px 2px, white 0.5px, transparent 0) padding-box; background-size: 4px 4px; mask-image: conic-gradient(from calc(var(--gradient-angle) + 45deg), black, transparent 10% 90%, black); border-radius: inherit; opacity: 0.27; }
        .shiny-cta::after { width: 100%; aspect-ratio: 1; background: linear-gradient(-50deg, transparent, var(--shiny-cta-highlight), transparent); mask-image: radial-gradient(circle at bottom, transparent 40%, black); opacity: 0.45; }
        .shiny-cta span { z-index: 1; }
        .shiny-cta, .shiny-cta::before, .shiny-cta::after { animation: gradient-angle var(--duration) linear infinite, gradient-angle calc(var(--duration) / 0.4) linear reverse paused; animation-composition: add; }
        .shiny-cta:is(:hover, :focus-visible) { --gradient-percent: 20%; --gradient-angle-offset: 95deg; --gradient-shine: var(--shiny-cta-highlight-subtle); transform: translateY(-1px); }
        .shiny-cta:is(:hover, :focus-visible), .shiny-cta:is(:hover, :focus-visible)::before, .shiny-cta:is(:hover, :focus-visible)::after { animation-play-state: running; }
        @keyframes gradient-angle { to { --gradient-angle: 360deg; } }
        @media (prefers-reduced-motion: reduce) { .shiny-cta, .shiny-cta::before, .shiny-cta::after { animation: none; } }
      `}</style>
      <button className={`shiny-cta ${className}`} onClick={onClick} type="button">
        <span>{children}</span>
      </button>
    </>
  );
}