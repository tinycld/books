# Gate 2 critique — bank-import-mapping checkpoint 3 (Statement line, keys and help)

Scope: the Delivers line of checkpoint 3 — the statement balance line on the Banking account card, the help icon beside the import page title, focus on open at 1280 (header select on Map columns, select-all box on Choose transactions; nothing focused at 390), and the cp2 carry-over (the "Your file" sample table at 1280 shows all columns of the seeded 3-column file with no cut). Seeded data differs from the reference data (the seed has one card OFX statement; the reference fixture had a statement on both accounts and a 5-column CSV): structure is compared, not data.

## State check

| Shot | State named | Shows | Verdict |
|---|---|---|---|
| banking-1280-light | Banking, 2100 Company Card selected, statement line | Banking page, 2100 card selected (teal border), "Bank statement / $3,410.17 / as of Oct 28, 2026" under "In Books", 1000 card with no line | valid |
| banking-1280-dark | same | same, dark | valid |
| banking-390-light | same at phone | strip scrolled to the selected 2100 card, statement line shown, card panel below | valid |
| banking-390-dark | same | same, dark | valid |
| map-1280-light | Map columns, wide, header select focused on open | Map columns step of checking-2026-09.csv, help icon beside the title, 3-column sample table | valid (focus not visually confirmable, see findings) |
| map-1280-dark | same | same, dark | valid |
| map-390-light | Map columns, phone, nothing focused | stacked phone layout, help icon, no focus ring | valid |
| map-390-dark | same | same, dark | valid |
| choose-1280-light | Choose transactions, wide, select-all focused on open | Choose step, 6 rows all chosen, select-all checked, help icon | valid (focus not visually confirmable, see findings) |
| choose-1280-dark | same | same, dark | valid |
| choose-390-light | Choose transactions, phone, nothing focused | "Select all" bar over PhoneChoiceRows, no focus ring | valid |
| choose-390-dark | same | same, dark | valid |

0 INVALID.

## Findings

### banking-1280-light / banking-1280-dark
- Statement line: under "In Books" on the 2100 card — "Bank statement" (small, muted), "$3,410.17" (base, semibold, tabular), "as of Oct 28, 2026" (small, muted), then "1 file waiting". Same order, weights and vertical rhythm as the reference (label ~y245, amount ~y266, date ~y285, waiting ~y307). The card amount is positive and drawn in the foreground tone, the same side as "In Books", as the spec's credit-card sign rule says.
- 1000 Business Checking has no statement in the seed: no line, no reserved space; the row stretches both cards to the same height, as the spec allows ("the cards of one row stretch to the tallest, as they do now").
- Dark: label and date are muted but legible; amount is full foreground.
- nothing found.

### banking-390-light / banking-390-dark
- The strip is scrolled so the selected 2100 card is in view (the built URL selects it); the reference had 1000 selected. Not a finding: the structure of the card (type, bank line, In Books, Bank statement block, waiting text) is the reference's.
- The statement block fits the phone card width with no wrap or cut.
- nothing found.

### map-1280-light / map-1280-dark
- Header: help icon sits beside "Import bank transactions" on the title line, centered on the title, the same size and tone as the Banking page's title help icon. Matches the reference.
- cp2 carry-over confirmed: "Your file" shows LINE, COLUMN 1, COLUMN 2, COLUMN 3 and every value of the 3-column file ("4250.00", "-86.47", "-1200.00", "-500.00", "1875.00") inside the table edge; nothing is cut. (The reference's 5-column file cut at COLUMN 4 by sideways scroll, which is data, not structure.)
- map-1280-light / map-1280-dark: "Is the first row a header?" select — no visible focus indicator on the autofocused trigger; the border and background of the "Yes" trigger read the same as the other selects, so the shot cannot prove focus on open — NOTE (the reference shows no ring either, so no reference decision is lost; Chrome applies `:focus-visible` to programmatic focus only after a keyboard interaction, and the capture reaches the page by a click, so an invisible ring here is expected browser behavior; the e2e of this checkpoint asserts the focus directly).

### map-390-light / map-390-dark
- No focus ring on any select; help icon beside the title; stacked layout unchanged from cp2.
- nothing found.

### choose-1280-light / choose-1280-dark
- Help icon beside the title as on Map columns.
- choose-1280-light / choose-1280-dark: select-all box in the table header — no visible focus indicator on the box that should be focused on open; it reads as a plain checked box — NOTE (same basis as the map finding above; `SelectBox` is a Pressable, and Chrome does not match `:focus-visible` on a script focus that follows a click).

### choose-390-light / choose-390-dark
- "Select all" bar with no focus ring, as intended on phone.
- nothing found.

## For gate 3
- Focus on open at 1280 (header select on Map columns, select-all box on Choose transactions) is not visible in the captures (no `:focus-visible` ring after a pointer-driven navigation). Confirm it with the e2e of this checkpoint (test 8: `bank-import-q-header` trigger focused after `i`; `bank-import-select-all` focused after ⌘↵), and confirm that a keyboard-driven open (key `i`) does draw the ring.
- The keys (`i`, ⌘↵, Esc, `a`) and the help topic are not visible in these shots; gate 3 verifies them.

CRITIQUE: 0 INVALID, 0 BLOCKING, 2 NOTE
