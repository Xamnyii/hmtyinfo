import type { ForensicRunBundle } from "./forensic-run-types";

const FORENSIC_RUN_STORAGE_KEY = "ramrod_forensic_run";

export type StoredForensicRun = {
  runId: string;
  bundle: ForensicRunBundle;
  caseFileHtml?: string;
  storedAt: string;
};

export function saveForensicRun(run: StoredForensicRun): void {
  sessionStorage.setItem(FORENSIC_RUN_STORAGE_KEY, JSON.stringify(run));
}

export function readForensicRun(): StoredForensicRun | null {
  try {
    const value = sessionStorage.getItem(FORENSIC_RUN_STORAGE_KEY);
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.runId !== "string" || typeof record.storedAt !== "string") return null;
    const bundle = record.bundle;
    if (typeof bundle !== "object" || bundle === null || Array.isArray(bundle)) return null;
    return { runId: record.runId, bundle: bundle as ForensicRunBundle, caseFileHtml: typeof record.caseFileHtml === "string" ? record.caseFileHtml : undefined, storedAt: record.storedAt };
  } catch {
    return null;
  }
}