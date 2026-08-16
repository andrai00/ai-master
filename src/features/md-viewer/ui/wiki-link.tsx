"use client";

import { useState, useEffect } from "react";
import { resolveWikiLinksAction } from "@/src/shared/actions/documents/resolve-wiki-links";
import styles from "./wiki-link.module.css";

interface IWikiLinkProps {
  docId: string;
  anchor?: string | null;
  displayText?: string | null;
  onNavigate?: (docId: string, anchor?: string) => void;
  /** If true, only render as plain text (no click) — for inaccessible docs */
  plain?: boolean;
}

interface IResolved {
  title: string;
  exists: boolean;
}

/** Cache of resolved doc IDs to titles across all WikiLink instances. */
const resolvedCache = new Map<string, IResolved>();
/** Re-render listeners — notified once a batch resolves (no polling). */
const listeners = new Set<() => void>();

let pendingBatch: string[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function notifyListeners() {
  for (const l of listeners) l();
}

function flushBatch() {
  const batch = [...new Set(pendingBatch.filter((id) => !resolvedCache.has(id)))];
  pendingBatch = [];
  batchTimer = null;

  if (batch.length === 0) return;

  void resolveWikiLinksAction(batch).then((results) => {
    let changed = false;
    for (const r of results) {
      if (!resolvedCache.has(r.docId)) {
        resolvedCache.set(r.docId, { title: r.title, exists: r.exists });
        changed = true;
      }
    }
    if (changed) notifyListeners();
  });
}

function scheduleResolve(docId: string) {
  if (resolvedCache.has(docId)) return;
  pendingBatch.push(docId);
  if (!batchTimer) {
    batchTimer = setTimeout(flushBatch, 100);
  }
}

export const WikiLink = ({ docId, anchor, displayText, onNavigate, plain }: IWikiLinkProps) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (displayText) return;
    scheduleResolve(docId);
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [docId, displayText]);

  const cached = resolvedCache.get(docId);
  const resolvedDisplay = displayText || cached?.title || docId;
  const exists = cached?.exists ?? true; // assume exists until resolved, then use actual

  const handleClick = () => {
    if (plain || !exists) return;
    onNavigate?.(docId, anchor || undefined);
  };

  if (plain || !exists) {
    return <span className={styles.wikiText}>{resolvedDisplay}</span>;
  }

  return (
    <button
      type="button"
      className={styles.wikiLink}
      onClick={handleClick}
      title={anchor ? `«${resolvedDisplay}» → ${anchor}` : resolvedDisplay}
    >
      {resolvedDisplay}
    </button>
  );
};
