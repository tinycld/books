# Gate 2 critique — checkpoint 7, Vendors list and list route

Delivers: the `/a/books/vendors` route with header, search, Show inactive, table (1280) or cards (390), loading, error and the three empty states. Reviewed against the reference `list-*.png` and the spec's List section. The row menu cell is empty until checkpoint 10; a missing ⋮ is not counted. The loading state has no capture in the gate list and is not reviewed.

Provenance: 12 of the 18 built files are byte-identical to their reference file (every `list-empty-*`, `list-all-inactive-*`, `list-error-1280-*`, `list-no-match-1280-*`). `list-1280-*`, `list-390-*` and `list-no-match-390-*` differ (the ⋮ cell is empty in the build), so the set was captured fresh from the build (`capture.json`, `helix-capture.spec.ts`); the identical files come from a deterministic render of the same component and fake data. The error shot waited on `vendors-banner`, the built banner's test id.

Read-only empty state (`list-empty-read-only-1280-*`, no built shot): `vendorsEmptyHint(false)` returns "Vendors appear here once a bookkeeper adds them.", the reference's hint word for word; `listWriteControls(false)` returns `{ showNewButton: false, showEmptyNew: false }`, which removes the header button and the empty-state button as the reference shows. Judged clean.

## State check

| Shot | State shown | Valid |
|---|---|---|
| list-1280-light / dark | populated table, 11 rows visible, toolbar, header button | yes |
| list-390-light / dark | populated cards, toolbar, FAB, tab bar | yes |
| list-empty-1280-light / dark | "No vendors yet", hint, empty-state New vendor, no toolbar | yes |
| list-empty-390-light / dark | same at phone width, FAB | yes |
| list-no-match-1280-light / dark | search "Zephyr Logistics", "No vendors match", Clear search, toolbar kept | yes |
| list-no-match-390-light / dark | same at phone width | yes |
| list-all-inactive-1280-light / dark | "No active vendors", Show inactive button, toolbar kept | yes |
| list-all-inactive-390-light / dark | same at phone width | yes |
| list-error-1280-light / dark | banner "Could not load vendors" with Retry, no toolbar, no rows | yes |

No INVALID shots.

## Findings

list-1280-light: nothing found. Header, toolbar, column heads and rows match the reference's structure and alignment; the company line sits under the name in muted text only where it differs (Cascade, City of Portland, Ironclad).

list-1280-dark: nothing found. Muted company lines and column heads stay legible.

list-390-light: FAB — the FAB (x 318–374, y 661–717) covers the right end of the card rows under it; a long email or company line on those cards runs under the FAB until the list scrolls. The reference has the same FAB at the same place, and the spec asks for it ("On phones the Books New FAB also shows on the list"), so this is not a lost decision — NOTE.

list-390-dark: nothing found beyond the same FAB note.

list-empty-1280-light: nothing found. Matches the reference: no toolbar, header button kept, title + hint + button.

list-empty-1280-dark: nothing found.

list-empty-390-light: whole screen — three identical entry points at once (header "New vendor", empty-state "New vendor", FAB "+"). The spec asks for each of them, and the reference shows all three, so no decision is lost — NOTE.

list-empty-390-dark: nothing found beyond the same note.

list-no-match-1280-light / dark: nothing found. The toolbar stays with the typed search, as the spec's "toolbar (shown once at least one vendor exists)" needs.

list-no-match-390-light / dark: nothing found.

list-all-inactive-1280-light / dark: nothing found. The toolbar's Show inactive and the empty state's Show inactive both show, as the reference decided.

list-all-inactive-390-light / dark: nothing found.

list-error-1280-light / dark: banner — drawn with the plain foreground border and no danger tint; this is the known core gap (`bg-danger-soft` / `border-danger-soft-foreground` not in core's global.css) and is not a finding for this checkpoint. Otherwise nothing found: the text and Retry match the spec's "Could not load vendors" with Retry, and the toolbar is hidden as in the reference.

## Totals

BLOCKING: 0. NOTE: 2 (FAB over the card rows on phones; three New entry points on the phone empty state). Both are reference and spec decisions, recorded for the human only.
