# Gate 2 critique — checkpoint 6 "Products list and list route"

Judged: the Delivers line (list-detail route, shared frame with header, search, Show inactive, the Name/SKU, Type, Sales price, Cost table with an empty menu cell, phone cards, loading, error, the three empty states, the two-line phone title G8, the Lists hub card) and the layout points of Decisions "Layout is the gate 2 critique's" (money right-aligned within 1 px of its header, the header's column texts, the 560 px sideways scroll, Name's ellipsis, the two-line phone title).

Not counted: the empty row menu cell (checkpoint 11). `list-empty-read-only-1280-*` is not captured (no read-only member seeded); its copy is read from code below.

Pre-checks:
- `bg-danger-soft`, `border-danger-soft-foreground`: defined in core `global.css` (`--color-danger-soft`, `--color-danger-soft-foreground`, both themes) by core commit 59fe417, which is on the core repo's `origin/main`. The gap is closed. The banner colors count. (The `~/code/tinycld/tinycld` clone is behind main and still lacks them; that is a stale local clone, not a core gap.)
- `capture.json` shows each state captured in the running app with the products request fulfilled (`fakeRecords`, `items: []`; the two inactive rows; search "Espresso machine"). The empty, no-match and all-inactive PNGs are byte-identical to their references (same md5). The reference was itself a real-component render of the same screen, so identical output is expected; it is not treated as a copy.
- Measured on `list-1280-light`: SALES PRICE header right edge x=1103, every price cell right edge x=1102; COST header x=1215, every cost cell x=1214. Within 1 px. Name header and cells start at x=341; Type header 884, cells 885.

## State check

| shot | state named | shows it | verdict |
|---|---|---|---|
| list-1280-light / -dark | populated, writer | 11+ rows, toolbar, New button | valid |
| list-390-light / -dark | populated phone | cards, FAB, tab bar, two-line title | valid |
| show-inactive-1280-light / -dark | Show inactive on | chip filled, "Cable ties" and "Fax line setup" dimmed with Inactive | valid |
| list-empty-1280-light / -dark | no products, writer | "No products or services yet", hint, empty-state New, no toolbar | valid |
| list-empty-390-light / -dark | no products phone | same at 390 with FAB | valid |
| list-no-match-1280-light / -dark | search with no match | search holds "Espresso machine", "No products or services match", Clear search | valid |
| list-all-inactive-1280-light / -dark | all inactive, chip off | "No active products or services", Show inactive button | valid |
| list-error-1280-light / -dark | failed query | banner "Could not load products and services" + Retry, no list | valid |

No INVALID shots.

## Findings

**list-1280-light:** nothing found. Columns read NAME, TYPE, SALES PRICE, COST plus the empty menu cell; money right-aligned under its header within 1 px; the two long names ("Business laptop…", "On-site network troubleshooting…") end in an ellipsis before the Type column; SKU sits below the name in muted text; bundle rows and rows with price 0 or purchasing off show blank money; rows with no SKU centre the name vertically.

**list-1280-dark:** nothing found. Row dividers, muted SKU and header text stay legible.

**list-390-light:** toolbar — the search placeholder clips to "Search products and service" at the field's right edge, no ellipsis — NOTE. (The reference shows the same clip; the spec names the placeholder "Search products and services". Shared `ListToolbar`; a `numberOfLines`/ellipsis on the placeholder is not a web `TextInput` option, so the fix is a shorter phone placeholder or a wider field. Flagged, not blocking.) Title wraps to "Products and / services" beside the New button (G8) — correct. Cards show name, "Type · price", SKU; "Home office setup kit" shows "Bundle" alone; "Initial consultation" shows "Service" alone — matches `productTypeLine`.

**list-390-dark:** same placeholder NOTE as light; otherwise nothing found.

**show-inactive-1280-light:** nothing found. Inactive rows are dimmed (name, SKU, type and money) with an italic muted "Inactive" after the name; sort order stays case-insensitive by name with the inactive rows interleaved.

**show-inactive-1280-dark:** nothing found.

**list-empty-1280-light / -dark:** nothing found. Toolbar hidden (spec: "shown once at least one product exists"); heading, hint "Add what you sell and what you buy.", a solid New button (lesson: empty-state actions use a core Button).

**list-empty-390-light / -dark:** nothing found. Two-line title beside New, FAB present.

**list-no-match-1280-light / -dark:** nothing found.

**list-all-inactive-1280-light / -dark:** nothing found.

**list-error-1280-light:** nothing found. Banner uses the danger soft background, danger border and danger text; Retry is a white outline button; toolbar and list absent, as the reference decided.

**list-error-1280-dark:** banner — the Retry outline button's border is a faint tint on the dark banner; at 1x it reads as plain text "Retry" with no button edge — NOTE. (Zoomed, a 1 px border and a lighter fill are present; the reference dark shot has the same faint edge. Legibility only; no rule names the outline contrast.)

**list-empty-read-only (not captured):** read from code. `productsEmptyHint(false)` is "Products and services appear here once a bookkeeper adds them." (spec text, exact). `listWriteControls(false)` returns `{ showNewButton: false, showEmptyNew: false }`, so a reader sees neither the header New button nor the empty-state New, which is what the reference `list-empty-read-only-1280-*` shows (title, heading, hint only). Matches.

**Lists hub card:** no screenshot in this checkpoint's gate set. `shell-nav.ts` has the `products` entry (label "Products and services", description "What you sell and buy", href `books/products`, available). Not judged visually.

## Summary

- BLOCKING: none.
- NOTE: (1) phone search placeholder clips "services" to "service" (list-390 both themes, shared `ListToolbar`); (2) Retry outline button is low-contrast on the dark error banner (list-error-1280-dark).

Decisions layout points: money right-aligned within 1 px — pass; header column texts — pass; Name ellipsis — pass; two-line phone title — pass; 560 px sideways scroll — not observable at 1280 (the column is wider than 560); no narrow-column capture is in this checkpoint's gate set, so it is unjudged here and falls to checkpoint 9's panel capture.
