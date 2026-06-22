# TRS Dashboard — Design System

## Surface tokens

| Token | Value | Used for |
|---|---|---|
| `surface-0` | `hsl(216 22% 95%)` | Page background (`bg-background`) |
| `surface-1` | `white` | Panels, sidebars (`bg-card`) |
| `surface-2` | `white` + `--card-shadow` | Floating cards (Card component) |
| `surface-3` | `white` + `--shadow-modal` | Modals, popovers |

## CSS custom properties

```css
/* Borders */
--border-subtle:   rgba(16,24,40,0.08)  /* structural seams and dividers */
--border-input:    hsl(var(--border))   /* interactive form controls */

/* Shadows */
--card-shadow:     0 1px 4px rgba(16,24,40,0.09), 0 2px 6px rgba(16,24,40,0.05)
--shadow-panel:    0 4px 16px rgba(16,24,40,0.08), 0 2px 8px rgba(16,24,40,0.04)
--shadow-modal:    0 8px 24px rgba(16,24,40,0.12), 0 4px 12px rgba(16,24,40,0.06)
```

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

| State | Style |
|---|---|
| Default inactive | `bg-muted text-muted-foreground rounded-[6px]` |
| Active (colored) | `bg-{color}/[0.12] text-{color} rounded-[6px]` |
| Active (primary) | `bg-primary/[0.08] text-primary rounded-[6px]` |
| Never | outlined border as primary signal |

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
