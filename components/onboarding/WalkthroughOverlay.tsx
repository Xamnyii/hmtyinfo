"use client";

import type { CSSProperties } from "react";

type WalkthroughOverlayProps = {
  target: DOMRect | null;
  active: boolean;
  onClose: () => void;
};

export function WalkthroughOverlay({ target, active, onClose }: WalkthroughOverlayProps) {
  if (!active || !target) {
    return null;
  }

  const style = {
    left: target.left,
    top: target.top,
    width: target.width,
    height: target.height,
  } as CSSProperties;

  return (
    <div className="walkthrough-root">
      <div className="walkthrough-backdrop" />
      <div className="walkthrough-spotlight" style={style} />
      <button className="walkthrough-close" onClick={onClose} aria-label="Cerrar recorrido">
        ×
      </button>
    </div>
  );
}
