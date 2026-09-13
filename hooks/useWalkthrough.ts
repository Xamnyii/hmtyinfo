"use client";

import { useCallback, useMemo, useState } from "react";
import { walkthroughSteps, type WalkthroughStep } from "@/config/walkthroughSteps";

export const WALKTHROUGH_STORAGE_KEY = "forensic_walkthrough_completed";

export function useWalkthrough() {
  const [visible, setVisible] = useState(false);

  const enabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(WALKTHROUGH_STORAGE_KEY) !== "true";
  }, []);

  const readCompleted = useCallback(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(WALKTHROUGH_STORAGE_KEY) === "true";
  }, []);

  const setCompleted = useCallback((value: boolean) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WALKTHROUGH_STORAGE_KEY, value ? "true" : "false");
  }, []);

  const run = useCallback(() => {
    if (typeof window === "undefined") return;
    setVisible(true);
    setCompleted(false);
  }, [setCompleted]);

  const complete = useCallback(() => {
    setCompleted(true);
    setVisible(false);
  }, [setCompleted]);

  const skip = useCallback(() => {
    setCompleted(true);
    setVisible(false);
  }, [setCompleted]);

  const getAvailableSteps = useCallback((pathname: string): WalkthroughStep[] => {
    return walkthroughSteps.filter((step) => {
      if (!step.route || step.route === "*") return true;
      if (step.route === "/mainpage") return pathname === "/mainpage" || pathname.startsWith("/mainpage");
      if (step.route === "/investigacion") return pathname.startsWith("/investigacion");
      return pathname.startsWith(step.route);
    });
  }, []);

  return {
    visible,
    setVisible,
    enabled,
    readCompleted,
    setCompleted,
    run,
    complete,
    skip,
    getAvailableSteps,
    storageKey: WALKTHROUGH_STORAGE_KEY,
  };
}
