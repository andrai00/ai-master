"use client";

import { useState, useCallback } from "react";
import type { IFormulaResult } from "@/src/shared/lib/formula/types";
import styles from "./formula-block.module.css";

const formatValue = (v: number) => (v >= 0 ? `+${v}` : `${v}`);

function FormulaError({ message }: { message: string }) {
  return <span className={styles.err} title={message}>err</span>;
}

/** A collapsible panel rendering a whole ```formula config block. */
export const FormulaConfigBlock = ({ results }: { results: IFormulaResult[] }) => {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  if (results.length === 0) return null;

  return (
    <div className={styles.config}>
      <button type="button" className={styles.configSummary} onClick={toggle}>
        <span className={styles.configArrow}>{expanded ? "▾" : "▸"}</span>
        <span>Формулы · {results.length}</span>
      </button>
      {expanded && (
        <ul className={styles.configList}>
          {results.map((r) => (
            <li key={r.name} className={styles.configItem}>
              <code className={styles.configExpr}>{r.name} = {r.expr}</code>
              <span className={styles.configEq}>=</span>
              {r.error || r.value === null ? (
                <FormulaError message={r.error ?? "нет значения"} />
              ) : (
                <span className={styles.configValue}>{formatValue(r.value)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Inline $var reference: shows the computed value, or "err". */
export const FormulaInlineRef = ({ result }: { varName: string; result: IFormulaResult | undefined }) => {
  if (!result || result.error || result.value === null) {
    return <FormulaError message={result?.error ?? "нет значения"} />;
  }
  return <span className={styles.inlineValue} title={`${result.expr} = ${formatValue(result.value)}`}>{formatValue(result.value)}</span>;
};
