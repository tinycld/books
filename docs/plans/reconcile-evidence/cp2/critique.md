# Gate 2 critique: reconcile, checkpoint 2

Scope: the sidebar entry, the accounts screen with its start dialog, and the work screen's frame (header with back link and title, the summary band, the loading, error and not-found states). The toolbar, list, hint line and header actions of the `work`, `balanced` and `card` references are not built yet and are not judged.

Shots read: every built shot at 1280 and 390, light and dark (`band-open` at 390 only), and every matching reference shot.

Result: 0 INVALID, 0 BLOCKING, 4 NOTE.

## State check

| Shot | Widths and schemes | State shown | Result |
|---|---|---|---|
| accounts | 1280, 390, light, dark | Table (1280) and cards (390) of three seeded accounts, one with Resume | VALID |
| accounts-empty | 1280, 390, light, dark | Empty text and "Open Chart of Accounts" | VALID |
| accounts-reader | 1280, 390, light, dark | No Reconcile button, View on the row in progress, no New button in the sidebar | VALID |
| start | 1280, 390, light, dark | Dialog of 2100 Company Card, filled from the OFX file, with the "From card-2026-10.ofx" note. The beginning-balance line is the "has not been reconciled" text, as the capture notes say | VALID |
| start-first | 1280, 390, light, dark | Dialog of 1000 Business Checking, empty balance, today's date, no OFX note | VALID |
| start-errors | 1280, 390, light, dark | Required error on Ending balance and "Enter both totals, or neither." The date error is not shown (the account has no last statement) | VALID |
| start-sending | 1280, 390, light, dark | "Starting…" with a spinner, Cancel dimmed | VALID |
| work | 1280, 390, light, dark | Header and band of 1010 Business Savings, $15.00 Not balanced | VALID |
| band-open | 390, light, dark | Compact bar open with the full band | VALID |
| balanced | 1280, 390, light, dark | $0.00 with the check mark and "Balanced" | VALID |
| card | 1280, 390, light, dark | Card words: "+ 0 charges − 0 payments" | VALID |
| loading | 1280, 390, light, dark | Back link and spinner | VALID |
| error | 1280, 390, light, dark | Back link, error text, Retry | VALID |
| not-found | 1280, 390, light, dark | Back link and "This reconciliation does not exist." | VALID |

## Findings

- accounts (all four): nothing found. The structure, the columns, the "In progress" line, the link color and the card layout agree with the reference. No sideways scroll at either width.
- accounts-empty (all four): nothing found.
- accounts-reader (all four): nothing found.
- start-1280-light, start-1280-dark, start-first-1280-light, start-first-1280-dark, start-errors-1280-light, start-errors-1280-dark, start-sending-1280-light, start-sending-1280-dark: dialog title row, right end — the close X of the reference is not there at 1280. The built sheet at 390 has it. Cancel is available — NOTE.
- start-errors (all four): under Ending balance — the text "Enter the statement ending balance" has no final period. "Enter both totals, or neither." and the other dialog texts have one — NOTE.
- start-errors-390-light: above the footer, right side — the hover tooltip "Start reconciling ⌘↵" shows on the sheet, near the Deposits error. It hides no text. The dark shot does not have it. This is a capture artifact (the pointer stayed on the button) — NOTE.
- start-errors (all four): the "Enter both totals, or neither." text is under the empty field with the red border (Deposits). The reference put it under Payments. The built position is the clearer one. Not a finding.
- start-first (all four): nothing found.
- start-sending (all four): no appearance finding other than the X above. See "For gate 3".
- work (all four): header and band — nothing found. The operators stay on the line of the values, the rule joins the second line to the cleared balance, and the difference block agrees with the reference in light and dark.
- band-open (both): nothing found.
- balanced (all four): band — nothing found.
- card (all four): band — nothing found.
- loading (all four): nothing found.
- error (all four): nothing found.
- not-found (all four): nothing found.
- Coverage — NOTE: three parts that this checkpoint delivers are in no built shot, so their appearance is not checked here:
  - the band's statement-total figures ("of $580.00 on the statement", "$30.00 over" in `text-danger`), which the `work` reference shows;
  - the beginning-balance line "From the statement of Sep 30, 2026" (the capture notes give the cause);
  - the date error "The date must be after …, the last reconciled statement.", which the `start-errors` reference shows.

## For gate 3

- start-sending (all four): while the dialog shows "Starting…" and the request is held, the row of 1000 Business Checking behind the dialog already shows "In progress · statement of Nov 21, 2026" and Resume. Check that a refusal puts the row back.
- start-sending-390 (both): the sheet shows its close X while the start is sent. Check that the X does not close the sheet during the send ("While `isStarting` the dialog cannot close").
