# Checkpoint 7 critique — Row menus, default and refusals

Scope: the agency, rate and group row menus (edit, default, inactive, delete with a confirm), the Default for new sales card with its grouped picker, refusals in the page banner, and every write control disabled while writes are unavailable. Not judged: the help icon (checkpoint 8), the product and customer fields, and the four decided differences (grouped picker sections, one-line delete copy, one-rate fakes, server text in the refusal shot).

Every built screenshot was read, light and dark, next to its reference.

## State check

| Shot | Shows its state? | What it shows |
|---|---|---|
| populated-1280-light / dark | yes | two agency cards, five + two rates, Tax groups card, default picker set to Denver combined, row menus on every row |
| populated-390-light / dark | yes | same structure at phone width, action row wrapped under the title, FAB, tab bar |
| row-menu-1280-light / dark | yes | Colorado state rate menu open: Edit, Make default, Make inactive, Delete |
| row-menu-phone-390-light / dark | yes | the same menu as a bottom sheet titled "Colorado state" with a close control |
| read-only-1280-light / dark | yes | no action row, no row menus, no Add rate, the default shown as text "Denver combined 8.71%" |
| refusal-1280-light / dark | yes | the server message in a dismissable banner above the default card, dialog closed |
| delete-rate-1280-light / dark | yes | "Delete rate “Adams County”?" confirm with one explanatory line, Cancel and a destructive Delete rate button |
| one-rate-1280-light / dark | yes | one agency with one rate, default picker at None, Add group disabled, Tax groups card shows "Add at least two rates to combine them." |

No INVALID shots.

Observation, not a finding: in read-only the sidebar draws no "+ New" button where the reference draws one. The fake `books_access` row sets `can_write: false`, so the Books shell hides it. That is shell behavior outside this checkpoint.

## Findings

### populated-1280-light / dark

nothing found

### populated-390-light / dark

- populated-390: Colorado card, last rate row — the long name "Scientific and Cultural Facilities District, seven-county Denver metro area" wraps to a second line and then truncates ("seven-…"); the reference clamps it to one line with an ellipsis. Two lines plus an ellipsis reads as a half-measure next to the one-line rows above it. — NOTE

### row-menu-1280-light / dark

nothing found. The open menu covers the Adams County row's percentage and menu button, exactly as in the reference (core Menu placement).

### row-menu-phone-390-light / dark

nothing found

### read-only-1280-light / dark

- read-only-1280: rate rows and group rows — the percentage column stops about 36 px short of the row's right edge, at the position it holds when a menu button follows it; the reference pulls the percentage flush with the row divider when there are no menus. The empty gutter reads as a missing control. — NOTE
- read-only-1280: Tax groups card, Denver combined row — the "Default" badge is a bordered pill; the reference draws plain accent text. If this is the core Badge it is the right component; keep the Inactive badge (Show inactive) in the same style. — NOTE

### refusal-1280-light / dark

nothing found. The banner spans the full content width (aligned with the page title and the cards' outer edges) where the reference insets it to the cards' inner padding; the built alignment is the better one. Light and dark both legible.

### delete-rate-1280-light / dark

nothing found. One explanatory line is a decided difference. Light and dark both legible; the destructive button keeps contrast in dark.

### one-rate-1280-light / dark

nothing found. Add group is visibly disabled; the "Add at least two rates to combine them." line and the None default match the spec.

## Totals

- INVALID: 0
- BLOCKING: 0
- NOTE: 3 (long-name wrap at 390; read-only percentage gutter; Default badge style)
