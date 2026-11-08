# Gate 2 critique, round 2 — for-review checkpoint 1 (Review tabs and transaction lists)

Shots re-captured after fix round 1. Delivers judged: the tab bar with the For review count, the Files tab body, the three lists (wide table, phone cards, newest first) with loading / error / empty states, "N to review" on every card, the one-row strip with compact phone cards, the page as a fixed column. Not judged (later checkpoints): toolbar, date toggle, check boxes, select-all bar, selection bar, drawer, focus stripe.

40 built shots read; the 20 light references read (the dark references of round 1 share the light layout; review-390-dark and review-1280-dark references re-read to confirm).

## Round 1 findings, re-checked

- Finding 1 (strip stretched to the free height) — fixed in every shot. At 1280 the cards take their content height (1000 card y 85–295); at 390 the compact cards are ≈88 px (y 75–163), as the reference. The panel starts at y 375 (1280) / 182 (390) and reaches the bottom of the column.
- Finding 1c (paged Reviewed list drew no row) — fixed: reviewed-1280 draws the four faked rows under the header; reviewed-390 draws six cards.
- Finding 2 (body overflowed the panel; content bottom-biased) — fixed. Empty, error and loading content is centered in the body and inside the panel (empty-waiting-1280: sentence y 608, button 631–675, panel bottom 775; error-390: sentence 498–522, Retry 546–590, panel bottom 775). Lists start under the tab bar and are clipped by the panel bottom only (review-1280: last visible row cut at y 775, a scroller edge).
- Finding 3 (error sentence left-aligned at 390) — fixed: centered in error-390 light and dark.

## State check

| shot | 1280 light / dark | 390 light / dark |
|---|---|---|
| review | valid: 1000 chosen, "For review (8)" chosen, header Date · Description · Spent · Received, four rows (CHECK 1050 with "Hartwell Insurance, policy BOP-22871 · Check 1050", DEPOSIT CEDAR & PINE LLC, AMAZON MARKETPLACE, GUSTO PAYROLL), newest first | valid: six cards, "CHECK 1050 / Oct 27, 2026 · Check 1050 / -$362.40" first |
| reviewed | valid (faked rows): Reviewed chosen, four rows Sep 1 → Aug 30 | valid: six cards |
| reviewed-empty | valid: "No reviewed transactions yet…" centered | valid |
| excluded | valid: Excluded chosen, four seeded rows NETFLIX.COM → TRADER JOES 118 | valid: four cards, blank below |
| excluded-empty | valid: 2100 chosen, "No excluded transactions…" | valid: strip auto-scrolled to the 2100 card |
| empty-waiting | valid: 2100, "Nothing to review. 1 file is waiting to import." + Go to files | valid |
| empty-none | valid: 2100 with faked no files, "Nothing to review. Upload a statement…" + Go to files | valid |
| files | valid: Files chosen, whole upload area (icon, sentence, Choose file, hint) | valid: upload area and the first file card "checking-2026-10.ofx · OFX · 2 KB · Imported: 12 transactions" |
| loading | valid: Excluded chosen, core spinner centered | valid |
| error | valid: "Books could not load these transactions." + Retry | valid |

No shot is INVALID.

## Findings

- review-1280, reviewed-1280, excluded-1280, files-1280, loading-1280, error-1280 (light, dark): account strip — the two full cards end at different heights (1000 card y 85–295, 2100 card y 85–357, its statement block adds two lines), so the row's bottom edge is ragged and the panel's top gap is set by the taller card. The reference row has equal cards only because its three cards carry the same lines. No spec text or reference decision requires equal heights; a `stretch` cross-axis on the strip row with the card content top-aligned would even them without re-introducing round 1's stretch to the free height. — NOTE
- error-1280, error-390 (light, dark): error body — "Books could not load these transactions." is drawn semibold in `text-foreground`; the reference draws it at regular weight, and the sibling empty-state sentences of the same body are regular `text-muted-foreground`. The error reads heavier than anything else in the panel including the account heading's subtitle. No rule names the weight. — NOTE
- review-1280, reviewed-1280, excluded-1280, files-1280 (light, dark) and review-390, reviewed-390, excluded-390 (light, dark): tab body — ≈24–28 px of blank between the tab bar's rule (y 485 at 1280, 290 at 390) and the first content (header row top ≈510; first phone card ≈318; upload area 512). The reference places its first content ≈16 px under the rule. Checkpoint 2's toolbar will sit in this band; when it lands, check that the bar-to-toolbar gap is the reference's 16, not this body padding plus the toolbar's own margin. — NOTE
- files-1280 (light, dark): Files tab — only the upload area is in view (y 512–733); the file list header and the `checking-2026-10.ofx` / `checking-2026-09.csv` rows are below the panel bottom (775) and reachable only by scrolling the tab body. The reference shows the list header and the first row under the upload area. The difference is 62 px of strip height from the 2100 statement card plus the body padding above, not a structural change: the list is present (files-390 shows it). Spec §2 lets the Files tab "scroll its own content". — NOTE

Nothing found on: reviewed-empty-*, excluded-empty-*, empty-waiting-*, empty-none-*, loading-* (all four variants each).

## Clean parts (checked, nothing found)

- Tab bar: core `SetupTabs`, "For review (8)" / "Reviewed" / "Excluded" / "Files", chosen tab underlined in primary; the 390 bar scrolls (files-390 shows "review (8)" cut on the left with "Files" chosen, as the reference).
- Wide table: columns Date (fixed), Description (flex), Spent and Received right-aligned with right-aligned headers; dates "Oct 27, 2026"; amounts unsigned in their column, other column empty ($1,250.00 and $86.47 in Received, $362.40 / $34.55 / $12,843.10 / $15.49 / $200.00 / $67.31 in Spent); second line muted, "memo · Check 1050" joined, hidden when blank; row height even; dividers full width.
- Phone cards: description one line, "Oct 27, 2026 · Check 1050" muted second line, signed amount right (-$362.40, $1,250.00, -$15.49); the FAB over the sixth card's amount is in the reference too.
- Account cards: "8 to review" foreground, "Nothing to review" muted, under the files-waiting line; compact phone cards carry label `text-sm font-semibold`, balance `text-base font-semibold`, count `text-xs`; the chosen card's primary ring reads in light and dark; the phone strip auto-scrolls to the chosen card (excluded-empty-390, empty-waiting-390, empty-none-390).
- Empty / error / loading texts match the Texts list exactly; "Go to files" and "Retry" are core outline Buttons (lesson 14), centered under the sentence with an even gap.
- Dark mode: tabs, muted lines, card borders, dividers, the chosen ring and the spinner all legible; no raw-colour artefacts.
- empty-none-1280 shows "No files waiting" on the 1000 card because the capture faked `books_bank_files` empty for every account; a capture artefact, not a finding.

## For gate 3

Nothing behavioural is visible in these shots.
