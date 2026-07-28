# Dice Notation Reference

This is the full dice notation syntax supported by the platform. Use this reference when writing roll formulas for any game system.

## Basic Dice

| Notation | Meaning | Example |
|---|---|---|
| `dN` | Single die with N sides | `d6`, `d20` |
| `XdN` | X dice with N sides | `4d6`, `2d20` |
| `d%` | Percentile die (1-100) | `d%`, `4d%` |
| `dF` | Fudge/Fate die (-1, 0, +1) | `dF`, `4dF` |
| `dF.1` | Fudge variant (4 blank, 1 plus, 1 minus) | `dF.1` |

Maximum dice quantity: 999. Minimum: 1.

## Math Operators

| Operator | Example | Result |
|---|---|---|
| `+` | `1d20 + 5` | Add modifier |
| `-` | `2d6 - 1` | Subtract modifier |
| `*` | `4d10 * 2` | Multiply |
| `/` | `1d100 / 2` | Divide |
| `^` or `**` | `3d20^4` | Exponent |
| `%` | `d15 % 2` | Modulus (remainder) |

Parentheses control order of operations: `(1d6 + 2) * 3`

Dynamic dice: `(4-2)d10` (roll `2d10`), `3d(2*6)` (roll `3d12`)

## Math Functions

`abs`, `ceil`, `cos`, `exp`, `floor`, `log`, `max`, `min`, `pow`, `round`, `sign`, `sin`, `sqrt`, `tan`

```
round(4d10 / 3)    -- round result
floor(2d6 * 1.5)   -- floor result
ceil(1d20 / 2)     -- ceil result
abs(4d10 - 25)     -- absolute value
sqrt(4d10)         -- square root
min(4d6, 2d10)     -- minimum of two rolls
max(4d6, 2d10)     -- maximum of two rolls
```

`round()` rounds half away from zero (not JS Math.round).

## Modifiers

Modifiers are appended directly after the die notation. Multiple modifiers can be chained. They execute in a fixed order regardless of how you write them.

### Exploding `!`

Re-rolls dice that hit the maximum value, adding results together.

```
4d10!        -- explode on max (10)
2d6!>4       -- explode on rolls > 4
2d6!=5       -- explode on rolls = 5
4d10!<=3     -- explode on rolls <= 3
```

### Compounding `!!`

Same as exploding but combines re-rolled dice into a single result.

```
4d10!!       -- compound on max
2d6!!>4      -- compound on rolls > 4
```

### Penetrating `!p` / `!!p`

Exploding variant: subtract 1 from each re-rolled die (HackMaster style).

```
2d6!p        -- penetrating explode
2d6!!p       -- penetrating compound
2d6!p=5      -- penetrate on rolls = 5
```

### Re-roll `r` / `ro`

Re-rolls dice that hit the minimum value. `r` keeps re-rolling, `ro` re-rolls once.

```
d6r          -- re-roll 1s until > 1
d6ro         -- re-roll 1s once
2d6r=5       -- re-roll on rolls = 5
2d6ro>4      -- re-roll once on rolls > 4
4d10r<=3     -- re-roll on rolls <= 3
```

### Unique `u` / `uo`

Re-rolls duplicate values. `u` keeps rolling until unique, `uo` re-rolls once.

```
2d10u        -- re-roll duplicates
2d10uo       -- re-roll duplicates once
4d6u=5       -- only re-roll duplicates that = 5
```

### Keep `k{n}` / `kh{n}` / `kl{n}`

Keep only the highest or lowest N rolls, discard the rest.

```
4d6kh3       -- keep highest 3 (D&D ability scores)
4d6k3        -- same as kh3
4d10kl1      -- keep lowest 1
```

### Drop `d{n}` / `dh{n}` / `dl{n}`

Drop the highest or lowest N rolls. Default: drop lowest.

```
4d10dl2      -- drop lowest 2
4d10d2       -- same as dl2
4d10dh1      -- drop highest 1
4d10dh1dl1   -- drop highest and lowest
```

### Target Success (Dice Pool) `{cp}`

Count successes: each die meeting the condition = 1 success.

```
5d10>=8      -- World of Darkness style (8+ = success)
4d6=6        -- only 6 = success
4d3>1        -- greater than 1 = success
6d10<=4      -- less than or equal to 4 = success
```

### Target Failure `f{cp}`

Must directly follow a success modifier. Each failure subtracts 1 from successes.

```
4d6>4f<3     -- > 4 is success, < 3 is failure (subtracts 1)
```

### Critical Success `cs{cp}`

Marks rolls on both ends with `**` for display. Purely aesthetic.

```
2d20cs       -- crit on max (20)
4d10cs>7     -- crit on rolls > 7
```

### Critical Failure `cf{cp}`

Marks rolls on both ends with `__` for display. Purely aesthetic.

```
2d20cf       -- crit fail on min (1)
4d10cf<3     -- crit fail on rolls < 3
```

### Sort `s` / `sa` / `sd`

Sort results: `sa` = ascending (default), `sd` = descending.

```
4d6s         -- sort ascending
4d6sd        -- sort descending
```

### Min/Max `min{n}` / `max{n}`

Floor or cap individual die values.

