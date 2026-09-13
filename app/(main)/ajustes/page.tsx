"use client";

import { PlaceholderPage } from "@/components/main-menu/PlaceholderPage";
import { RamRodFrame } from "@/components/main-menu/RamRodFrame";
import { useTransitionRouter } from "next-transition-router";
import { WALKTHROUGH_STORAGE_KEY } from "@/hooks/useWalkthrough";

export default function SettingsPage() {
  const router = useTransitionRouter();
  const runWalkthroughAgain = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(WALKTHROUGH_STORAGE_KEY);
    }
    router.push("/mainpage");
  };

  return (
    <RamRodFrame>
      <div className="flex flex-1 flex-col items-center justify-center">
        <PlaceholderPage title="Ajustes" />
        <button type="button" onClick={runWalkthroughAgain} className="mt-4 border border-ramrod-primary bg-ramrod-primary px-4 py-2 text-[10px] font-bold tracking-[0.12em] text-ramrod-primary-foreground">
          Ver recorrido de nuevo
        </button>
      </div>
    </RamRodFrame>
  );
}