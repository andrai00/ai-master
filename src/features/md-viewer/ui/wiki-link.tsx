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

/** Cache of resolved doc IDs to titles across all WikiLink instances */
const resolvedCache = new Map<string, { title: string; exists: boolean }>();
let pendingBatch: string[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function flushBatch() {
  const batch = [...new Set(pendingBatch.filter((id) => !resolvedCache.has(id)))];
  pendingBatch = [];
  batchTimer = null;

  if (batch.length === 0) return;

  resolveWikiLinksAction(batch).then((results) => {
    for (const r of results) {
      resolvedCache.set(r.docId, { title: r.title, exists: r.exists });
    }
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
    if (!displayText) scheduleResolve(docId);
  }, [docId, displayText]);

  // Subscribe to cache — re-render when resolved (only when no displayText override)
  useEffect(() => {
    if (displayText) return;
    if (!resolvedCache.has(docId)) {
      const interval = setInterval(() => {
        if (resolvedCache.has(docId)) {
          setTick((t) => t + 1);
          clearInterval(interval);
        }
      }, 50);
      return () => clearInterval(interval);
    }
  }, [docId, displayText]);

  const cached = resolvedCache.get(docId);
  const resolvedDisplay = displayText || cached?.title || docId;
  const exists = cached?.exists ?? true; // assume exists until resolved, then use actual

  const handleClick = () => {
    if (plain || !exists) return;
    onNavigate?.(docId, anchor || undefined);
  };

  if (plain || !exists) {
    return (
      <span className={styles.wikiText}>
        {anchor ? `${resolvedDisplay} › ${anchor}` : resolvedDisplay}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={styles.wikiLink}
      onClick={handleClick}
      title={anchor ? `Открыть «${resolvedDisplay}» → ${anchor}` : `Открыть «${resolvedDisplay}»`}
    >
      {anchor ? `${resolvedDisplay} › ${anchor}` : resolvedDisplay}
    </button>
  );
};
