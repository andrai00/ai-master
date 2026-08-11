"use client";

import { Tooltip } from "antd";
import type { TSessionRoll } from "@/src/shared/actions/game-master/get-session-rolls";
import styles from "./roll-strip.module.css";

interface IRollStripProps {
  rolls: TSessionRoll[];
  currentUserId?: string;
  onExecuteRoll?: (rollId: string) => void;
  executing?: boolean;
}

const getColor = (total: number): string => {
  const maxD20 = 20;
  if (total >= maxD20 * 0.9) return "var(--success)";
  if (total <= maxD20 * 0.15) return "var(--danger)";
  return "var(--text-primary)";
};

export const RollStrip = ({ rolls, currentUserId, onExecuteRoll, executing }: IRollStripProps) => {
  if (rolls.length === 0) return null;

  return (
    <div className={styles.strip}>
      {rolls.map((roll) => {
        const isMine = roll.playerId === currentUserId;
        const isCompleted = roll.status === "completed";
        const isAssigned = roll.status === "assigned";
        const isMaster = !roll.playerId;
        const label = roll.count > 1 ? `${roll.checkName} (×${roll.count})` : roll.checkName;
        const displayLabel = isMaster ? undefined : label;

        if (isCompleted) {
          const displayText = isMaster ? `${roll.resultTotal}` : `${label}: ${roll.resultTotal}`;
          return (
            <Tooltip
              key={roll.id}
              title={`${roll.diceExpression}${roll.count > 1 ? ` ×${roll.count}` : ""} → ${roll.resultDetail}`}
            >
              <span className={styles.badge} style={{ color: getColor(roll.resultTotal ?? 0), opacity: isMaster ? 0.65 : 1 }}>
                🎲 {displayText}
              </span>
            </Tooltip>
          );
        }

        if (isAssigned && isMine && onExecuteRoll) {
          return (
            <button
              key={roll.id}
              className={styles.rollBtn}
              disabled={executing}
              onClick={() => onExecuteRoll(roll.id)}
            >
              🎲 {displayLabel ?? roll.diceExpression}: {roll.diceExpression}
            </button>
          );
        }

        if (isAssigned) {
          return (
            <Tooltip key={roll.id} title={`${roll.diceExpression}`}>
              <span className={styles.waiting}>⏳ {displayLabel ?? roll.diceExpression}</span>
            </Tooltip>
          );
        }

        return null;
      })}
    </div>
  );
};