```
4d6min3      -- values < 3 become 3
4d6max3      -- values > 3 become 3
```

## Compare Points

Used by modifiers to specify trigger conditions:

| Operator | Meaning |
|---|---|
| `=N` | Equal to N |
| `!=N` or `<>N` | Not equal to N |
| `<N` | Less than N |
| `>N` | Greater than N |
| `<=N` | Less than or equal to N |
| `>=N` | Greater than or equal to N |

Use `<>` (not `!=`) for "not equal" with exploding dice: `2d6!<>4`

## Group Rolls

Comma-separated sub-rolls in curly braces. Totals are summed. Modifiers apply to the whole group.

```
{4d6, 2d10, d4}              -- three separate rolls, sum totals
{3d8*2, 20/2d10}             -- formulas as sub-rolls
{4d6, 3d8, 2d10}kh           -- keep highest sub-roll total
{4d6, 5d6, 2d10}k2           -- keep 2 highest sub-rolls
{4d10, 5d6, 2d10}d1          -- drop lowest sub-roll
{4d6+2d8, 3d20+3, 5d10+1}>40 -- count sub-rolls with total > 40
{4d6, 3d8, 2d10}s            -- sort sub-rolls by total ascending
```

Single sub-roll with modifiers applies to individual dice within it:

```
{4d10*(2+5d6)}k2             -- keep highest 2 individual rolls
{4d6+2d8-3d30}d3             -- drop lowest 3 individual rolls
```

## Descriptions (Flavor Text)

Add labels to rolls for display:

```
4d6 # Fire damage           -- inline comment
2d10 // Ice damage          -- inline comment
4d6 [ Fire damage ]         -- block description
{5d6 + 5} [ Fire damage ]   -- group description
```

## Common Game Patterns

### D&D 5e / d20 System

```
1d20 + 5                    -- attack roll / skill check
2d20kh1 + 5                 -- roll with advantage
2d20kl1 + 5                 -- roll with disadvantage
1d20cs + 5                  -- attack with crit highlight (20 = crit)
2d6 + 3                     -- greatsword damage
1d8 + 2d6                   -- longsword + sneak attack
1d20cs>18 + 5               -- improved critical (19-20)
```

### D&D Ability Scores

```
4d6kh3                      -- roll 4d6, keep highest 3
{4d6kh3, 4d6kh3, 4d6kh3, 4d6kh3, 4d6kh3, 4d6kh3}  -- all 6 stats
```

### D&D Hit Points

```
1d10 + 2                    -- hit die + CON modifier
max(1d10, 1d10) + 2         -- advantage on HP roll
```

### Savage Worlds

```
1d8! + 1d6!                 -- trait die + wild die (both exploding)
{1d8!, 1d6!}kh              -- keep the higher of the two
1d6!                        -- damage with exploding (aces)
```

### World of Darkness / Storyteller

```
5d10>=8                     -- roll pool, 8+ = success
7d10>=8f=1                  -- 8+ success, 1 = botch (failure)
10d10>=6                    -- easier difficulty
```

### FATE / Fudge

```
4dF + 3                     -- roll 4 Fudge dice, add skill
4dF + 2 # Fight             -- labeled skill roll
```

### Shadowrun

```
12d6>=5                     -- dice pool, 5+ = success
15d6>=5f=1                  -- 5+ success, 1 = glitch
```

### Call of Cthulhu

```
1d100                       -- percentile roll
1d100 <= 55                 -- skill check (needs to roll under)
```

### Year Zero Engine (Mutant, Alien, etc.)

```
6d6=6                       -- count 6s as successes
8d6=6!                      -- 6s explode (push the roll)
```

### Powered by the Apocalypse

```
2d6 + 1                     -- 2d6 + stat, 10+ = success, 7-9 = partial, 6- = miss
```

### Percentile / d100 Systems

```
d%                          -- 1-100
d% <= 45                    -- skill check under 45
1d100 + 20                  -- modifier
```

### Advantage/Disadvantage Patterns

```
2d20kh1                     -- advantage (D&D)
2d20kl1                     -- disadvantage (D&D)
3d20kh1                     -- double advantage
max(3d6kh3, 3d6kh3)         -- advantage on 3d6 roll
min(d100, d100)             -- disadvantage on d100
```

### Exploding / Open-Ended Rolls

```
1d10!                       -- explode on 10
3d6!                        -- explode on 6
1d20!!                      -- compound on 20
1d10!>=8                    -- explode on 8-10
1d100!>=95                  -- explode on 95-100
```

### Keep/Drop Patterns

```
4d6kh3                      -- roll 4, keep 3 highest
2d20kh1                     -- roll 2d20, keep highest (advantage)
5d8kh2                      -- keep 2 highest of 5d8
4d10dl1                     -- drop lowest of 4d10
6d8dh2                      -- drop 2 highest of 6d8
```

### Complex Examples

```
1d20 + 5 + 1d4 # Attack with Bless
(1d8 + 4) * 2 # Crit multiplier
floor(1d100 / 2)            -- half percentile
max(1d8, 1d8) + 3          -- savage attacker feat
{1d20 + 5, 1d20 + 5}kh1    -- elven accuracy (triple advantage via groups)
round(4d10 / 3)             -- average damage per target
```
