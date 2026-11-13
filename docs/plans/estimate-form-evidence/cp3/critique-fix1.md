# estimate-form cp3 — design critique after fix round 1

Scope: the checkpoint 3 Delivers line (Convert, the invoice from an estimate, the closed estimate's "Converted to" line with Open invoice, Delete with confirm and refusal). Built shots: `docs/plans/estimate-form-evidence/cp3/`. Reference: `docs/plans/estimate-form-reference/`. All 20 built shots and their 20 references were read.

Result: 0 INVALID, 0 BLOCKING, 4 NOTE.

## Earlier finding B1 (closed estimate's "Converted to …" line)

Fixed. In `closed-1280-light/dark` the link "Converted to invoice 1005" is on its own row, at the left edge, below "Message to customer (printed)" and "Internal memo (not printed)", as in the reference. `closed-draft-1280-*` ("Converted to a draft invoice") and `closed-phone-390-*` ("Converted to invoice 1006") also draw it on its own row below the memo.

Limit of the evidence: only `closed-1280-*` shows a message. `closed-phone-390-*` and `closed-draft-1280-*` show a memo and no message (see N1).

## Per screenshot

### delete-390-light, delete-390-dark
State check: valid (saved Pending estimate, delete sheet open: "Delete estimate 1006?", "This can't be undone.", Cancel, Delete estimate).
Nothing found.

### delete-1280-light, delete-1280-dark
State check: valid (dialog open on Estimate 1007; the bar shows Cancel · Delete estimate · Convert to invoice · Save · Save & close · Save & new · More).
Nothing found.

### delete-refused-1280-light, delete-refused-1280-dark
State check: valid (dialog shows the refusal "Estimate 1008 has invoice 1004. Set it to Rejected instead." in the destructive tone; the dialog stays open). The estimate is Rejected (the reference shows Pending); this is the real path, and the bar correctly has no Convert to invoice.
Nothing found.

### phone-more-390-light, phone-more-390-dark
State check: valid (More sheet open: Save, Save & new, Convert to invoice, Delete estimate, Download PDF). The Save row is not in the reference; the brief's plan decision adds it ("More holds Save (⌘S), Save & new (⌘⇧↵), Convert to invoice (⌥I, checkpoint 3), Delete estimate (⌘⌫, saved only, checkpoint 3) and Download PDF (⌘P)").
Nothing found.

### closed-1280-light, closed-1280-dark
State check: valid (Closed badge, read view, "Converted to invoice 1005", bar Open invoice (primary) · Copy · Download PDF).
Nothing found.

### closed-phone-390-light, closed-phone-390-dark
State check: valid (Closed, read view, "Converted to invoice 1006", bar More · Open invoice).
- closed-phone-390-light/dark: footer, below the totals — no "Message to customer (printed)" block, only the memo; the task text says the closed shots now set a message, and the reference phone shot shows one above the memo — NOTE (N1).

### closed-draft-1280-light, closed-draft-1280-dark
State check: valid (Closed, "Converted to a draft invoice", Open invoice offered).
- closed-draft-1280-light/dark: footer — no message block (N1, same finding).
- closed-draft-1280-light/dark: footer, left column — the gap between the memo and the "Converted to a draft invoice" link is about 100 px, against about 50 px in `closed-1280-*`; the link's row starts below the taller totals column — NOTE (N2).

### invoice-from-estimate-1280-light, invoice-from-estimate-1280-dark
State check: valid (New invoice, Customer as read-only text, "From estimate 1013" link under it, both lines, the estimate's message, empty memo; back link "Estimate").
- invoice-from-estimate-1280-light/dark: band, Customer label — the required mark (*) stays on a field that is read-only text and cannot be changed — NOTE (N3).

### invoice-from-estimate-phone-390-light, invoice-from-estimate-phone-390-dark
State check: valid (same state at 390; Customer text and "From estimate 1014" link stacked in the band; bar on one row).
- invoice-from-estimate-phone-390-light/dark: band, Customer label — required mark on read-only text (N3, same finding).

### invoice-posted-1280-light, invoice-posted-1280-dark
State check: valid (Posted invoice read view; "From estimate 1015" link under the "Posted by …" stamp).
Nothing found.

## Notes

- N1 — `closed-phone-390-*`, `closed-draft-1280-*`: no message shown. If the capture set a message for these two estimates, the read view dropped it and that is a defect; if the capture did not set one, the fix has evidence with a message only at 1280. The driver must check which one it is.
- N2 — `closed-draft-1280-*`: uneven gap above the converted link when the left column is shorter than the totals.
- N3 — `invoice-from-estimate-*` (4 shots): required mark on the read-only Customer.
- N4 — `delete-*`, `delete-refused-*`, `phone-more-*`, `closed-*`, `closed-draft-*`: the back link reads "Journal entries" on an estimate opened directly (the capture notes ask for a judgment). The reference shows the same label, so no decision is lost. An estimate posts no journal entry, so the label is a poor fit; taste only.

## Not findings (outside this checkpoint's Delivers line)

- Invoice band field order (Terms before Invoice date) and the invoice bar's More button differ from the reference mock; both are the existing invoice form.
- `invoice-posted-*`: "Due Dec 13, 2026" under the label "Due date" repeats the word; existing invoice read view.
- The sidebar "+ New" button is visible in the wide shots (capture `hideLabels` does not match it).

## For gate 3

- N1: confirm whether the estimates of `closed-phone` and `closed-draft` were saved with a message. If yes, the read view does not draw it at 390 and for a draft conversion.
