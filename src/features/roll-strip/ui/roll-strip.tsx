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
          const value = roll.result ?? "";
          const displayText = isMaster ? value : `${label}${value ? `: ${value}` : ""}`;
          return (
            <Tooltip
              key={roll.id}
              title={roll.detail ?? roll.result ?? ""}
            >
              <span className={styles.badge} style={{ opacity: isMaster ? 0.65 : 1 }}>
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
