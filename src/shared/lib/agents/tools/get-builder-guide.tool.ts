import { z } from "zod";
import { zodSchema } from "ai";

const GUIDES: Record<string, string> = {
  dice: `## Dice Rolling System
The dice engine supports standard RPG notation: basic (d6, d20, 4d6, d%, dF), math (+, -, *, /, ^, %, parentheses, round/floor/ceil/abs/sqrt/min/max), keep/drop (4d6kh3, 2d20kl1, 4d10dl2), exploding (1d10!, 1d6!!, 1d10!p), re-roll (d6r, 2d6ro>4), target success (5d10>=8), critical (2d20cs, 2d20cf), group ({4d6,3d8,2d10}kh — multiple pools, keep highest). The syntax is universal — the game's rules define which dice and formulas it uses.

What to write in brain docs:
1. Which dice the system uses (any of the notation above, per the rules)
2. Common formulas the game needs — as the rules define them (character generation, checks, damage, and so on)
3. Dice templates (type:'dice_template', category:'brain') for the common rolls of THIS system
4. Situational modifiers as the system gives them (flat bonus, extra die, reroll — whatever the rules say)

NEVER roll dice yourself. Save dice templates in brain (not glossary).`,

  import: `## Processing uploaded files
The admin uploads rule files. You extract mechanics into glossary and brain.

Workflow:
1. explore_archive() — returns BOTH a tree AND a flat "folders" list: every folder with its FULL path and direct file count. Decide a type for EACH folder by MEANING (what the entries are), not by folder name.
   - Nesting: deeper folders override their parent. rules/bestiary/ = monsters (not "rules"); rules/mechanics/ = rules; homebrew/spells/ = spells. homebrew/multiverse/rules are SOURCES, not types.
   - Use sample filenames as hints; if unsure, pick a reasonable type and flag it to the admin.
2. bulk_import_to_glossary(typeMap). Each folder → one glossary type.
   - Type matching is by folder PREFIX, longest match wins: { "/rules": "rule", "/rules/bestiary": "monster" } imports all of /rules as rule EXCEPT /rules/bestiary as monster. You can map parents broadly and override specific subfolders.
   - Use type names that fit the game structure (e.g. rules, creatures, items, abilities, conditions). Names can be anything meaningful — they are categories, not copies of folder names.
3. Scan for wiki-links → scan_wiki_links(). Returns links to fix.
4. Fix links → replace_wiki_links(fixes). Each fix = { original, replacement } or { original, id }.
5. Create index docs → _index docs in each glossary type section for navigation.
6. Search for duplicates → search_rules(query) before creating new docs.

After import complete: build brain instructions. Then suggest switching to Memory mode for game state setup.`,

  brain: `## What brain documents to create
Brain = instructions for the AI Master. Category: 'brain'. NOT rules — those go in glossary.

Required brain docs (create for every game system):
- _index (type: '_index') — mandatory entry point for AI Master. Contains:
  1. Router: what section to search for each query type (e.g. combat→mechanics, character creation→char_creation)
  2. Key mechanics summary: how actions resolve, how outcomes are determined (target numbers, thresholds, dice pools)
  3. Character creation order (as the system defines it)
  4. Message routing: what goes to game chat vs personal chat
- rules/index (type: 'routing') — message routing: detect if player message is a game action or personal question
- rules/mechanics (type: 'mechanics') — combat rules, checks, saves, initiative, actions
- rules/char_creation (type: 'char_creation') — step-by-step character creation with formulas
- rules/char_tracking (type: 'char_tracking') — what fields to track on character sheet
- rules/game_state (type: 'game_state') — what to store in game_hidden (scene, NPCs, plots)
- rules/doc_org (type: 'doc_org') — document organization plan

Add to the brain a memory-organization note for the GM (e.g. in _index or a rules/game_memory doc): which memory categories THIS game needs (facts, secrets, plans, npc, rumors...), how to structure them, and when to clean them up. The GM maintains these records live during the game via write_note / create_document / update_document.

After importing the glossary, call glossary_overview() to learn the actual types and counts of this game's glossary, and write them into rules/doc_org (type: 'doc_org') or the _index: "Glossary types: monster, spell, item, ... — use search_rules(query, type) to filter by type." This lets the GM search the glossary efficiently instead of dumping it.

Save templates (type: 'dice_template') for common rolls: attack, damage, save, skill, initiative.

## Brain structure rules — sizes, splitting, no duplicates (IMPORTANT)
1. **Section size limit: ~6-7 KB max.** If a topic grows beyond that, SPLIT it into sub-sections rules/<subtopic> and keep each sub-section focused. Example for D&D-like systems: instead of one huge rules/mechanics, create rules/combat (attacks, crits, initiative), rules/rest_death (rest, death saves, resurrection, inspiration), rules/magic (spellcasting, concentration, components), rules/npc_relations (attitude shifts) — so the GM reads only the fragment it needs via get_brain(topic) / read_document instead of a whole 20-25 KB file.
2. **The _index is NAVIGATION + POLICY only (3-5 KB).** Keep: the router, the character creation order, message routing, and a short policy. Do NOT copy the summaries of the sections into the index.
3. **One topic — one place.** Never duplicate content between _index and sections, or between sections. The full text lives in exactly one section; everything else references it via [[id]] wiki-links. Duplicates make the preloaded index huge and confuse the GM about which text is authoritative.
4. **After creating or splitting sections**: update the router in _index (point query types to the new sections) and run scan_wiki_links → replace_wiki_links so old links to split sections now point to the correct new ones.`,

  formula: `## Formula System
Character sheets compute derived values from base inputs:

\`\`\`formula
# base inputs (the player fills these)
str: 16
dex: 17
level: 1
hd_size: 8
base_ac: 14
shield_bonus: 2
pm: 0
zm: 15

# derived formulas (auto)
str_mod = floor((str-10)/2)
dex_mod = floor((dex-10)/2)
prof = floor((level-1)/4)+2
ac = base_ac + shield_bonus + dex_mod
hp_max = hd_size + con_mod + (level-1) * (floor((hd_size+1)/2) + con_mod)
money_total_gm = pm*10 + zm + sm*0.1 + mm*0.01
\`\`\`

Rules:
- ONE \`\`\`formula block at the TOP of the sheet: base inputs (name: number) + formulas (name = expression).
- Inline references in the body: $name — the UI substitutes the computed value; the master sees both $name and the value.
- Formulas may reference other formulas and base inputs; declaration order does not matter.
- Base values change → edit the input line; derived values recompute automatically.
- Errors (missing variable, division by zero, circular reference, non-finite) are reported as "err" — never guess a value.
- create_document / update_document return formulaValidation ({ ok, errorCount, errors }) — check it after saving; if errors exist, fix the formulas and save again.
- The needed variables/formulas depend on the class and the system (AC from dex or wis, Pathfinder, etc.) — define them per the game's rules from the glossary. One derived stat = one line.`,

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

Tell the admin what needs migration: "The updated rule affects 2 character sheets — want me to migrate their data?"`,
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
