# Design critique, fix round 1: report-1099, checkpoint 5 (settings-1099 shots only)

Result: 0 INVALID, 0 BLOCKING, 6 NOTE.

Read: the 8 `settings-1099-*` shots of cp5, the brief, `agent-rules.md`, `memories-design.md`, the earlier `critique.md`.
Not read: the spec and the lessons file (the scope is one existing section with no reference, D10).
No reference image (D10). The other cp5 shots were not looked at again.

## Earlier BLOCKING (settings-1099 at 768, cards "Accounts reported on 1099s" and "1099 vendors")

- Accounts card: gone in light and dark. Each row now puts the account name on its own line and the box select below it, inside the card. No name column is collapsed, "Inactive" reads on one line, and no select runs past the card border or the screen edge.
- Vendors card: gone in dark (name on line 1, badge or tax ID on line 2, chevron in view). In light the vendor rows are below the bottom of the shot, so the narrowest pane (about 175 px) is not proved for this card. See the NOTE below.

## Per shot

### settings-1099-1280-light, settings-1099-1280-dark
State check: valid. 1099s section with the button and the three cards.
- Name and select are side by side in each account row, as before the fix. The button is above the cards, on the cards' left edge, with the section gap. Nothing found.

### settings-1099-1024-light, settings-1099-1024-dark
State check: valid. Same section; the account rows are in the stacked arrangement (name above select).
- The long vendor name and legal name of the last row end with an ellipsis; the tax ID stays whole. The button meets the Gates line.
- settings-1099-1024-*: card "Accounts reported on 1099s", every row — the stacked selects are about 320 px wide in a card about 385 px wide, and the threshold input above is about 360 px wide, so the two right edges do not line up and the right of the card is empty — NOTE.

### settings-1099-768-light
State check: valid. Same section in a pane about 175 px wide (Books sidebar about 250 px).
- settings-1099-768-light: card "Accounts reported on 1099s", rows "6200 Software Subscriptions" and "6300 Bank charges and fees" — the name ends with an ellipsis, but its text runs through the card's right padding to the card border ("6200 Software Subscri…" ends at the border), while the selects below stop at the padding. The name seems to keep a minimum width that is more than the space in this pane — NOTE (no rule names it; the name is readable and nothing is cut by the screen).
- settings-1099-768-light: same card, rows "6210 Design Tools" and "6900 Old Petty Cash" — the select value wraps to 3 and 6 lines, and the chevron of a wrapped select is drawn as a small dot — NOTE.
- settings-1099-768-light: card "1099 vendors" — the shot ends at the card's summary line, so no vendor row is in view. The earlier critique's vendor-name defect (name cut to one character beside the badge) was in this shot. Capture it again with more height, or with the page scrolled, to prove this card at this pane width — NOTE (not proved; no defect seen).

### settings-1099-768-dark
State check: valid. Same section in a pane about 240 px wide (Books sidebar about 185 px).
- All names, selects and vendor rows are inside their cards. The vendor rows stack the name above the badge or tax ID. Nothing found in the cards.
- settings-1099-768-light vs -dark: Books sidebar — it is about 250 px wide in light and about 185 px in dark, so the two shots do not show the same pane width. The light shot is the worst case — NOTE (capture state, the same as in the earlier critique).

### settings-1099-390-light, settings-1099-390-dark
State check: valid. Pushed screen "1099s" with the button and the three cards.
- The account rows are the same as before the fix (name above a full-width select). The button meets the Gates line.
- settings-1099-390-*: card "1099 vendors" — the floating New button covers the last digit of the Keystone Legal Group tax ID — NOTE (the same as in the earlier critique; scroll clears it).

## For gate 3
- None.
