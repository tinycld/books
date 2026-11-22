# Gate 2 critique, fix round 1: reconcile, checkpoint 2

Scope: the sidebar entry, the accounts screen with its start dialog, and the work screen's frame (header with back link and title, the summary band, the loading, error and not-found states). The toolbar, list, hint line and header actions of the `work`, `balanced` and `card` references are not built yet and are not judged.

Shots read: every built shot at 1280 and 390, light and dark (`band-open` at 390 only), and every matching reference shot.

Result: 0 INVALID, 0 BLOCKING, 4 NOTE.

## Changes from the previous critique

- Fixed: the required text under Ending balance now has its final period ("Enter the statement ending balance.").
- Now covered: `start-errors` shows "The date cannot be after today." under Ending date. `card` shows the band's statement-total figures ("of $580.00 on the statement", "$580.00 under" in the danger color; the same for the $120.00 side).

## State check

| Shot | Widths and schemes | State shown | Result |
|---|---|---|---|
| accounts | 1280, 390, light, dark | Table (1280) and cards (390) of three seeded accounts, 1010 with Resume and the "In progress" line | VALID |
| accounts-empty | 1280, 390, light, dark | Empty text and "Open Chart of Accounts" | VALID |
| accounts-reader | 1280, 390, light, dark | No Reconcile button, View on the row in progress, no New button | VALID |
| start | 1280, 390, light, dark | Dialog of 2100 Company Card, 3,410.17 and 2026-10-28 from the OFX file, the "From card-2026-10.ofx" note, Charges / Payments | VALID |
| start-first | 1280, 390, light, dark | Dialog of 1000 Business Checking, empty balance, today's date, no OFX note, Payments / Deposits | VALID |
| start-errors | 1280, 390, light, dark | Required error on Ending balance, "The date cannot be after today.", "Enter both totals, or neither." | VALID |
| start-sending | 1280, 390, light, dark | "Starting…", Cancel dimmed | VALID |
| work | 1280, 390, light, dark | Header and band of 1010 Business Savings, $15.00 Not balanced | VALID |
| band-open | 390, light, dark | Compact bar open with the full band | VALID |
| balanced | 1280, 390, light, dark | $0.00 with the check mark and "Balanced" | VALID |
| card | 1280, 390, light, dark | Card words ("+ 0 charges", "− 0 payments"), $864.20 Not balanced, statement totals in the band at 1280 | VALID |
| loading | 1280, 390, light, dark | Back link and spinner | VALID |
| error | 1280, 390, light, dark | Back link, error text, Retry | VALID |
| not-found | 1280, 390, light, dark | Back link and "This reconciliation does not exist." | VALID |

## Findings

- accounts (all four): nothing found. No sideways scroll at either width.
- accounts-empty (all four): nothing found.
- accounts-reader (all four): nothing found.
- start, start-first, start-errors, start-sending at 1280 (light and dark): dialog title row, right end — the close X of the reference is not there at 1280. The sheet at 390 has it. Cancel is available. Still holds from the previous critique — NOTE.
- start (all four): no other finding. The OFX note, the card words and the focus on Ending balance are correct.
- start-first (all four): nothing found.
- start-errors-1280-light, start-errors-1280-dark: under Ending balance and Ending date — the two error lines are side by side but not on one line: the balance error is about 3 px lower, because the money field is about 2 px higher than the date field — NOTE.
- start-errors-390-light: above the footer, right side — the hover tooltip "Start reconciling ⌘↵" shows on the sheet, directly below the Deposits error. It hides no text. The dark shot does not have it. Capture artifact (the pointer stayed on the button; lesson 43). Still holds from the previous critique — NOTE.
- start-errors (all four): "Enter both totals, or neither." is under the empty field with the red border (Deposits). The reference put it under Payments. The built position is the clearer one. Not a finding.
- start-sending (all four): no appearance finding other than the X above. See "For gate 3".
- work (all four): header and band — nothing found.
- band-open (both): nothing found.
- balanced (all four): band — nothing found.
- card-1280-light, card-1280-dark: band — nothing found. The second line wraps to two rows with each sign on its figure (settled deviation 7, the same as the `work` reference). "of $580.00 on the statement" is muted and "$580.00 under" is in the danger color, legible in light and dark.
- card-390-light, card-390-dark: compact bar — nothing found.
- loading (all four): nothing found.
- error (all four): nothing found.
- not-found (all four): nothing found.
- Coverage — NOTE: these delivered parts are in no built shot, so their appearance is not checked here:
  - the beginning-balance line "From the statement of Sep 30, 2026" and the date error "The date must be after …, the last reconciled statement." (two-line wrap in the reference); the capture notes give the cause;
  - the statement-total figures in the open band at 390 (`band-open` is the seeded reconciliation, which has no statement totals), and the "over" wording.

## For gate 3

- start-sending (all four): while the dialog shows "Starting…" and the request is held, the row of 1000 Business Checking behind the dialog already shows "In progress · statement of Nov 21, 2026" and Resume. Check that a refusal puts the row back.
- start-sending-390 (both): the sheet shows its close X while the start is sent. Check that the X does not close the sheet during the send ("While `isStarting` the dialog cannot close").
- start-sending-1280 (both): the reference and the build show an empty space left of "Starting…" where the spinner is; check that `ButtonSpinner` draws (it can be a frame of the animation).
