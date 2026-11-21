# Design critique: statements, checkpoint 3 (Create statements: list and Save) — after fix round 1

Read: 22 built shots (captured again), 22 reference shots, the brief, the spec, the lessons, `memories-design.md`, the first critique.
Scope: the Delivers line of checkpoint 3. The bar holds Cancel and Save only (Preview, Save and send and the phone More menu are checkpoint 4; not judged).
Fix round 1 changed: the row's Email address field (controlled, core TextInput classes) and the no-write notice (Books `EntryNotice`).

Result: 0 INVALID, 0 BLOCKING, 4 NOTE. The 4 NOTEs of the first critique still hold; no new finding.

## State check

| Shot | State shown | Verdict |
|---|---|---|
| populated-1280-light | Options, table of 14 ticked rows, "Total balance of 14 customers" $25,364.72, Cancel + Save | valid |
| populated-1280-dark | Same, dark | valid |
| populated-390-light | Total first, options, "Select all" row, cards, Cancel + Save | valid |
| populated-390-dark | Same, dark | valid |
| open-items-1280-light | Type "Open items", Start date and End date not drawn | valid |
| open-items-390-light | Same, cards | valid |
| one-customer-1280-light | Customer balance "All", only Aspen Ridge Dental ticked, heading tick box mixed, "Total balance of 1 customer" | valid |
| one-customer-390-light | Same, cards, "Select all" mixed | valid |
| overdue-1280-light | Customer balance "Overdue", 10 rows | valid |
| overdue-390-light | Same, cards | valid |
| none-1280-light | No tick, "No customer selected", $0.00, Save disabled | valid |
| none-390-light | Same, cards | valid |
| empty-1280-light | "No customer has an open balance" + second line, Save disabled | valid |
| empty-390-light | Same | valid |
| loading-1280-light | Options drawn, 4 row skeletons, Save disabled | valid |
| loading-390-light | Same | valid |
| error-1280-light | "Customers could not load." with Retry, Save disabled | valid |
| error-390-light | Same | valid |
| no-write-1280-light | Title and "You need bookkeeper access to create statements", no form, no bar, no New button | valid |
| no-write-390-light | Same | valid |
| saving-1280-light | Save reads "Saving…", Cancel and the tick boxes disabled | valid |
| saving-390-light | Same, "Select all" disabled | valid |

Not findings (as in the first critique): the built `populated` shots show every row ticked (the reference has one row not ticked; the mixed state is in `one-customer`); the built `saving` shots use the one-customer run (the reference uses the 9-customer run).

## The two changed parts

- Email address field (all list shots, 1280 and 390, light and dark): the input has the same height, border, radius, padding and text size as the reference's field, and the same look as the option fields above it. Empty addresses draw an empty field of the same size. Rows stay one line at 1280 (56 px) and the columns line up with the heading. Dark: border and text are legible. No regression found.
- No-write notice (`no-write-*`): the Books `EntryNotice` draws the text at the left under the title; the reference draws it centred with more space above. The text and the content of the state are the same (title, notice, no form, no bar). The position follows the shared Books component, so it is not a finding. The text wraps cleanly at 390.

## Findings

### populated-1280-light, populated-1280-dark
- populated-1280-*: Email address column, rows "Evergreen Montessori School", "Harborview Hospitality Group", both "St. Jude…" rows — a long address is cut at the edge of the input with no ellipsis, while the Recipient cell beside it ends with "…". The reference does the same. — NOTE (still holds)

### populated-390-light, populated-390-dark
- nothing found (the same cut of a long address; counted once)

### open-items-1280-light, open-items-390-light
- nothing found

### one-customer-1280-light, one-customer-390-light
- nothing found

### overdue-1280-light, overdue-390-light
- nothing found

### none-1280-light, none-390-light
- nothing found

### empty-1280-light, empty-390-light
- nothing found

### loading-1280-light, loading-390-light
- loading-*: total, top right (1280) and under the title (390) — reads "No customer selected" over "$0.00" while the list still loads. The text is about the user's ticks, and no list exists yet. The reference shows the fixture's figure there, so it decided nothing. A muted or skeleton total would be more correct. — NOTE (still holds)
- loading-390: list area — the skeleton rows have the table shape (tick, name, input, balance in one line); the loaded phone list is cards. The reference draws the same skeleton. — NOTE (still holds)

### error-1280-light, error-390-light
- error-*: total — reads "No customer selected" over "$0.00" beside "Customers could not load." The zero is not a known figure in this state. Same cause as the loading note. — NOTE (still holds)

### no-write-1280-light, no-write-390-light
- nothing found (see "The two changed parts")

### saving-1280-light, saving-390-light
- nothing found

## Checks with no finding

- No table scrolls sideways at 390 or 1280; the list draws cards at 390.
- Heading and rows share the columns: tick box, Recipient, Email address and Balance line up at 1280.
- Sub-customer label "<parent>:<name>" with the parent muted, " (inactive)" suffix, negative credit balance (-$150.00): present, as the reference.
- Dark mode: text, inputs, borders and the bar are legible; no raw light surface.
- Total: top right on wide, first on the phone; the largest figure on the screen.
- Bar: sticky, Cancel outline and Save primary; disabled styles are clear in `none`, `empty`, `loading`, `error`, `saving`.

## For gate 3

- None visible.
