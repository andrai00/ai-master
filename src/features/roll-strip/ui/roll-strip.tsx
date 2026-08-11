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

        if (isCompleted) {
          return (
            <Tooltip
              key={roll.id}
              title={`${roll.checkName}: ${roll.diceExpression} → ${roll.resultDetail}`}
            >
              <span className={styles.badge} style={{ color: getColor(roll.resultTotal ?? 0) }}>
                🎲 {roll.checkName}: <strong>{roll.resultTotal}</strong>
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
              🎲 {roll.checkName}: {roll.diceExpression}
            </button>
          );
        }

        if (isAssigned) {
          return (
            <Tooltip key={roll.id} title={`${roll.checkName}: ${roll.diceExpression}`}>
              <span className={styles.waiting}>⏳ {roll.checkName}</span>
            </Tooltip>
          );
        }

        return null;
      })}
    </div>
  );
};
