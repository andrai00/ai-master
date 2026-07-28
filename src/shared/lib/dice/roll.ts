import { DiceRoll } from "@dice-roller/rpg-dice-roller";

export interface IDiceRollResult {
  total: number;
  minTotal: number;
  maxTotal: number;
  averageTotal: number;
  output: string;
  notation: string;
  rolls: ReturnType<DiceRoll["toJSON"]>["rolls"];
}

export function rollDice(notation: string): IDiceRollResult {
  const roll = new DiceRoll(notation);
  const json = roll.toJSON();

  return {
    total: json.total,
    minTotal: json.minTotal,
    maxTotal: json.maxTotal,
    averageTotal: (roll as unknown as { averageTotal: number }).averageTotal,
    output: json.output,
    notation: json.notation,
    rolls: json.rolls,
  };
}

export function validateNotation(notation: string): { valid: boolean; error?: string } {
  try {
    new DiceRoll(notation);
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid dice notation" };
  }
}
