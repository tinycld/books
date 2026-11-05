# Checkpoint 6 — design critique (gate 2, critic on Fable)

Shots: posted, void-dialog, void, edit-posted, cannot-edit, refusal, refusal-line, draft × 390/1280 × light/dark (32), against docs/plans/transfer-reference/.

## State check
- posted: VALID. "Transfer TR-1", Posted badge, $1,500.00, band From → To, Date, Memo, "Posted by …", "View journal entry"; wide bar Void + Edit, phone bar More + Edit.
- void-dialog: VALID. "Void TR-1?" dialog (wide: centered dialog; phone: bottom sheet with close X), body "A reversing entry is posted in the original period. The number is kept.", Cancel + red "Void entry", over the posted view.
- void: VALID. "Transfer TR-2", red Void badge, $75.00, "Posted by …" and "Voided by …" lines, no action bar at either width.
- edit-posted: VALID. Title "Edit TR-1", Draft badge, replace note "Posting this replaces TR-1 under the same number. The original is voided. Until you post, TR-1 stays as it is.", form prefilled, full action bar.
- cannot-edit: VALID. Back link "Journal entries" + "This transfer cannot be edited".
- refusal: VALID. Red summary box above the band with the close-date message (with its final period), "New transfer" title, form kept.
- refusal-line: VALID. Red text under the To field's Balance line; no summary box.
- draft: VALID. "Draft transfer", Draft badge, $1,250.00; wide bar Cancel, Save draft, Post & new, Post, More (More after Post, per decision 4); phone bar Cancel, Save draft, Post, More.

## Findings
- posted: nothing found.
- void-dialog: nothing found. (The reference 1280 shot shows the dialog faded; the build is fully opaque, which is correct.)
- void: nothing found.
- edit-posted: nothing found. The 390 "More" button is teal-tinted: the pointer hover left where Edit was clicked (capture artifact).
- cannot-edit: nothing found.
- refusal: nothing found.
- refusal-line: To field, text under "Balance $24,121.00" — the refusal reads "account Business Checking is inactive." with a lowercase first letter, because the form strips "Line 2: " and shows the server remainder verbatim. No spec text sets capitalization (spec: "They render under that field as the root error … in text-danger") — NOTE.
- draft: nothing found. (390 "Save draft" teal-tinted: hover artifact, the last button clicked.)

Accepted differences, not counted: currency form after blur; seed names, balances, dates and user vs. the fixture.

## For gate 3
- None visible.

## Loop notes
- First capture: void-dialog-1280 was washed out (the dialog opened at 390 as a Sheet and mounted again as a Dialog, mid fade-in, after the resize). Fixed at the source in the git-excluded capture spec (`settleMs` before `opaque`) and re-captured; the critic above reviewed the re-captured set.
- refusal and refusal-line fake the server's answer to the first `books_journal_entries` write (`writes.message`); e2e test 1 drives the real "Line 2: account <name> is inactive." refusal.

## Second pass (fresh critic on Fable): edit-draft, replace-error
Added in the gate 3 fix round (reviewer A NOTE 7 / B finding 9: no test opens a saved correction draft; the TransferReplaceForm error branch had no screen-level evidence).
- edit-draft (4): VALID — saved correction draft at books/transfers/<id>: "Edit TR-1", Draft badge, replace note, band, Memo; wide bar ends with More after Post. Nothing found. (390-light Save draft hover tint: capture artifact.)
- replace-error (4): VALID — "Books could not load this transfer." with Retry only (decision 5), from `/a/books/transfers/new?replaces=doesnotexist000` with books_journal_lines answered 400; the files match the reference `error-*` pixel for pixel (same components, deterministic render). Nothing found. Caveat: the shot hides core's "Reconnecting…" label (the capture's fake cuts realtime), outside this checkpoint.
- For gate 3: none visible.
