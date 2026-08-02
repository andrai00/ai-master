# Formula System Reference

Formulas let document authors define computed variables that auto-resolve. The Game Master uses them for character sheets, NPC stat blocks, and any document where derived values change when base stats change.

## Syntax

### Formula Block

Define a named variable with a math expression:

````
```formula
name: dex_mod
expr: floor((dexterity - 10) / 2)
```
````

- `name` — unique variable name within the document (`snake_case`, letters/numbers/underscores)
- `expr` — mathjs expression using numbers, operators, functions, and references to other formula variables

### Inline Reference

Reference a variable's computed value inline:

```
`$dex_mod`
```

The viewer renders this as the computed value (e.g. `+3`), clickable to reveal the formula.

## Operators

| Op | Meaning | Example |
|---|---|---|
| `+` `-` `*` `/` | Basic arithmetic | `strength + dexterity` |
| `^` | Power | `level ^ 2` |
| `%` | Modulo | `hp % 10` |
| `==` `!=` `<` `>` `<=` `>=` | Comparison (returns 0/1) | `strength >= 15` |

Parentheses control precedence: `(str + dex) / 2`

## Functions

`abs`, `ceil`, `floor`, `round`, `sqrt`, `min`, `max`, `log`, `log10`, `exp`, `sin`, `cos`, `tan`, `atan2`, `pow`, `mod`, `sign`

```
floor((dexterity - 10) / 2)    -- ability modifier
max(dexterity, strength)        -- highest stat
min(level, 20)                  -- cap at 20
round(hp_max * 0.5)             -- half HP rounded
sqrt(4)                         -- 2
```

## Constants

`pi`, `e`, `true` (1), `false` (0)

## Dependency Resolution

Variables can reference other formula variables. The evaluator builds a dependency graph and resolves in correct order:

````
```formula
name: dex_mod
expr: floor((dexterity - 10) / 2)
```

```formula
name: ac
expr: 10 + dex_mod + armor_bonus
```

```formula
name: initiative
expr: dex_mod + floor(level / 4)
```
````

Here `ac` depends on `dex_mod`, and `initiative` depends on `dex_mod` — both resolve correctly because `dex_mod` is computed first.

**Cyclic references** are detected and reported as errors. Maximum evaluation depth is 50 to prevent runaway chains.

## Scope

- Formula variables are scoped to their **document**. A variable `dex_mod` in the character sheet of "Garret" is separate from `dex_mod` in "Elara".
- Cross-document references (`garret_dex_mod`) are NOT supported — keep formulas within one document.
- Only formula variables declared with `name:` in ````formula` blocks can be referenced by other formulas. Free-standing numbers (like literal `16` in the document) are not referenceable.

## Rendering

- **Collapsed** (default): shows computed value only, e.g. `+3`
- **Expanded** (click): shows formula and value: `floor((16 - 10) / 2) = 3`
- **No value yet** (unevaluated): shows the expression in grey, e.g. `floor((dex - 10) / 2)`
- **Error**: shows the expression with a warning indicator

## Where to Use

Formulas work in documents of categories: `brain`, `game_hidden`, `game_visible`. They do NOT work in `glossary` (glossary is static reference text).

## Example: Character Sheet Template

````markdown
# Character Sheet: {name}

## Core Stats

```formula
name: str_mod
expr: floor((strength - 10) / 2)
```

```formula
name: dex_mod
expr: floor((dexterity - 10) / 2)
```

```formula
name: con_mod
expr: floor((constitution - 10) / 2)
```

| Stat | Value | Modifier |
|------|-------|----------|
| Strength | 16 | `$str_mod` |
| Dexterity | 14 | `$dex_mod` |
| Constitution | 12 | `$con_mod` |

## Combat

```formula
name: ac
expr: 10 + dex_mod + 2
```

```formula
name: initiative
expr: dex_mod
```

```formula
name: hp_max
expr: 10 + con_mod + max(1, 8) * 3
```

- **AC:** `$ac`
- **Initiative:** `$initiative`
- **HP:** `$hp_max`
````

## MathJS Version

This system uses mathjs v15+. See https://mathjs.org/docs/ for full expression reference.
