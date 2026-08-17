# TRS Dashboard — Design System

The page is white. Fills are for badges, tinted table headers, and hover
states only — never a full section. Separation between surfaces reads as a
hairline border (or a border expressed as a `box-shadow` ring — see below),
not a drop shadow or a distinct background color. One navy accent
(`--primary`) is spent on links, active state, and calls to action; it is not
decorative. This mirrors the Keluarga Timur demo's "no boxes, no tinted
panels" rule, adapted to this app's own navy/enterprise identity rather than
importing Keluarga's literal palette.

## Surface tokens

| Token | Value | Used for |
|---|---|---|
| `surface-0` | `white` | Page background (`bg-background`) |
| `surface-1` | `white` | Panels, sidebars (`bg-card`) — same as the page; a hairline ring is what separates it |
| `surface-2` | `white` + `--card-shadow` (hairline ring) | Resting cards (Card component) |
| `surface-3` | `white` + `--shadow-panel` | Genuinely floating panels — open dropdowns, hover-lifted cards |
| `surface-4` | `white` + `--shadow-modal` | Modals, popovers — the only surfaces that keep real elevation |

## CSS custom properties

```css
/* Borders */
--border-subtle:   rgba(16,24,40,0.08)  /* structural seams and dividers */
--border-input:    hsl(var(--border))   /* interactive form controls */

/* Shadows — hairline first. A resting card is a 1px ring, not a blurred
   drop shadow; real elevation (blur) is reserved for things that actually
   float above the page (dropdowns, modals). */
--card-shadow:     0 0 0 1px var(--border-subtle)
--shadow-panel:    0 0 0 1px var(--border-mid), 0 6px 16px rgba(16,24,40,0.07)
--shadow-modal:    0 0 0 1px var(--border-mid), 0 16px 40px rgba(16,24,40,0.14)
```

The former "Apple Liquid Glass" material system (`.glass-sidebar`,
`.glass-thin`, `.glass-regular`, `.glass-modal`, `.glass`, backdrop blur, and
the `.btn-glass` shimmer animation on the primary button) has been retired.
Those class names still exist for compatibility with existing markup, but
now resolve to flat white + hairline border, with `--shadow-panel` /
`--shadow-modal` reserved for surfaces that are genuinely floating.

---

## Border rules

### Use a border when:
- **Layout seam** — sidebar/content edge, panel/panel edge, header/body edge
  → `border-r border-[--border-subtle]`, `border-b border-[--border-subtle]`
- **Interactive input** — text fields, selects, buttons that need affordance
  → `border border-input` (keep `hsl(var(--border))`)
- **Active left-rail** — selected item in a nav or list
  → `border-l-2 border-primary`
- **Callout accent** — error/success/warning/info banners
  → `border-l-[3px] border-{color}/40` only — no outer border

### Never add a border for:
- Cards floating on the page background (shadow carries the weight)
- Table header rows (tinted background separates from body)
- Chips, tags, badges, filter pills (bg tint is the signal)
- Hover state on cards or links (use shadow intensify or bg tint)
- Nested sections inside a card (spacing separates)

---

## Border token guide

| Context | Class to use |
|---|---|
| Sidebar/content seam | `border-r border-[--border-subtle]` |
| Panel header / section divider | `border-b border-[--border-subtle]` |
| Table row | `border-b border-[--border-subtle]` |
| Column divider (grid) | `border-l border-[--border-subtle]` |
| Interactive input | `border border-input` |
| Callout banner | `border-l-[3px] border-{semantic}/40` |
| Structural divider element | `<div className="h-px bg-[--border-subtle]" />` |

---

## Radius system

| Element | Value | Notes |
|---|---|---|
| Cards | `rounded-lg` (12px) | Default for all card-like containers |
| Inputs | `rounded-md` (10px) | Text fields, selects, comboboxes |
| Buttons | `rounded-md` (8px) | Default via shadcn Button |
| Chips / tags / badges | `rounded-[6px]` | Status badges, filter pills |
| Inline count badges | `rounded-[5px]` | Small numeric labels |
| Avatars | `rounded-full` | Circular portraits only |
| Status dots | `rounded-full` | Colored dot indicators |
| Step / number circles | `rounded-full` | Numbered step circles in workflows |

**Rule:** `rounded-full` is reserved for things that are intentionally circular (avatars, dots, step circles). Text-bearing chips always use `rounded-[5px]` or `rounded-[6px]`.

---

## Shadow / elevation system

| Level | Token | Used for |
|---|---|---|
| Resting card | `--card-shadow` | Cards, table wrappers, panels at rest |
| Hover / active card | `--shadow-panel` | Cards on hover, dropdowns, sidepanels |
| Overlay | `--shadow-modal` | Modals, command palettes, date pickers |

**Rule:** Hover state on a card intensifies shadow (resting → panel level). Do not use border darkening for hover — that reads as selection.

---

## Table rules

- **Header row** — no `border-b`; uses `bg-muted/50` tint to separate from body
- **Body rows** — `border-b border-[--border-subtle]`
- **Expanded row** — `bg-muted/20 border-b border-[--border-subtle]`
- **No full-cell boxing** — column separators only where the grid layout demands it

---

## Form / composer rules

- Search inputs: `border border-input rounded-md`
- Textareas, selects: same — `border border-input`
- Compose / reply area: no extra border wrapping; the surface bg and shadow contain it
- Filter toolbar: `border-b border-[--border-subtle]`; individual filter chips have no border

---

## Callout banner rules

All informational banners (error, success, warning, info) use:
- **Left accent only** — `border-l-[3px] border-{color}/40`
- **Tinted background** — `bg-{color}/[0.08]`
- **No outer border** — the left accent + bg tint is sufficient

| Variant | Accent | Background |
|---|---|---|
| Error | `border-destructive/40` | `bg-destructive/[0.08]` |
| Success | `border-[rgba(15,138,95,0.5)]` | `bg-[rgba(15,138,95,0.08)]` |
| Warning | `border-amber-400/60` | `bg-amber-50` |
| Info / violet | `border-violet-300` | `bg-violet-50` |

---

## Chip / pill rules

Two distinct patterns, both `rounded-[6px]` — never `rounded-full` on a
chip that contains text (reserve `rounded-full` for avatars, dots, and
step circles).

**Status badges / tags** (non-interactive, e.g. `.st-badge`) — fill-only,
no border:

| State | Style |
|---|---|
| Default | `bg-muted text-muted-foreground rounded-[6px]` |
| Colored | `bg-{color}/[0.12] text-{color} rounded-[6px]` |
| Primary | `bg-primary/[0.08] text-primary rounded-[6px]` |

**Filter / toggle pills** (interactive, e.g. `.filter-pill`, top-nav
triggers) — a hairline border at rest, filled only when selected. This is
the segmented-control pattern borrowed from Keluarga Timur: a tonal fill
reads as "selected" without an invert-to-solid-black/blue look.

| State | Style |
|---|---|
| Idle | `border border-[--border-subtle] bg-transparent text-muted-foreground` |
| Hover | `bg-muted border-[--border-mid] text-foreground` |
| Active/selected | `bg-[--primary-light-bg] border-[--primary-light-border] text-[--primary-hex]` |

---

## Hover / interactive states

| Element | Hover behavior |
|---|---|
| Card | Shadow: `--card-shadow` → `--shadow-panel` |
| Nav link | `bg-accent/60` |
| Platform link | `bg-accent/60` |
| Table row | `bg-muted/40` |
| Filter chip | `bg-muted` |
| Button (outline) | shadcn default (slight bg tint) |
