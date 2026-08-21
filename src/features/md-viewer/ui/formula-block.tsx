"use client";

import { useState, useCallback } from "react";
import { Tooltip } from "antd";
import type { IFormulaResult } from "@/src/shared/lib/formula/types";
import styles from "./formula-block.module.css";

const formatValue = (v: number) => (v >= 0 ? `+${v}` : `${v}`);

function FormulaError({ message }: { message: string }) {
  return (
    <Tooltip title={<span className={styles.popoverText}>{message}</span>}>
      <span className={styles.err}>err</span>
    </Tooltip>
  );
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
        <span>{expanded ? "Свернуть формулы" : `Развернуть формулы · ${results.length}`}</span>
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

/** Inline $var reference: shows the computed value, with the formula on hover. */
export const FormulaInlineRef = ({ result }: { varName: string; result: IFormulaResult | undefined }) => {
  if (!result || result.error || result.value === null) {
    return <FormulaError message={result?.error ?? "нет значения"} />;
  }
  const formulaText = `${result.expr} = ${formatValue(result.value)}`;
  return (
    <Tooltip title={<code className={styles.popoverFormula}>{formulaText}</code>}>
      <span className={styles.inlineValue}>{formatValue(result.value)}</span>
    </Tooltip>
  );
};
