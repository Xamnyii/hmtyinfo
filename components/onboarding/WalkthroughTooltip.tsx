"use client";

import { ChevronLeft, X } from "lucide-react";
import type { WalkthroughStep } from "@/config/walkthroughSteps";

type WalkthroughTooltipProps = {
  step: WalkthroughStep;
  index: number;
  total: number;
  visible: boolean;
  position: { left: number; top: number; placement: "left" | "right" | "top" | "bottom" | "center" };
  onPrevious: () => void;
  onNext: () => void;
  onSkip: () => void;
  onClose: () => void;
};

export function WalkthroughTooltip({
  step,
  index,
  total,
  visible,
  position,
  onPrevious,
  onNext,
  onSkip,
  onClose,
}: WalkthroughTooltipProps) {
  if (!visible) return null;

  const bottomPlacement = position.placement === "bottom";
  const placementClass = position.placement === "center" ? "walkthrough-tooltip walkthrough-tooltip-center" : "walkthrough-tooltip";

  return (
    <aside className={placementClass} style={{ left: position.left, top: position.top }}>
      <div className="walkthrough-tooltip-card">
        <div className="walkthrough-tooltip-head">
          <span className="walkthrough-progress">{index + 1} de {total}</span>
          <button className="walkthrough-icon-button" onClick={onClose} aria-label="Cerrar recorrido">
            <X size={14} />
          </button>
        </div>

        <div className="walkthrough-tooltip-body">
          <h3>{step.title}</h3>
          <p>{step.description}</p>
        </div>

        <div className="walkthrough-tooltip-actions">
          <button className="walkthrough-link-button" onClick={onSkip}>Omitir</button>
          {index > 0 && (
            <button className="walkthrough-secondary-button" onClick={onPrevious}>
              <ChevronLeft size={14} /> Atrás
            </button>
          )}
          <button className="walkthrough-primary-button" onClick={onNext}>
            {index === total - 1 ? "Iniciar investigación" : "Siguiente"}
          </button>
        </div>

        {!bottomPlacement && <span className="walkthrough-arrow" />}
      </div>
    </aside>
  );
}
