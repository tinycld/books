# Checkpoint 5 design critique

Scope: Delivers line and gate-2 text of "Checkpoint 5 — Row menu, delete, batch inactive". Import screens and help are out of scope. Settled decisions (deferred `empty` shot, Account type control, 1280 truncation with the drawer open, Name-first column priority) are not re-opened.

## State check

| Shot | 1280 light | 1280 dark | 390 light | 390 dark |
|---|---|---|---|---|
| populated | VALID (Business Checking checked) | VALID | VALID | VALID |
| menu-open | VALID (row menu for Business Checking) | VALID | VALID (sheet) | VALID (sheet) |
| batch-actions | VALID (two rows checked, menu open) | VALID | VALID (sheet) | VALID (sheet) |
| delete-blocked | VALID (journal-line block, Make inactive offered) | VALID | VALID (bottom sheet) | VALID |
| error-banner | VALID (server refusal shown) | VALID | VALID | VALID |
| delete-free | VALID (Temp Expense, Delete offered) | VALID | VALID | VALID |
| all-hidden | VALID (stand-in for `empty`) | VALID | VALID | VALID |

All 28 shots show the state they are named for.

## Findings

### BLOCKING

1. `menu-open`, `delete-blocked`, `delete-free`, `error-banner`, `all-hidden` (1280 and 390, light and dark): toolbar — the Batch actions trigger is not disabled when no row is selected. Its label is full foreground (15, 23, 42), the same as the enabled Collapse all; the disabled Collapse all in `all-hidden` dims to (158, 161, 169). The phone icon button beside Filters has the same enabled look. In `BatchActions.tsx` only the inner `Menu.Item` gets `isDisabled`; the trigger `Button` has no disabled state. — BLOCKING (spec: `"Batch actions" has one action, "Make inactive". It is disabled when no row is selected.`; reference `no-match-390` and `panel-open-1280` show the Batch actions button dimmed when nothing is selected).

2. `populated-390`, and every 390 list shot (light and dark): card — the new leading gutter (44px checkbox plus the caret column) and the 44px trailing menu move the name start from x=44 to x=88 and the balance right edge from 374 to 330. Four of nine names truncate at normal length ("Business Check...", "Accounts Receiv...", "Consulting Inco...", "Software Subscriptio...") and the type · detail line truncates too. The reference `populated-390` and the cp3 `populated-390` show names of this length in full. — BLOCKING (spec: `Phone: each account is a card (name and number, balance, type and detail type below)`; reference `populated-390` decided the name reads in full on a phone card). Options: let the caret share the checkbox gutter for leaf rows, or move the balance under the name so the name row has the full width.

3. `error-banner` (1280 and 390, light and dark): banner — no danger tint and a pure black (light) / pure white (dark) 1px border. `AccountsErrorBanner.tsx` uses `bg-danger-soft` and `border-danger-soft-foreground`, but `global.css` defines only `--danger` and `--danger-foreground`; the `*-soft` names exist in `use-app-theme.ts` only. The utilities emit nothing, so the background is the page color and the border falls back to the default (currentColor). The banner reads as a plain box with red text, not an error surface. — BLOCKING (rule, CLAUDE.md: `Light + dark mode: no raw hex. Use semantic Tailwind tokens` — the tokens named do not resolve, so the border is a raw black/white).

### NOTE

4. `menu-open-390`, `batch-actions-390`: sheet — the sheet hangs from the top with the drag handle at the bottom. This is the core Menu pattern ("a Sheet, hanging from the edge nearest the trigger"; `Sheet` draws the handle on the free edge), so it is coherent on its own. Two costs on this screen: the row sheet covers the row it acts on (the title "Business Checking" compensates), and the Delete step then arrives as a bottom sheet (`delete-blocked-390`, `delete-free-390`), so the flow jumps top to bottom. `sheetSide="bottom"` on the row menu would keep the row visible and the flow on one edge. — NOTE

5. `delete-blocked` (all four): dialog body — the account name sits as an unlabelled line after the explanation; in `delete-free` it sits directly under the title. Put the name under the title in both cases. The muted line "It cannot be deleted. Make it inactive to hide it from lists." repeats the title "This account can't be deleted". — NOTE

6. `delete-free-1280-dark`, `delete-free-390-dark`: footer — the destructive Delete button renders a muted maroon in dark mode against the bright red in light; it reads close to a disabled state. The label is "Delete" (not "Checking..."), so this is the core destructive token in dark, not the pending state. Core token; flag for core. — NOTE

7. `error-banner` (all four): text — "Make the 1 active sub-accounts inactive first." is the server message shown as received (spec), but the count and the plural do not agree. Server-side wording. — NOTE

8. `batch-actions` (all four): menu — neither the popover nor the sheet says how many rows the action applies to ("2 selected"); the phone icon trigger has no count. The user has to scroll back to count the checks. — NOTE

9. `populated-1280`, `populated-390`: selected row — no row tint; the checkbox is the only indicator. This matches the reference `populated-1280` (checked row untinted). Acceptable. — NOTE

10. `populated-1280`: menu cell — vertical kebab (⋮) where the reference draws a horizontal ellipsis (···). Cosmetic; alignment with the Balance column and the 44px target are fine. — NOTE

11. `error-banner-1280`: banner — one line of text in a 66px box; the text is top-aligned beside the 44px dismiss button, so the lower half is empty. Center the text or shrink the dismiss hit area padding. — NOTE

## Checked and found nothing

- Checkbox column: 20px box in a 44px target, aligned with the Name header at 1280 and the card edge at 390.
- Menu cell: 44px target, centered under the kebab, inside the table edge at 1280 and 38px from the edge at 390.
- Row menu popover (1280): anchored bottom-end of the trigger, Delete in red, dark surface separates from the page.
- Delete dialogs: blocked offers Cancel + Make inactive, free offers Cancel + Delete (red); at 390 both footers sit above the tab bar.
- Dark legibility: menus, dialogs, chips and balances read well; see 3 and 6 for the exceptions.
- `all-hidden`: "No accounts match" with a Show inactive action, Collapse all disabled, same placement as the approved cp3 `no-match`.
