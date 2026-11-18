# Gate 2 design critique — vendor-refund, checkpoint 3

Scope: the Delivers line (form at `/vendor-refunds/new`, draft, read view body with View journal entry only; wide and phone). 36 built shots read, each against its reference shot, the spec and the lessons.

Result: 0 INVALID, 1 BLOCKING, 6 NOTE.

## State check

| Shot | Files | State shown | Verdict |
|---|---|---|---|
| populated | 390/1280, light/dark | Vendor chosen, one credit listed and ticked, refund 275.00, totals | valid |
| empty | 390/1280, light/dark | No vendor, prompt "Choose a vendor to see their unapplied credits.", focus on Vendor | valid |
| no-credit | 390/1280, light/dark | Vendor with no credit, message + "New vendor credit", no totals, no Clear refunds | valid |
| not-placed | 390/1280, light/dark | Amount 300.00, rows 275.00, "Not placed $25.00" + refusal line | valid |
| errors | 390/1280, light/dark | After Post: sum refusal "The refunds add up to $275.00, more than the $100.00 refunded", Not placed -$175.00 | valid, but partial (see NOTE 2) |
| draft | 390/1280, light/dark | Saved draft: title "Draft vendor refund", memo filled, More in the wide bar | valid |
| loading | 390/1280 light | Three skeleton rows in the list area | valid |
| list-error | 390/1280 light | Error banner "Books could not load the vendor credits." + Retry | valid |
| error | 390/1280 light | "Books could not load this vendor refund." + Retry | valid |
| not-found | 390/1280 light | "This vendor refund does not exist" + back link | valid |
| no-access | 390/1280 light | "You need bookkeeper access to record vendor refunds" | valid |
| read-reader | 390/1280 light | Posted refund 1001, reader, bar with View journal entry only | valid |

Capture remark (not a finding): the sidebar "+ New" button is hidden in populated-1280-light but shown in populated-1280-dark and in most other wide shots. This is a capture difference (`hideLabels`), not a build difference.

## Findings

### populated-390-light, populated-390-dark, populated-1280-light, populated-1280-dark
- populated-390-*: credit card, label-value row — Credit date, Credit total and Unapplied credit are three columns on one line (the reference puts Credit date on its own line and the two amounts on the next). The seeded credit has small amounts, so no shot shows a large amount (the reference's $12,345,678.90) in a column of about 92 px. Possible wrap or cut; not proved by a shot — NOTE
- populated-1280-*: band row 2 — the Reference no. input is taller and has a larger placeholder than the Payment method select beside it (also in the reference; a core `TextInput` / `SelectInput` difference) — NOTE

### empty-390-light, empty-390-dark, empty-1280-light, empty-1280-dark
nothing found

### no-credit-390-light, no-credit-390-dark, no-credit-1280-light, no-credit-1280-dark
- no-credit-*: list area — the message "Harbor Freight Logistics has no unapplied vendor credit. …" is in the muted tone; the reference draws it in the foreground tone. It reads as a hint, not as the reason the form cannot post. Legible in both schemes — NOTE

### not-placed-390-light, not-placed-390-dark, not-placed-1280-light, not-placed-1280-dark
nothing found

### errors-390-light, errors-390-dark, errors-1280-light, errors-1280-dark
- errors-*: credit rows — the shots show only the sum refusal under the list. No shot shows a refusal under a Refund cell ("More than the unapplied credit of $…", "Vendor credit … is dated after the refund date.") with the cell's danger border, which the reference shows at both widths. The cell refusal's appearance is not evidenced; add the steps to the capture — NOTE

### draft-390-light, draft-390-dark, draft-1280-light, draft-1280-dark
nothing found

### loading-390-light, loading-1280-light
nothing found

### list-error-390-light, list-error-1280-light
nothing found

### error-390-light, error-1280-light
nothing found

### not-found-390-light, not-found-1280-light
nothing found

### no-access-390-light, no-access-1280-light
- no-access-390-light: message — the text wraps to two lines and is left-aligned, while the one-line state texts (error, not-found) are centered (also in the reference) — NOTE

### read-reader-390-light, read-reader-1280-light
- read-reader-1280-light: "Vendor credits refunded" grid, Vendor credit column — the vendor's credit no. is missing under the link. The phone card of the same record shows "Vendor credit 1004 · No. CFF-RC-3310", so the wide grid drops a detail the phone layout keeps — BLOCKING (reference decision: `read-reader-1280-light.png` shows "No. CFF-RC-3310" muted under the "Vendor credit" link in the grid row; the form grid follows the same rule, spec §3.4 "the vendor's credit no. "No. CM-8841" muted under it")
- read-reader-390-light, read-reader-1280-light: band — the Vendor link sits about 12 px lower than the Refund date and Payment values beside it, and the band has empty space under the values at 1280 (also in the reference; the shared read view's link has a taller press area) — NOTE

## For gate 3
Nothing visible.
