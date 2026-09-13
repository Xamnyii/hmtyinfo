"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { readForensicRun } from "./estate-run-storage";
import { ForensicInvestigationWorkspace } from "./ForensicInvestigationWorkspace";
import { InvestigationWorkspace } from "./InvestigationWorkspace";

export function InvestigationRoute() {
  const params = useParams<{ id?: string }>();
  const [isForensicRun, setIsForensicRun] = useState<boolean | null>(null);

  useEffect(() => {
    const stored = readForensicRun();
    setIsForensicRun(stored?.runId === params.id);
  }, [params.id]);

  if (isForensicRun === null) return <div className="flex flex-1 items-center justify-center text-[10px] font-bold tracking-[0.14em] text-ramrod-muted-foreground">OPENING INVESTIGATION</div>;
  return isForensicRun ? <ForensicInvestigationWorkspace /> : <InvestigationWorkspace />;
}