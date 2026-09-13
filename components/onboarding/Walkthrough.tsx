"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useTransitionRouter } from "next-transition-router";
import { walkthroughSteps } from "@/config/walkthroughSteps";
import { readActiveCaseDraft } from "@/components/investigation/case-draft-storage";
import { WalkthroughTooltip } from "@/components/onboarding/WalkthroughTooltip";

const STORAGE_KEY = "forensic_walkthrough_completed";

type Placement = "left" | "right" | "top" | "bottom" | "center";

type TooltipPosition = { left: number; top: number; placement: Placement };

type TargetMeta = { rect: DOMRect | null; element: Element | null };

type WalkthroughProps = {
  autoStart?: boolean;
};

export function Walkthrough({ autoStart = true }: WalkthroughProps) {
  const pathname = usePathname();
  const router = useTransitionRouter();
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(false);
  const [targetMeta, setTargetMeta] = useState<TargetMeta>({ rect: null, element: null });
  const [tipPosition, setTipPosition] = useState<TooltipPosition>({ left: 0, top: 0, placement: "right" });

  const step = useMemo(() => walkthroughSteps[current] ?? walkthroughSteps[0], [current]);

  const close = useCallback(() => {
    setVisible(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "true");
    }
  }, []);

  const skip = useCallback(() => {
    close();
  }, [close]);

  const routeMatches = useCallback((currentPath: string, route: string) => {
    if (route === "*") return true;
    if (!route || route === "/") return true;
    return currentPath === route || currentPath.startsWith(`${route}/`) || currentPath.startsWith(route);
  }, []);

  const resolveStepRoute = useCallback((route: string) => {
    if (route !== "/investigacion") return route;

    if (typeof window === "undefined") return "/mainpage";

    const draft = readActiveCaseDraft();
    if (draft?.caseId) {
      return `/investigacion/${draft.caseId}`;
    }

    return "/mainpage";
  }, []);

  const findTarget = useCallback(() => {
    if (step.target === "body") {
      const body = document.body;
      return { rect: body.getBoundingClientRect(), element: body };
    }

    if (!step.target) {
      return { rect: null, element: null };
    }

    try {
      const element = document.querySelector(step.target);
      if (!element) {
        return { rect: null, element: null };
      }

      return { rect: element.getBoundingClientRect(), element };
    } catch {
      return { rect: null, element: null };
    }
  }, [step]);

  const calculatePosition = useCallback((rect: DOMRect | null, placement: Placement = step.placement) => {
    if (!rect) {
      setTipPosition({ left: window.innerWidth / 2 - 170, top: window.innerHeight / 2 - 120, placement: "center" });
      return;
    }

    const tooltipWidth = 340;
    const tooltipHeight = 210;
    const margin = 24;

    if (placement === "right") {
      const left = Math.min(rect.right + 22, window.innerWidth - tooltipWidth - margin);
      const top = Math.min(Math.max(rect.top + rect.height / 2 - tooltipHeight / 2, margin), window.innerHeight - tooltipHeight - margin);
      setTipPosition({ left: Math.max(left, margin), top: Math.max(top, margin), placement: "right" });
      return;
    }

    if (placement === "left") {
      const left = Math.max(rect.left - tooltipWidth - 22, margin);
      const top = Math.min(Math.max(rect.top + rect.height / 2 - tooltipHeight / 2, margin), window.innerHeight - tooltipHeight - margin);
      setTipPosition({ left: Math.max(left, margin), top: Math.max(top, margin), placement: "left" });
      return;
    }

    if (placement === "top") {
      const left = Math.min(Math.max(rect.left + rect.width / 2 - tooltipWidth / 2, margin), window.innerWidth - tooltipWidth - margin);
      const top = Math.max(rect.top - tooltipHeight - 26, margin);
      setTipPosition({ left: Math.max(left, margin), top: Math.max(top, margin), placement: "top" });
      return;
    }

    if (placement === "bottom") {
      const left = Math.min(Math.max(rect.left + rect.width / 2 - tooltipWidth / 2, margin), window.innerWidth - tooltipWidth - margin);
      const top = Math.min(rect.bottom + 26, window.innerHeight - tooltipHeight - margin);
      setTipPosition({ left: Math.max(left, margin), top: Math.max(top, margin), placement: "bottom" });
      return;
    }

    setTipPosition({ left: window.innerWidth / 2 - tooltipWidth / 2, top: window.innerHeight / 2 - tooltipHeight / 2, placement: "center" });
  }, [step]);

  useEffect(() => {
    if (typeof window === "undefined" || !autoStart) return;

    const hasCompleted = window.localStorage.getItem(STORAGE_KEY) === "true";
    if (!hasCompleted) {
      setVisible(true);
    }
  }, [autoStart]);

  useEffect(() => {
    if (!visible) return;

    if (!routeMatches(pathname, step.route)) {
      const targetRoute = resolveStepRoute(step.route);
      if (targetRoute && targetRoute !== pathname && targetRoute !== "/investigacion") {
        router.push(targetRoute);
      }
      return;
    }

    const target = findTarget();
    if (!target.element || !target.rect) {
      if (current < walkthroughSteps.length - 1) {
        setCurrent((value) => value + 1);
      } else {
        close();
      }
      return;
    }

    setTargetMeta(target);
    calculatePosition(target.rect, step.placement);
  }, [visible, current, pathname, step, router, findTarget, calculatePosition, close, routeMatches, resolveStepRoute]);

  useEffect(() => {
    if (!visible) return;

    const onResize = () => {
      const target = findTarget();
      if (!target.element || !target.rect) return;
      setTargetMeta(target);
      calculatePosition(target.rect, step.placement);
    };

    const onScroll = () => {
      const target = findTarget();
      if (!target.element || !target.rect) return;
      setTargetMeta(target);
      calculatePosition(target.rect, step.placement);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [visible, findTarget, calculatePosition, step]);

  const goNext = useCallback(() => {
    if (current >= walkthroughSteps.length - 1) {
      close();
      return;
    }

    setCurrent((value) => value + 1);
  }, [close, current]);

  const goPrevious = useCallback(() => {
    if (current <= 0) return;
    setCurrent((value) => value - 1);
  }, [current]);

  return (
    <>
      {visible && (
        <>
          <div className="walkthrough-backdrop" />
          {targetMeta.rect && (
            <div className="walkthrough-spotlight" style={{
              left: targetMeta.rect.left,
              top: targetMeta.rect.top,
              width: targetMeta.rect.width,
              height: targetMeta.rect.height,
            }} />
          )}
          <WalkthroughTooltip
            step={step}
            index={current}
            total={walkthroughSteps.length}
            visible={visible}
            position={tipPosition}
            onPrevious={goPrevious}
            onNext={goNext}
            onSkip={skip}
            onClose={close}
          />
        </>
      )}
    </>
  );
}
