# Design critique — checkpoint 5 "Sidebar opens core Reports hub"

Delivers: the Books sidebar's Reports entry (desktop sidebar and phone Books menu) opens core's hub filtered to Books, and the Books help explains Books reports on the engine.

Judged against: spec §2 (Books sidebar "Reports" → `/a/reports?package=books`, strip "Showing reports from Books", "Show all reports"; `/a/books/reports` removed), §3 "Books sidebar, Help", and the reference `populated-*.png`. No hub reference exists; the hub is judged on its own.

## State check

| Shot | Shows the named state? |
|---|---|
| hub-1280-light | Yes. Core hub at `/a/reports?package=books`: title "Reports", strip "Showing reports from Books" with "Show all reports", one row "Trial Balance". |
| hub-1280-dark | Yes. Same as above, dark. |
| hub-390-light | Yes. Same hub as a card list, phone tab bar. |
| hub-390-dark | Yes. Same, dark. |
| populated-1280-light | Yes. Trial Balance with 8 account rows and a Total row, As of Oct 31, 2026, Rows: Non-zero. |
| populated-1280-dark | Yes. Same, dark. |
| populated-390-light | Yes. Same report at phone width. |
| populated-390-dark | Yes. Same, dark. |

No INVALID shots.

## Coverage gap (not a screenshot finding)

The Delivers line names the Books sidebar's Reports entry (desktop) and the phone Books menu's Reports entry. No shot shows either entry; the hub shots start at the destination URL (`capture.json` opens `/a/reports?package=books` directly). The help rewrite (`help/reports.md`, `help/navigating-books.md`) has no shot either. Gate 2 cannot confirm these from the evidence; the e2e scenario 1 ("Sidebar to report and back") is the only check of the entry itself.

## Findings

### hub-1280-light
- Left rail — no package icon is active (Books icon has no active bar or background), and no Books sidebar is shown. The reader arrives from Books > Reports and the only Books cue is the strip text. Follows from the spec moving reports to core's hub (§2 "Removed: `/a/books/reports`"), so not a rule break; the strip carries the context alone. — NOTE
- Otherwise nothing found. Strip, table header, row title + description, Source / Owner / Last run columns, overflow menu all align; spacing is consistent.

### hub-1280-dark
- Same rail/context note as light. — NOTE
- Otherwise nothing found. Strip and "Show all reports" button legible on the dark surface.

### hub-390-light
- Card, second line — "Journal lines · admin" renders "admin" in a visibly larger, darker size than "Journal lines" on the same line; the two parts read as two different text styles. Core hub card, so a core fix, but it is on the screen this checkpoint delivers. — NOTE
- Card, description — "Each account's balance on one day, as a debit …" truncates after one line with an ellipsis; the end of the hub description ("or a credit") is lost at phone width. Single-line clamp is a defensible choice, no rule quoted. — NOTE
- Tab bar — no tab is active (Books tab not highlighted) while the reader came from the Books menu. Same spec-driven context loss as desktop. — NOTE
- Otherwise nothing found.

### hub-390-dark
- Same three notes as hub-390-light (size mismatch on "Journal lines · admin", description truncation, no active tab). — NOTE
- Otherwise nothing found. Card border and strip legible in dark.

### populated-1280-light
- Document header — "Test Organization" instead of a business name. Spec §3: "the Books business name (`books_settings.business_name` …; the organization name when it is empty)". The fixture appears to have no business name, so this is the fallback path, not a defect; but the capture does not demonstrate the business-name heading that the reference ("Harbor Lane Design LLC") shows and that e2e scenario 1 asserts. — NOTE
- Left rail / sidebar — reference shows the report inside the Books shell (Books rail active, Books sidebar with Lists / Reports / Accounting). The build shows the report at `/a/reports/<id>` with no Books sidebar and no active rail icon. Spec §2 made this change deliberately, so not BLOCKING; recorded because it is a structural difference from the approved reference that the human should confirm they accept. — NOTE
- Table (Account · No. · Debit · Credit), chips, toolbar, totals — match the reference's structure and hierarchy. Nothing found.

### populated-1280-dark
- Same two notes as light. — NOTE
- Otherwise nothing found. Contrast of header, chips, numerals and the total rule is good.

### populated-390-light
- Same header fallback note. — NOTE
- Reference 390 shows the Books "+" FAB over the report; the build has none because the report no longer renders inside Books. Spec-driven. — NOTE
- Layout matches the reference's phone layout (two-line rows: account name, then No./Debit/Credit; chips scroll horizontally with "Rows: No…" cut at the edge exactly as the reference). Nothing further found.

### populated-390-dark
- Same notes as populated-390-light. — NOTE
- Otherwise nothing found.

## Summary

BLOCKING: none.
NOTE: 1 core hub card text-size mismatch ("Journal lines · admin"), 1 description truncation at 390, the spec-driven loss of Books context (no active rail/tab, no Books sidebar, no FAB) on both hub and report, and a fixture that shows the organization-name fallback instead of a Books business name. Coverage gap: no shot of the Books sidebar / phone-menu Reports entry or the help text.
