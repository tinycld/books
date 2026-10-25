# Critique — Checkpoint 6: Settings shell and Company section (round 2)

## State check

All 16 screenshots show the state their name says. No INVALID.

- list-company-1280-*: admin, wide, section list (Company only, as expected at this checkpoint) + Company form. Valid.
- list-company-390-*: admin, phone list with summary line. Valid.
- company-long-1280-* / -390-*: admin form with long values. Valid.
- non-admin-list-1280-*: read-only user, wide; `/a/books/settings` opens Company read-only (identical to non-admin-company-1280, as the spec says). Valid.
- non-admin-list-390-*: read-only user, phone list. Valid.
- non-admin-company-1280-* / -390-*: read-only label/value rows. Valid.

## Findings

list-company-1280-*: Books sidebar — "Settings" sits directly under "Chart of Accounts" with the same indent and no gap or divider, so it reads as a member of the ACCOUNTING group rather than the separate end group the plan describes ("render `end` below the Accounting group") — NOTE.

list-company-390-*: nothing found. Row, summary line and chevron match the reference.

company-long-1280-*: nothing found. Single-line inputs clip at the right edge as in the reference; the three-line address fits the textarea.

company-long-390-*: Business address textarea — fixed height shows four lines and slices the fifth ("Springfield, Oregon 97477, United States…") in half horizontally. The field should grow with its content or stop on a whole line — NOTE.

non-admin-list-1280-*: nothing found beyond the Currency item below.

non-admin-list-390-*: Company row — the long name wraps to two lines and clamps with an ellipsis; the reference keeps every summary on one line. Acceptable, but confirm the two-line clamp is intended — NOTE.

non-admin-company-1280-*: Currency — drawn as a left-aligned sentence "Currency: US dollars (USD)" with a muted note under it, while every other field is a label/value row with the value right-aligned. The reference non-admin-company-1280 draws Currency as a "Currency | US dollars (USD)" row in the same grid, with no note. The spec wording ("A read-only line "Currency: US dollars (USD)" and the note") sits under "Company (admin edits)", so the build is defensible, but in the read-only view it breaks the row rhythm — NOTE.

non-admin-company-390-*: same Currency item as above — NOTE. Mobile tab bar — only "More" is drawn; the "Books" tab that non-admin-list-390 and the admin shots show is absent, so the bar is inconsistent across shots of the same user. Likely capture timing or an active-route miss on the `[section]` route; confirm before the e2e checkpoint — NOTE.

Dark mode: all screens use the same token set as light; labels, values, inputs, the active row and the disabled Save stay legible. Nothing found.

## Carried from round 1

Fixed: non-admin-list-390 now shows the Books tab. Not fixed: the Settings sidebar grouping, the address textarea clip on phone. Dropped: the missing sections (out of this checkpoint's scope) and the admin-form currency stack (the build's value-plus-note hierarchy is clearer than the reference's single muted line and loses nothing).
