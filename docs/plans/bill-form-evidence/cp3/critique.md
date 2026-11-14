# Gate 2 design critique — bill-form, checkpoint 3 (round 2, after fixes)

Read: 38 built shots (all, recaptured), the light reference of each shot, the dark reference of errors-1280 and posted-1280, the brief, the spec, the lessons, memories-design, the capture notes, the first critique.

Verdict: 0 INVALID, 0 BLOCKING, 8 NOTE.

Positions are pixel estimates from the screenshots.

## Previous round

- **B1 — Memo label "Internal memo (not printed)".** FIXED. The form (new, draft, errors, no-lines, errors-390) and the read view (posted-1280, posted-phone-390) show "Memo".
- **B2 — Read view totals not under Amount (wide).** FIXED. posted-1280: line amounts and totals values both end at about x=1191.
- **B3 — Refused field has no error state on its input.** FIXED. errors-1280 and errors-390, light and dark: Vendor's bill no. has the destructive border, and the refusal takes the place of the hint.
- **B4 — Empty mailing address has no text.** FIXED. draft, no-lines, delete-1280, delete-390, phone-more-390: muted "No mailing address" above "Edit address  Edit vendor".

N1–N7 of the first round are in the ledger. They still show; they are listed again below with the same numbers so the ledger entries stay valid.

## Findings (each listed once; the per-shot section says where it shows)

### BLOCKING

None.

### NOTE

- **N1 — Band spacing.** The band has a divider between its two rows and about 38 px of empty space under the hint (or under the refusal). The band is taller than the reference with no added content.
- **N2 — "Edit address" with no vendor.** new: the link shows before a vendor is chosen. The reference shows only the label.
- **N3 — Left edges.** Section headings start at x=340, the tables at 342 (header text at 355), the memo at 344.
- **N4 — Line-count error.** no-lines: the text is smaller than in the reference and is below "Add account line". The reference has it at body size between the rows and the button. The spec text ("shown under the first shown table") is met.
- **N5 — Due date in the read view.** posted, posted-phone: label "Due date", value "Due Nov 28, 2026". The word shows twice. On 1280 the longer value moves Vendor's bill no. to a second row; the reference has the four values in one row.
- **N6 — Clipped bill no. on a phone.** errors-390: "OSW-INV-558213" is cut at the right edge of the half-width input.
- **N7 — Totals rule.** Form, wide: the rule above Total runs to about x=1213, the amounts end at 1201.
- **N8 — Read view footer order on a phone (new).** posted-phone-390: the build has totals, then Memo, then "Posted by". The reference has Memo, "Posted by", then totals. On 1280 "Posted by" is below the whole footer, not directly under the memo. No content is lost.

## Per screenshot

State check first. "(light, dark)" means both schemes were read and are the same.

- **new-1280 (light, dark)** — state: new, valid. Findings: N1 · N2 · N3 · N7. "No rows yet." under the product table: accepted, not a finding.
- **new-390 (light, dark)** — state: new, valid. Band stacks, account line is a card, bar is Cancel / Save draft / Post / More. Findings: N2. "No rows yet.": accepted.
- **draft-1280 (light, dark)** — state: saved draft ("Draft bill", Draft badge, More in the bar), valid. Account table is empty by the capture limit. Findings: N1 · N3 · N7. The "Post ⌘↵" tooltip is a capture artifact.
- **errors-1280 (light, dark)** — state: one real refusal under Vendor's bill no., valid, partial (no root summary, no line refusal: capture limit, those two placements are not judged). Findings: N1 · N3. The "Save draft ⌘S" tooltip is a capture artifact.
- **errors-390 (light, dark)** — state: the same refusal, scrolled view, valid, partial. Findings: N6. Product card: kind label, stacked fields, Amount right-aligned, row menu top right: as the spec.
- **no-lines-1280 (light, dark)** — state: line-count error shows, valid. Findings: N4 · N1.
- **delete-1280 (light, dark)** — state: delete-draft dialog open, text as the spec, valid. Nothing found.
- **delete-390 (light, dark)** — state: delete-draft sheet open, valid. Nothing found.
- **phone-more-390 (light, dark)** — state: More sheet with Post & new and Delete draft and their keys, valid. Nothing found.
- **posted-1280 (light, dark)** — state: read view of a posted bill (Bill 1004, Posted), valid. Only the product table (capture limit; the spec draws only tables that have lines). Findings: N5 · N8. The "View journal entry j" tooltip is a capture artifact.
- **posted-phone-390 (light, dark)** — state: read view on a phone (Bill 1005), cards, More + Edit, valid. Findings: N5 · N8.
- **loading-1280, loading-390 (light, dark)** — state: loading, valid. Nothing found.
- **error-1280, error-390 (light, dark)** — state: load error with Retry, "Books could not load this bill." (the spec's text; the reference mock has other words), valid. Nothing found.
- **not-found-1280, not-found-390 (light, dark)** — state: "This bill does not exist", valid. Nothing found.
- **no-access-1280, no-access-390 (light, dark)** — state: "You need bookkeeper access to create bills", valid. Nothing found.

## Not judged in this checkpoint

- `reader`: no built shot (capture notes; reachable in checkpoint 4).
- Account lines with data (wide grid, phone card, read table) and the "Account lines" subtotal: no built shot has an account line with an amount. The B2 fix was checked on the product table only; check the account read table when it can be captured.
- Root error summary and a line refusal under its row: not in the built errors shot.

## For gate 3

- Wide action bar: the build (and the reference) show Cancel, Save draft, Post, Post & new, and More holding Delete draft on a saved draft. Spec §3.6 says "wide — Cancel, Delete draft (saved drafts), Save draft, Post & new, Post (primary)". The build follows the reference; the texts do not agree.
- errors-1280: after a refused first save the title stays "New bill" with a Draft badge (capture note).
