# TRS Dashboard — Design System

The page is white. Fills are for badges, tinted table headers, and hover
states only — never a full section. Separation between surfaces reads as a
hairline border (or a border expressed as a `box-shadow` ring — see below),
not a drop shadow or a distinct background color. One navy accent
(`--primary`) is spent on links, active state, and calls to action; it is not
decorative. This mirrors the Keluarga Timur demo's "no boxes, no tinted
panels" rule, adapted to this app's own navy/enterprise identity rather than
importing Keluarga's literal palette.


## The website system everywhere (Jarod, 19 Nov 2026)

Chosen from the revamp choice sheet; it wins over anything older below. Built once in the shared
pieces (`globals.css`, `primitives.tsx`, `page-header.tsx`, `ui/register.tsx`, `top-navbar.tsx`), so
every page follows.

| Area | Rule | Where |
| --- | --- | --- |
| Tables | The website ledger, comfortable. No header band, no zebra, no outer box. A dark rule under the head, a hairline under every row and between columns, 46px rows. Headers and body cells centred; the first column and `.cell-left` read left. Hover in tint; a selected row mint with a green edge; `tr.row-total` ruled above and below; `td.cell-best` mint for the lowest figure. | `table.trs-table`, `Register`, `tableFrame` |
| Page header | Serif title (EB Garamond, 32px), one facts line, the page's actions on the right, the primary last. | `PageHeader` |
| Navigation | The website's top bar: 54px, the current place underlined in green; the place's pages on a tint band below. | `.trs-place`, `.trs-subtab`, `TopBar` |
| Tabs and filters | A page's or a record's sections are underlined tabs (`Segmented variant="tabs"`); filters and options are pills, the chosen one solid green (`Segmented`, the default). | `Segmented` |
| Buttons and status | The website's buttons: radius 7, a 1.5px edge, 40px (`sm`) or 32px (`xs`). Primary solid green; secondary the green outline; tertiary text. Status keeps the chips (`Chip`). | `Btn`, `LinkBtn`, `btnClass` |
| Forms | Boxed white fields, 40px, radius 7, a green focus ring; the label above in 13px medium ink. Many rows of the same shape are a grid (`xl-grid`). | `inputCls`, `textareaCls`, `Field` |
| Modals and pages | Real work is a full page; a modal only to confirm or for a short pick. Removals go through `useConfirm`. | `ui/confirm.tsx` |
| Empty, loading, error | Loading shows placeholder rows in a table's shape with the wait named small above; an empty list names what is missing and offers the action that fills it (`Empty action=`); an error says what failed in red. | `Spinner`, `Empty` |

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

One look for every table in the staff app (Jarod, 14 Nov 2026): `.trs-table` in `globals.css`, applied by `Register` and every hand-built table. Email bodies, PDFs and client-facing pages keep their own.

| Part | Rule |
| --- | --- |
| Frame | 1px `#dcdfd9` outer border, 10px radius (the `Register` card) |
| Header | `#f0f2ee` band, 12.5px muted, 36px, sticky; **every header centred** |
| Rows | 48px; every second row `#f9faf8`; hover `#e9f2ec`; selected `--trs-soft` |
| Lines | 1px `#e3e6e0` under every row and between columns; none after the last |

**Cell alignment, decided per column:**
- **Centred:** numbers, amounts, counts, dates, badges and status chips, short words (owner first name, line, stage, Yes/No).
- **Left:** the first (identity) column, names of companies, people and insurers, emails, subjects, descriptions, notes, file names, free text.
- `RegisterCell` centres by default; pass `align="left"` for a text column. In a hand-built table, add `cell-left` to the `td`. A centred cell holding a flex container adds `justify-center`.
- `XlGrid` (rate and data-entry grids) keeps its 32px rows; its cells follow the same alignment rule.

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

---

## Rail format (every right column), 11 Nov 2026

Built for the Inbox context rail and applied to every right column since: the case page (`/today/[id]`: Actions · Information · Source · Timeline) and the drawers that follow. Three groups, each under a green pill title (`GroupPill` in `src/components/engagement/rail-bits.tsx`: green text, soft green fill, green hairline, 999px radius, 13.5px medium): **Actions**, **AI**, **Information**. White ground; spacing separates (26px between action items, 36px between groups); no tinted cards, no boxes, no rules.

- **Actions**: one `ActionItem` per thing to do: an uppercase eyebrow for its kind (Waiting, Chaser due, Reply due, Suggested, Held), a 15px title, one muted meta line, then buttons with one primary. Drafts and the enquiry sender keep their editable boxes. To-do and case are a quiet link line at the end.
- **AI**: one `AiRow` per capability: sparkle, title, one line saying what it reads and returns, one hairline button on the right. Results render under the row, indented 19px.
- **Information**: `InfoRow` label-value pairs (92px label column), inline arrow links on the value, tabular figures. Status and notes fold under a `details`. A case always shows **Owner** as a row (the person's name, or "No owner"); on list cards it is the text `Owner: <name>`, never a chip.
- **Source** and **Timeline** on a case: linked threads and data-room files as plain two-line links with a trailing arrow; the timeline as a mono timestamp column.

### Buttons in a row

One shape per row. Every button in an action row or bar is the outlined secondary (`Btn`, default level) at the same height; the one primary is filled green and sits far right. No text-only (tertiary) buttons beside other buttons, and no `<select>` as an action: a choice of person is a `Reassign` button with a menu. Tertiary stays for a lone Cancel in a dialog footer or a link-like move inside a sentence. The rail's `SECOND` and `MAIN` are the same ladder at row height (`btnClass('secondary' | 'primary', 'xs')`).
