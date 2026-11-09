# Gate 2 critique — journal-report checkpoint 3, `more` re-capture

Re-capture after the fix that moved the seeded long section ("Daily sweep") from Sep 15–16 of the current year to Sep 15–16, 2020. Only the four `more` shots are judged here; the `empty` shots and the earlier findings on them stand as written in `critique.md`.

Delivers judged: the Journal over a long period pages as it scrolls (the "Loading more rows…" seam at the end of the first page). Help and live re-run are not visible in a screenshot.

Reference note (not a finding, carried from `critique.md`): the reference shots were taken on the scratch route inside the Books package and show the Books secondary sidebar at 1280 and the unscrolled top of the document. The shipping route is core's `/a/reports/<id>` (spec §2: "Books adds no screen and no route"), which has no package sidebar; the built shots are scrolled to the page seam, so the document header is above the fold. Neither is a lost decision.

## State check

- more-1280-light: VALID — chip "Period: Sep 15 – Sep 16, 2020"; document header "September 15 – September 16, 2020"; list scrolled into the second block ("JE-20 · Journal entry" pinned); "Daily sweep" lines of Sep 16, 2020; "Loading more rows…" footer with spinner. The fix shows: every date is 2020.
- more-1280-dark: VALID — same state, dark.
- more-390-light: VALID — same state at phone width; sticky three-line column header and pinned block heading; lines wrap onto three lines (date · account / description / debit); "Loading more rows…" above the tab bar.
- more-390-dark: VALID — same state, dark.

## Findings

- more-1280-light: pinned block heading "JE-20 · Journal entry" — the row scrolling under it shows through between the heading label and its separator line (the tops of "Sep 16, 2020", "1010 Business Savings", "Daily sweep", "1.00" peek out). The heading's opaque box is shorter than its separator. Same as the previous capture; owner is core's ReportTable sticky group row, not Books. — NOTE
- more-1280-dark: same pinned-heading bleed as light. — NOTE
- more-390-light: nothing found.
- more-390-dark: nothing found.

Checked and clean: toolbar (Collapse all, Customize, Save as…, Copy link) matches the reference; column order and sort glyphs match; Debit and Credit end inside the right edge at both widths; the phone layout places Description on line 2 and Debit on line 3 at the spec's tracks (an empty Name and an empty Credit are data, the sweep lines have neither); the empty Name column at 1280 is data for the same reason; the "Loading more rows…" footer is the reference's spinner-and-text arrangement at both widths; dark-mode contrast is legible throughout.

## For gate 3

Nothing visible in these four shots.
