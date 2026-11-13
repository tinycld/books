# Gate 2 design critique: estimate-form, checkpoint 2, after fix round 1

Critic: fresh. Read: all 46 built shots (23 names, light and dark), the matching reference shots (light), the brief, the spec, the lessons, memories-design, the capture notes.

Result: 0 INVALID, 0 BLOCKING, 8 NOTE.

## State check

Every built shot shows the state its name says.

| Shot | State shown | Valid |
|---|---|---|
| new-1280, new-390 | "New estimate", Pending, empty form, Customer has focus | yes |
| filled-1280, filled-phone-390 | saved Pending estimate, 4 item lines and a Subtotal line (no Percent / Description line: capture limit in the notes) | yes |
| accepted-1280, accepted-phone-390 | saved Accepted estimate, Accepted by and Accepted date shown | yes |
| expired-1280, expired-phone-390 | Pending + Expired badges, hint "Expired on Oct 31, 2026" | yes |
| rejected-1280 | Rejected badge, no acceptance fields | yes |
| errors-1280, errors-phone-390 | two inline errors (Expiration date, Accepted date); no form summary (capture limit in the notes) | yes |
| pdf-1280, pdf-390 | unsaved PDF tab, "Save the estimate to see its PDF" + Save | yes |
| reader-1280, reader-phone-390 | read view of an Accepted estimate, Download PDF only | yes |
| loading-1280, loading-390 | spinner | yes |
| error-1280, error-390 | "Books could not load this estimate." + Retry | yes |
| not-found-1280, not-found-390 | "This estimate does not exist" | yes |
| no-access-1280, no-access-390 | "You need bookkeeper access to create estimates" | yes |

## Checks against the brief that pass

- Phone bar: Cancel · Save & close · More on one row in every 390 form shot (new, filled-phone, accepted-phone, expired-phone, errors-phone, pdf). The reference flaw (More on a second row) is gone.
- Wide bar: Cancel · Save · Save & close (primary) · Save & new · More. No Delete / Convert (checkpoint 3).
- Band: row 1 Customer, Bill to, Email, Estimate date, Expiration date, Tax; row 2 Status, Accepted by, Accepted date below a divider. Tax has a width that fits its content (lesson 26). The Expired hint and both inline errors draw below their inputs and the row inputs stay in line (lesson 27).
- Title: "New estimate" / "Estimate <n>" with the status badge, then the Expired badge; "TOTAL" is the largest figure. Badge tones: Pending info, Accepted success, Rejected destructive, Expired warning. All legible in light and dark.
- Totals: Subtotal, one Tax row that names the rate, Total. No Balance due.
- Read view: Estimate date, Expiration date, Status badge, Accepted by, Accepted date, Tax; no stamps, no journal entry link. At 390 the long "Accepted by" value wraps to two lines (no clip).
- State texts are the brief's exact messages.

## Findings

No BLOCKING finding.

- errors-1280, errors-phone-390: top of form — the shot shows no form summary; the reference shows the summary banner and the inline errors together. The notes give the cause (the root refusal clears on the next submit). The look of `estimate-error-summary` is thus not shown in any built shot of this checkpoint — NOTE (evidence gap, not a defect that is visible).
- new-1280, new-390 (light and dark): band, below Customer — "Bill to" shows only the "Edit address" link and "Email" shows a label with no value. The reference hides both until a customer is set. The spec says "Row 1, as the invoice's", so this is the shared layer — NOTE.
- All form shots at 1280 and 390: band — about 45 px of empty space below the date row before the divider, and about 40 px below the Status row before the band's edge. The reference is tighter. The band looks loose — NOTE.
- filled-1280, errors-1280: lines, Product column — a long product name is cut with an ellipsis ("Bookkeeping catch-up (per m…", "On-site network troubleshooti…"); the reference wraps the name. The spec says "The invoice's line table unchanged" — NOTE.
- filled-1280, filled-phone-390: line 5 Description — the text area cuts its last line in half ("Portland metro area is included…"). The reference has the same cut — NOTE.
- accepted-1280, accepted-phone-390: Accepted by — the input text is larger than the values of Status and Accepted date beside it, and the long value is cut at the right edge of the input. The reference has the same — NOTE.
- reader-1280: lines against totals — the Amount column ends about 13 px to the right of the totals values. The reference has the same (shared read view) — NOTE.
- not-found, no-access (both widths): body — one line of text with no action other than the back link. Same as the reference and the document layer's states — NOTE.

Per shot, with no finding other than the notes above: expired-1280, expired-phone-390, rejected-1280, pdf-1280, pdf-390, reader-phone-390, loading-1280, loading-390, error-1280, error-390 — nothing found.

## For gate 3

Nothing visible.
