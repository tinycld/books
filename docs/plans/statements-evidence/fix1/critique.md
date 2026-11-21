# Gate 2 critique: fix 1 (failed sends), create-statements screen

Scope: the failed-row mark of spec §3.4 ("Each such row stays ticked and is marked failed in the list: under its address a danger line reads "<number> not sent: <the server's message>""). The reference shots are older than this correction and show no row mark; the spec text is the basis.

## State check

- failed-390-light: VALID. Run notice "2 of 4 statements were sent." with two failed customers; the two failed cards are ticked and each has the danger line.
- failed-390-dark: VALID. Same state.
- failed-1280-light: VALID. Same state, table layout.
- failed-1280-dark: VALID. Same state, table layout.

## Findings

### failed-390-light
- State: as named.
- Card of Delta Freight Partners and of Evergreen Montessori School, under the address field — danger line "ST-1005 not sent: …" / "ST-1006 not sent: …" is present, in the danger color, and wraps inside the card; both rows stay ticked; total reads "Total balance of 2 customers". Agrees with §3.4.
- Failed cards, danger line — the text is smaller than the run notice's lines and than the field text (about 11 px against 14 px). It is legible, but it is the smallest text on the screen for the message the user must act on — NOTE.
- Evergreen Montessori School card, address field — the address is cut at the field edge ("…evergreenmontessori.exa") in the row whose address the user must correct. Field behavior from before the fix, not a result of it — NOTE.

### failed-390-dark
- State: as named.
- Danger lines and the notice are legible on the dark surface; ticks are visible. Same two NOTEs as failed-390-light (not counted again).

### failed-1280-light
- State: as named.
- Rows of Delta Freight Partners and Evergreen Montessori School, Email address column — the danger line is under the address field, inside the column's width, and wraps to two lines for the long message; the row grows; the name, the tick box and the balance stay on the field's line; no sideways scroll; heading and rows stay aligned. Agrees with §3.4 and the table rule.
- Same two NOTEs as failed-390-light (not counted again).

### failed-1280-dark
- State: as named.
- Legible; same layout as light. Nothing more found.

## Compared with the shots before the fix (cp4)

The only change is the added danger line in the two failed rows and the row height that follows from it. Notice, options, total, bar and the other rows are unchanged.

## For gate 3

- The captured failure text is "The mail server refused the address." Spec §3.5 gives the server's permanent-refusal text as "The email server refused <address>. Correct the address and send again." The capture fakes the send answer, so check that the real server text is the spec's.
- The notice and the row line repeat the same server message. The spec requires both; no action.

CRITIQUE: 0 INVALID, 0 BLOCKING, 2 NOTE
