# TRS Dashboard — Design System Governance

## Ownership

| Area | Owner |
|---|---|
| CSS custom properties (`globals.css`) | Lead engineer |
| shadcn/ui primitives (`src/components/ui/`) | Lead engineer |
| Shared components (`src/components/`) | Any contributor — changes require review |
| Page-level styles | Page author — follow `design-system.md` |
| `design-system.md` / `governance.md` | Lead engineer |

---

## Contribution rules

### Adding a new page
1. Read `design-system.md` before writing any border or radius classes.
2. Cards: use the `Card` component from `src/components/ui/card.tsx` — no `border` className needed.
3. Structural seams: `border-[--border-subtle]`, never `border-border`.
4. Chips / count badges: `rounded-[5px]` or `rounded-[6px]`, never `rounded-full` unless it's a dot or avatar.
5. Callout banners: left-accent pattern (`border-l-[3px]`), no outer border.
6. Run `npx tsc --noEmit` before committing.

### Modifying a shared component
- Any change to `src/components/ui/` or `src/components/` must check all callsites before merging.
- Run a global search for `border-border` after any changes to confirm no new instances were introduced.

### Adding new tokens
- New CSS custom properties go in `:root` in `globals.css`, grouped with related tokens.
- Add a row to `design-system.md` before or alongside the PR.
- Do not introduce new one-off colors via inline hex strings. Use existing semantic tokens or add a proper token.

---

## What to avoid

These patterns are explicitly deprecated. Do not use them in new code:

| Deprecated | Use instead |
|---|---|
| `border border-border` on a card | Remove the border; shadow contains the card |
| `border-border` on a chip/badge | `rounded-[6px] bg-muted` |
| `rounded-full` on a text chip | `rounded-[5px]` or `rounded-[6px]` |
| `hover:border-border/80` on a card | `hover:shadow-[var(--shadow-panel)]` |
| `borderBottom: '1px solid hsl(var(--border))'` inline style | `borderBottom: '1px solid var(--border-subtle)'` |
| Full-border callout (`border border-{color}`) | Left-accent callout (`border-l-[3px]`) |
| `bg-border` for dividers | `bg-[--border-subtle]` |

---

## Versioning

The design system follows the product version. There is no independent version number. Breaking changes (token renames, component API changes) are noted in the git commit message with `BREAKING:` prefix.

Tokens that are removed will be kept as aliases for one sprint before deletion.

---

## Deprecation process

1. Mark the deprecated class/token in `design-system.md` with a ~~strikethrough~~ note.
2. Run a global search for all usages and open a cleanup PR.
3. Remove in the same PR or the following sprint.
4. Never leave deprecated patterns in `src/` longer than one sprint.

---

## Enforcement

Automated: none yet. Manual process:
- New screens get a design review before merge (check against the QA checklist in `ui-audit.md`).
- Quarterly UI audit (see `ui-audit.md`) catches drift across the whole codebase.
- Run `grep -rn "border-border\|rounded-full" src/` before every release to surface outliers.
