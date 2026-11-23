# Design critique, fix round 2: report-1099, checkpoint 5 (settings-1099 shots only)

Result: 0 INVALID, 0 BLOCKING, 4 NOTE.

Read: the 8 `settings-1099-*` shots of cp5 (each 2300 px high), the brief, `agent-rules.md`, `memories-design.md`, `critique.md`, `critique-fix-r1.md`.
Not read: the spec and the lessons file (the scope is one existing section with no reference, D10).
No reference image (D10). The other cp5 shots were not looked at again.
Pixel figures are estimates from the shots.

## The four points to confirm

1. **Vendor rows at 768 are in the shot and inside the card: CONFIRMED.** 768-light and 768-dark each show the five vendor rows (Greenline Landscaping, Jamal Okafor, Keystone Legal Group, Old Town Print Shop, Willamette Valley…) and the card's bottom border below the last row. Each row stacks the name (and legal name) above the badge or tax ID; the chevron is in view at the right padding.
2. **No account name or vendor name runs past the card padding or border: CONFIRMED at all four widths.** 768-light (the narrowest pane, card content about 170 px): "6200 Software Subscrip…" and "6300 Bank charges and…" end with an ellipsis on the same right edge as the selects below them, inside the padding. The r1 NOTE (name through the padding to the border) is gone. "Willamette Valley Comm…", "Willamette Valley Commerci…" and "Old Town Print Shop LLC · I…" end with an ellipsis at the padding. 768-dark, 1024 and 390: long names end with an ellipsis before the tax ID; 1280: the full names fit.
3. **"Missing tax ID" pill at the narrow row: CONFIRMED.** 768-light and 768-dark: the pill is on its own line under "Greenline Landscaping", right-aligned beside the chevron, whole, on one line, inside the card. The text is legible in light (dark text on the pale amber pill) and in dark (light text, amber outline).
4. **No column collapses to blank or one character: CONFIRMED.** Every account row shows its name and its select value; every vendor row shows its name and its badge or tax ID; "Inactive" reads on one line. The shortest visible text is an ellipsized name of 20+ characters.

## Per shot

### settings-1280-light, settings-1099-1280-dark
State check: valid. 1099s section with the button and the three cards.
- Button "Open the 1099 report": outline, small, above the Reporting threshold card, on the cards' left edge, with the section gap. Account rows are name and select side by side. Vendor names are whole.
- settings-1099-1280-* (also 1024 and 390): card "1099 vendors", first row "Greenline Landscaping" — the row has more space below it than above it (the name sits close to the summary line, and the divider is about 30 px under it), while the two-line rows are centred in their rows — NOTE.

### settings-1099-1024-light, settings-1099-1024-dark
State check: valid. Same section; account rows stacked (name above select).
- Names and vendor rows are inside the card; the Willamette name and legal name end with an ellipsis and the tax ID is whole.
- settings-1099-1024-*: card "Accounts reported on 1099s", every row — the stacked selects are about 320 px wide in a card content area of about 385 px, and the threshold input is about 360 px wide, so the right edges do not line up and the right of the card is empty — NOTE (unchanged from r1).

### settings-1099-768-light
State check: valid. Same section in a content pane about 240 px wide (card content about 170 px).
- Points 1 to 4 hold (see above). The button is above the cards, on the cards' left edge, with the section gap.
- settings-1099-768-light: card "Accounts reported on 1099s", rows "6210 Design Tools" and "6900 Old Petty Cash" — the select value wraps to 3 and 4 lines, and the chevron of a wrapped select is drawn very small (almost not visible on the inactive row). All text is inside the select and the card — NOTE (unchanged from r1; less wrap than r1).

### settings-1099-768-dark
State check: valid. Same section in a content pane about 285 px wide.
- Points 1 to 4 hold. "NEC 1 · Nonemployee compensation" wraps to 2 lines and "MISC 8 …" to 3 lines, with the same small chevron — counted in the NOTE above.
- settings-1099-768-light vs -dark: Books sidebar and settings list — the two left panes are about 40 px wider in light than in dark, so the two shots do not show the same content width. Light is the worst case and it passes — NOTE (capture state, as in r1).

### settings-1099-390-light, settings-1099-390-dark
State check: valid. Pushed screen "1099s" with the button and the three cards.
- The button is above the cards, on the cards' left edge, with the section gap. Account rows: name above a full-width select. Vendor rows: name left, badge or tax ID right, all inside the card; the Willamette lines end with an ellipsis.
- The floating New button is now below the vendors card and covers nothing (the r1 NOTE is gone in these shots).
- Nothing new found.

## Other defects
- None that break a rule. No table or card scrolls sideways or is cut by the screen edge at any width. Light and dark are legible at every width.

## For gate 3
- None.
