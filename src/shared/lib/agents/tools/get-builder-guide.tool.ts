import { z } from "zod";
import { zodSchema } from "ai";

const GUIDES: Record<string, string> = {
  dice: `## Dice Rolling System
Standard dice notation: d6, d20, 4d6, d%, dF.
Math: +, -, *, /, ^, %, parentheses, round/floor/ceil/abs/sqrt/min/max.
Keep/Drop: 4d6kh3, 2d20kl1, 4d10dl2.
Exploding: 1d10!, 1d6!! (compound), 1d10!p (penetrating).
Re-roll: d6r (reroll 1s), 2d6ro>4 (reroll once on >4).
Target success: 5d10>=8 (count successes).
Crit: 2d20cs (max=crit), 2d20cf (min=crit fail).
Group: {4d6,3d8,2d10}kh (multiple pools, keep highest).

What to write in brain docs:
1. Which dice the system uses
2. Common formulas: 4d6kh3 (stats), 1d20+5 (skill), 2d20kh1 (advantage), 2d20kl1 (disadvantage), 4d6! (exploding), 5d10>=8 (dice pool), 1d20cs>18 (improved crit)
3. Dice templates (type:'dice_template', category:'brain') for attack/damage/skill/save/initiative
4. Situational modifiers for AI Master: "flanked → +2", "blessing → +1d4"

NEVER roll dice yourself. Save dice templates in brain (not glossary).`,

  import: `## Processing uploaded files
The admin uploads rule files. You extract mechanics into glossary and brain.

Workflow:
1. Ask which files to import → bulk_import_to_glossary(typeMap). Each folder → one glossary type (e.g. spells, monsters, classes).
   Provide typeMap as { folderPath: type }. Type examples: rule, spell, monster, class, race, feat, equipment, trait, condition, crafting.
2. Scan for wiki-links → scan_wiki_links(). Returns links to fix.
3. Fix links → replace_wiki_links(fixes). Each fix = { original, replacement } or { original, id }.
4. Create index docs → _index docs in each glossary type section for navigation.
5. Search for duplicates → search_documents(query) before creating new docs.

After import complete: build brain instructions. Then suggest switching to Memory mode for game state setup.`,

  brain: `## What brain documents to create
Brain = instructions for the AI Master. Category: 'brain'. NOT rules — those go in glossary.

Required brain docs (create for every game system):
- _index (type: '_index') — mandatory entry point for AI Master. Contains:
  1. Router: what section to search for each query type (combat→mechanics, spell→spells, character creation→char_creation)
  2. Key mechanics summary: action economy, advantage/disadvantage, DC system
  3. Character creation order (race→class→stats→skills→name)
  4. Message routing: what goes to game chat vs personal chat
- rules/index (type: 'routing') — message routing: detect if player message is a game action or personal question
- rules/mechanics (type: 'mechanics') — combat rules, skill checks, saves, initiative, actions
- rules/char_creation (type: 'char_creation') — step-by-step character creation with formulas
- rules/char_tracking (type: 'char_tracking') — what fields to track on character sheet
- rules/game_state (type: 'game_state') — what to store in game_hidden (scene, NPCs, plots)
- rules/doc_org (type: 'doc_org') — document organization plan

Save templates (type: 'dice_template') for common rolls: attack, damage, save, skill, initiative.`,

  formula: `## Formula System
Character sheets store computed values:

\`\`\`formula
name: strength_mod
expr: floor((16 - 10) / 2)
\`\`\`

Inline references: $strength_mod → clickable, shows +3.

Base stats (manual): the 6 core values players roll. Templates: STR, DEX, CON, INT, WIS, CHA with formula blocks for derived stats.
Derived stats (auto): computed from base. Examples: modifier=floor((score-10)/2), HP=10+CON_mod, AC=10+DEX_mod+armor, initiative=DEX_mod, proficiency=2+floor(level/4).

Rules:
- One formula per block — one derived stat = one block
- Base values are NOT formulas (they're just numbers the player fills)
- Write derived formulas as the brain doc instructs
- $varName references work across formula blocks
- DO NOT create formula blocks for base stats — only derived

Common derived stats: STR_mod, DEX_mod, CON_mod, INT_mod, WIS_mod, CHA_mod, HP, AC, initiative, proficiency, perception, speed, attack_bonus, spell_dc, spell_attack.`,

  links: `## Document Links
Use [[DocTitle]] or [[DocTitle|display text]] inside document content for cross-references.
Wiki-links auto-resolve to document IDs. Fix broken links with replace_wiki_links.

Link rules:
- Always add cross-references: brain docs link to glossary, glossary docs link to related rules
- After creating/renaming docs → scan_wiki_links → replace_wiki_links
- [[DocTitle]] in any category works — system resolves across all categories`,

  memory: `## Migrations (Memory mode)
When rules change, player data may need updates. In Memory mode:

1. Read the changed rules in glossary/brain
2. Read affected game_visible documents
3. Update character sheets manually (update_document, update_char_sheet)
4. Write notes to game_hidden explaining what was changed

Tell the admin what needs migration: "Elf rules changed — 2 character sheets use old darkvision range, want me to fix?"`,
};

export const getBuilderGuideTool = {
  description: "Get reference guide for a specific builder topic. Use when you need detailed instructions on dice notation, file imports, brain document structure, formulas, document links, or memory mode migrations.",
  inputSchema: zodSchema(
    z.object({
      topic: z.enum(["dice", "import", "brain", "formula", "links", "memory"]).describe("Guide topic to fetch"),
    })
  ),
  execute: async (args: { topic: string }) => {
    const guide = GUIDES[args.topic];
    if (!guide) return { error: `Unknown topic: ${args.topic}`, available: Object.keys(GUIDES) };
    return { topic: args.topic, guide };
  },
};
