import { DiceRoll } from "@dice-roller/rpg-dice-roller";

export interface IDiceRollResult {
  total: number;
  output: string;
}

export function rollDice(notation: string): IDiceRollResult {
  const compound = notation.match(/^(\[\[[^\]]+\]\])(\[\[[^\]]+\]\])+$/);
  if (compound) {
    const parts = notation.match(/\[\[[^\]]+\]\]/g) ?? [];
    const results = parts.map(p => new DiceRoll(p));
    const total = results.reduce((s, r) => s + r.total, 0);
    const output = results.map(r => r.output).join(" | ");
    return { total, output };
  }
  const roll = new DiceRoll(notation);
  return { total: roll.total, output: roll.output };
}

export function validateNotation(notation: string): boolean {
  try {
    new DiceRoll(notation);
    return true;
  } catch {
    return false;
  }
}

export const DICE_NOTATION_REFERENCE = `
## Dice notation reference
Use standard RPG dice notation:
- Basic: \`4d6\`, \`1d20\`, \`2d10\`
- Modifier: \`1d20+5\`, \`2d6+3\`, \`1d8-1\`
- Keep highest: \`4d6kh3\` (roll 4, keep highest 3)
- Drop lowest: \`4d6dl1\` (roll 4, drop lowest 1)
- Reroll: \`4d6ro<2\` (reroll once if <2), \`4d6r<2\` (reroll until >=2)
- Exploding: \`4d6!\` (explode on max), \`4d6!>5\` (explode on >5)
- Compound: \`2d20+1d6\`, \`1d20+1d4+3\`
- Grouped: \`[[4d6dl1]][[4d6dl1]]\` for multiple independent rolls
- Fudge/Fate: \`4dF\`

Combine with character sheet values: read stats via read_document, then construct
the expression. Example: dex_mod=+3 → \`1d20+3\` for a DEX check.
`;
