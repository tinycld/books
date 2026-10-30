# Gate 2 critique 2 — checkpoint 8 "Vendor page, form and save" (re-check after the trigger fix)

Scope: the four re-captured shot pairs (`page-1100`, `phone-page-390`, `panel-1600`, `panel-long-1600`, light and dark) against the same-named references, judged on the Delivers line of checkpoint 8. `new-1100` and `not-found-1100` were not re-captured; critique 1 found nothing BLOCKING on them and the fix does not touch them. The read-only reading of `recordTitle` / `recordFooter` from critique 1 stands.

Not findings (known): `bg-danger-soft` / `border-danger-soft-foreground` undefined in core's global.css; the empty row-menu cell beside the panel (checkpoint 10); the panel row highlight (checkpoint 9).

## State check

| Shot | Named state | Shows | Verdict |
|---|---|---|---|
| page-1100-light / -dark | edit page, populated (Office Supply World) | "‹ Vendors", "Edit vendor", every field filled, Net 15, 1234567, 6210 Design Tools, notes, Cancel + Save | valid |
| phone-page-390-light / -dark | edit page at 390, populated | one column, "Edit vendor", filled, Cancel + Save over the tab bar | valid |
| panel-1600-light / -dark | 480 px panel beside the list, populated | panel with ✕, "Edit vendor", filled, Cancel + Save; list filtered to the one row by the capture's search | valid |
| panel-long-1600-light / -dark | panel, long-value vendor (Willamette Valley …) | panel with the long display name, company, email, website, two address lines, Net 60, 6200 Software Subscriptions, three-line notes | valid |

No INVALID shot.

## The BLOCKING finding from critique 1

Fixed. The Default expense account trigger now shows the plain label `6210 Design Tools` at the form's value inset on every surface: page x 390 (same as `Net 15`, `1234567`, `Office Supply World`), phone x 38 (same as `Net 15` and `1234567`), panel x 1152 (same as `Net 15` and `1234567`). Light and dark agree. `panel-long` (depth-1 `6200 Software Subscriptions`) is unchanged and flush, so the inset no longer depends on the chosen account's depth. The menu's own indent is not captured in these shots and is not judged here.

## Findings

### page-1100-light, page-1100-dark

- page-1100: Account number hint — "Your account number with this vendor." sits 6 px closer to its input than in the reference (hint y 956 against 962; Default expense account and Notes shift up by 6). Carried from critique 1. — NOTE (no rule; core `TextInput`'s own `hint` spacing, reads fine).
- Otherwise nothing found.

### phone-page-390-light, phone-page-390-dark

- phone-page-390: Account number hint — the same 6 px tighter hint (y 1462 against 1468). — NOTE (same as page-1100; counted once).
- phone-page-390-dark: the faint ghost of "Cancel" (y ≈ 65) and of two tab-bar icons (y ≈ 120) at the top right is still in the capture. The reference dark shot carries the same ghost, so it is the full-page capture repainting the sticky footer and tab bar, not the build. Not a finding.
- Otherwise nothing found.

### panel-1600-light, panel-1600-dark

- panel-1600: Account number hint — the same 6 px tighter hint (y 1305 against 1311). — NOTE (counted once).
- The list beside the panel shows one row because the capture searches before pressing the row; the reference shows the full list with Show inactive on. A capture-flow difference, not a build difference. The panel header, ✕, form, footer and the open row's `bg-accent` match the reference.
- Otherwise nothing found.

### panel-long-1600-light, panel-long-1600-dark

- panel-long-1600: Account number hint — the same 6 px tighter hint. — NOTE (counted once).
- nothing else found. Display name, Company name, Email, Website and Street clip at the input's right edge with no ellipsis, as in the reference (text inputs scroll); Notes wrap on three lines, as in the reference. The reference shows `6700 Repairs and maintenance` where the build shows the seeded `6200 Software Subscriptions`; the seed names the account, so this is real data, not a finding.

## Totals

- INVALID: 0
- BLOCKING: 0 (the critique 1 trigger finding is fixed)
- NOTE: 1 distinct (the 6 px tighter Account number hint; seen on all four pairs), plus the capture ghost on phone-page-390-dark recorded as not a finding
