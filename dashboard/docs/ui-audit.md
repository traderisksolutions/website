# TRS Dashboard — UI Audit & Maintenance

## Screen-by-screen audit checklist

Run this checklist against every page before merge and during quarterly reviews.

### Border checks
- [ ] No `border border-border` on cards (use shadow)
- [ ] No `border border-border` on chips, badges, pills
- [ ] No `border-border` hover state on links or cards
- [ ] Structural seams use `border-[--border-subtle]`
- [ ] Callouts use left-accent only (`border-l-[3px]`)
- [ ] Inline styles use `var(--border-subtle)` not `hsl(var(--border))` for structural borders

### Radius checks
- [ ] Chips / count badges: `rounded-[5px]` or `rounded-[6px]`
- [ ] `rounded-full` only on avatars, dots, step circles
- [ ] No `rounded-full` on any element that contains text content

### Shadow / elevation checks
- [ ] Cards use `--card-shadow` (via the Card component — no inline shadow needed)
- [ ] Hover uses `--shadow-panel`, not border intensify
- [ ] Dropdowns and sidepanels use `--shadow-panel`
- [ ] Modals use `--shadow-modal`

### Spacing / density checks
- [ ] No back-to-back bordered containers (nested border inside border)
- [ ] Table header uses bg tint, not `border-b`
- [ ] Section dividers inside a card use spacing, not repeated `border-b`
- [ ] Filter toolbar uses `border-b border-[--border-subtle]` at the bottom, no inner pill borders

---

## Grep commands for quick audit

```bash
# Find structural border-border usages (should be zero)
grep -rn "border border-border\|border-b border-border\|border-r border-border\|border-t border-border\|border-l border-border" src/

# Find rounded-full on text elements (should only be dots/avatars/circles)
grep -rn "rounded-full" src/ | grep -v "w-1\.5\|w-2 h-2\|w-3 h-3\|w-5 h-5\|w-7 h-7\|w-8 h-8\|w-9 h-9\|w-10 h-10\|rounded-full\"$"

# Find inline hsl(var(--border)) structural uses
grep -rn "hsl(var(--border))" src/ | grep -v "border-input\|focus:ring"

# Find deprecated hover border patterns
grep -rn "hover:border-border\|hover:border-muted-foreground" src/
```

---

## UI quality metrics

These are signal metrics, not pass/fail gates. Track them quarterly.

| Metric | Method | Target |
|---|---|---|
| `border-border` count | `grep -rn "border-border" src/` | 0 structural, some interactive ok |
| `rounded-full` on text chips | Manual grep review | 0 |
| Deprecated inline `hsl(var(--border))` | grep above | 0 structural |
| New pages following design system | Design review checklist | 100% reviewed before merge |

---

## Adoption metrics

Track these per quarter:
- **Coverage**: % of pages that have been refactored to the new design language (currently 100% as of 2026-06-22)
- **Regression rate**: % of pages that introduce a deprecated pattern in a given sprint
- **Time to review**: Average hours for a design review on a new screen

---

## Quarterly review process

**Q3 2026 review (due: end of September 2026)**

1. Run the grep audit commands above across `src/`.
2. Screenshot all 35 pages at 1440px width.
3. Compare side-by-side against the prior-quarter screenshots (stored in `/docs/screenshots/`).
4. File a cleanup PR for any drift found.
5. Update `design-system.md` if any tokens or rules have changed since last quarter.
6. Update this file with the next review date.

---

## Known UX debt (as of 2026-06-22)

| Item | Priority | Notes |
|---|---|---|
| Mobile responsive pass | Medium | Screens built desktop-first; mobile layout needs review |
| Dark mode | Low | CSS custom properties are in place; surface tokens need dark-mode values |
| Focus ring consistency | Medium | `focus:ring-1 focus:ring-ring` used in most inputs but not all |
| RichEditor border audit | Low | Complex inline-style component; partial cleanup done |
| Tooltip styling | Low | shadcn default; not yet aligned to `--shadow-panel` |

---

## Proposed next improvements

1. **Component: `Callout`** — extract the left-accent banner pattern into a reusable `<Callout variant="error|success|warning|info">` component so future banners are one line.

2. **Component: `Chip`** — extract the tonal chip pattern (`rounded-[6px] bg-{color}/12 text-{color}`) into a reusable `<Chip>` component to prevent `rounded-full` from creeping back.

3. **Token: dark mode** — add `@media (prefers-color-scheme: dark)` overrides for surface tokens and `--border-subtle`.

4. **Lint rule** — add a custom ESLint rule or `grep` CI step that fails if `border-border` appears in a non-input context.

5. **Design review bot** — add a GitHub Actions step that greps for deprecated patterns on every PR and posts a comment if any are found.
