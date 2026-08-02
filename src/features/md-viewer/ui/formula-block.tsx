"use client";

import { useState, useCallback } from "react";
import type { IFormulaResult } from "@/src/shared/lib/formula/types";
import styles from "./formula-block.module.css";

interface IFormulaBlockProps {
  result: IFormulaResult;
}

export const FormulaBlock = ({ result }: IFormulaBlockProps) => {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  if (result.error) {
    return (
      <span className={styles.block} title={result.error}>
        <span className={styles.error}>{result.expr}</span>
      </span>
    );
  }

  if (result.value === null) {
    return (
      <span className={styles.block}>
        <span className={styles.error}>{result.expr}</span>
      </span>
    );
  }

  const displayValue = result.value >= 0 ? `+${result.value}` : `${result.value}`;

  return (
    <span
      className={`${styles.block} ${expanded ? styles.blockExpanded : ""}`}
      onClick={toggle}
      title={expanded ? undefined : "Click to show formula"}
    >
      <span className={styles.value}>{displayValue}</span>
      <span className={styles.formula}>
        {result.expr} = {displayValue}
      </span>
    </span>
  );
};

interface IFormulaInlineRefProps {
  varName: string;
  result: IFormulaResult | undefined;
}

export const FormulaInlineRef = ({ varName, result }: IFormulaInlineRefProps) => {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  if (!result || result.error) {
    return (
      <span className={styles.inlineUnevaluated}>
        ${varName}
      </span>
    );
  }

  if (result.value === null) {
    return (
      <span className={styles.inlineUnevaluated}>
        ${varName}
      </span>
    );
  }

  const displayValue = result.value >= 0 ? `+${result.value}` : `${result.value}`;

  return (
    <span
      className={`${styles.inlineRef} ${expanded ? styles.inlineRefExpanded : ""}`}
      onClick={toggle}
      title={expanded ? undefined : "Click to show formula"}
    >
      <span className={styles.inlineValue}>{displayValue}</span>
      <span className={styles.inlineFormula}>
        {result.expr} = {displayValue}
      </span>
    </span>
  );
};
