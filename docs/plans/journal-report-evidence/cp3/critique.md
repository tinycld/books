# Gate 2 critique — journal-report checkpoint 3 (Long periods, live, empty, help)

Delivers judged: paging as the list scrolls (the "Loading more rows…" seam) and core's empty state for a period with no posted line. Help and live re-run are not visible in a screenshot and are not judged here.

Reference note (not a finding): the reference shots were taken on the scratch route inside the Books package, so they show the Books secondary sidebar at 1280. The shipping route is core's `/a/reports/<id>` (spec §2: "Books adds no screen and no route"), which has no package sidebar; the wider content area is a consequence of the real route, not a lost decision.

## State check

- more-1280-light: VALID — Custom period Sep 15 – Sep 16, 2026; list scrolled to the end of the first page; sticky block heading "JE-20 · Journal entry"; "Loading more rows…" footer.
- more-1280-dark: VALID — same state, dark.
- more-390-light: VALID — same state at phone width; sticky column header and block heading; "Loading more rows…" above the tab bar.
- more-390-dark: VALID — same state, dark.
- empty-1280-light: VALID — Custom period Jul 2, 2026; "No rows for July 2, 2026" with "Show this fiscal year".
- empty-1280-dark: VALID — same state, dark.
- empty-390-light: VALID — same empty state at phone width.
- empty-390-dark: VALID — same state, dark.

## Findings

- more-1280-light: sticky block heading "JE-20 · Journal entry" — the row scrolling under the pinned heading shows through its bottom edge (the tops of "Sep 16, 2026", "1010 Business Savings", "Daily sweep", "1.00" peek out between the heading label and its separator line). The heading's opaque box is shorter than its separator, so the row beneath is not fully covered. Owner is core's ReportTable sticky group row, not Books. — NOTE
- more-1280-dark: same sticky-heading bleed as light. — NOTE
- more-390-light: nothing found.
- more-390-dark: nothing found.
- empty-1280-light: nothing found.
- empty-1280-dark: nothing found.
- empty-390-light: title toolbar — shows "Customize" and "Save as…" with no overflow menu, so "Copy link" is unreachable; the dark shot of the same state shows "Customize" and a "⋮" overflow (the reference's arrangement). The light shot lost an action the spec gives every reader. Likely the toolbar's overflow measure had not landed at capture (core's toolbar), but as shot the action is gone. — BLOCKING (spec §3 "Readers change the period, sort and Customize for the run, copy a link, and 'Save as'"; reference `empty-390-*` decided Customize + overflow menu)
- empty-390-light: chip row — a "Sort" chip shows in the empty state, where there are no rows to sort; the reference `empty-390-*` has no Sort chip. Core's phone toolbar adds it; an empty run has nothing for it to act on. — NOTE
- empty-390-dark: chip row — same "Sort" chip in the empty state. — NOTE

## For gate 3

- empty-390-light: if the missing overflow menu is not a capture-timing artefact, the toolbar drops "Copy link" with no way to reach it at 390 px in light mode while dark mode shows the overflow — the behavior differs by theme, which should not happen. Recapture both and compare before deciding.
