# Checkpoint 4 critique 2 — Taxes page with agency cards (after fixes)

Fresh gate-2 design critique of the re-captured shots. Inputs: the 20 built shots in this folder, the matching reference shots in `../../tax-rates-reference/`, `docs/specs/tax-rates-design.md`, `docs/helix-lessons.md`. Judged against the Delivers line only: the Taxes sidebar entry and the Sales tax page, read-only — one card per agency with its rates, the groups card, the Default badge, Show inactive, and the empty, loading, error, read-only and phone states. Not findings: Add agency / Add group buttons, Add rate links, row and agency menus, the Default for new sales card, the help icon.

Summary: 0 INVALID, 0 BLOCKING, 6 NOTE.

## State check

| Shot | Shows its named state? |
|---|---|
| populated-1280-light / -dark | Yes. Two active agency cards in caseless name order (City and County of Denver, Colorado Department of Revenue), rates in name order with right-aligned percentages, Tax groups card with the Default badge on Denver combined, Show inactive chip off. |
| populated-390-light / -dark | Yes. Same structure at 390 px: chip wraps under the title, cards fill the width with a 16 px gutter, New FAB and tab bar present. |
| read-only-1280-light / -dark | Yes. No Show inactive chip, the same cards and Default badge. |
| show-inactive-1280-light / -dark | Yes. Chip filled; Retired rate (3.5%), Old county agency with Old county rate (1.25%), and Old combined (3.9%) shown muted with Inactive badges. |
| empty-1280-light / -dark | Yes. One block with "Which agencies do you collect sales tax for?" and its line; no cards. |
| empty-390-light / -dark | Yes. Same block at phone width; the two texts wrap cleanly. |
| empty-read-only-1280-light / -dark | Yes. Centered "No sales tax is set up yet." and nothing else. |
| one-rate-1280-light / -dark | Yes. Colorado state 2.9% alone; the groups card says "Add at least two rates to combine them." The "No rates yet." card for City and County of Denver is real seeded data (capture note). |
| loading-1280-light / -dark | Yes. Title and a spinner, no cards. |
| error-1280-light / -dark | Yes. Red ListBanner "Sales tax could not be loaded." with Retry, no cards. |

No INVALID shots.

## Findings

### populated-1280-light, populated-1280-dark

- populated-1280-*: last row of each agency card and of the groups card — a divider is drawn under the last row and ~20 px of empty card padding follows, so each card ends on a loose rule. The reference draws the same rule, but there "Add rate" follows it; in this checkpoint nothing follows. No decision lost. — NOTE
- The percentage column ends at x≈1111 with the row divider running to x≈1163. This matches the reference's populated shot, where the row menu occupies that space; the menu is a later checkpoint. Not a finding.
- Text, order, formatting (4.81%, 8.875%, 0%, 1%, 0.105%, 3.65%, 8.71%), the group second lines, and the Default badge (a bordered teal pill in light, a filled pill in dark) all match the spec. Nothing else found.

### populated-390-light, populated-390-dark

- populated-390-*: Colorado Department of Revenue card, last row — "Scientific and Cultural Facilities District, seven-…" wraps to two lines and then truncates, so this one row is ~20 px taller than its neighbours. The reference truncates on one line. The build shows more of the name and loses no decision; the uneven row height is polish. — NOTE
- The trailing-rule note above applies here too; not repeated.
- Chip under the title, 16 px gutter, group second lines wrapping to two lines, FAB and tab bar: all match the spec ("the action row wraps under the title", "The New FAB stays on this page"). Nothing else found.

### read-only-1280-light, read-only-1280-dark

- read-only-1280-*: every rate and group row, right edge — the percentage column keeps the ~52 px reservation for the row menu (figures end at x≈1111, divider at x≈1163). The reference read-only shot moves the figures to the row edge (x≈1147), because a read-only user never gets a menu. The reservation is permanent dead space in this state. Alignment only, not structure. — NOTE
- The trailing-rule note applies here too; not repeated.
- Not a finding: the sidebar has no "+ New" button and the nav starts at the top of the panel, where the reference still shows "+ New". That is the Books shell's read-only behaviour, outside this checkpoint.
- Spec match: "A read-only user sees the page with no actions, no row menus" — no chip, no buttons. Nothing else found.

### show-inactive-1280-light, show-inactive-1280-dark

- show-inactive-1280-dark: the four "Inactive" badges (Retired rate, Old county agency, Old county rate, Old combined) — muted grey text on a dark outlined pill; legible on close inspection but faint next to the muted row text. The reference dark shot renders the same. — NOTE
- show-inactive-1280-light: nothing found. Muted rows, muted agency title with its badge, the filled chip, and the inactive agency's card listing its inactive rate all match the spec ("they show with an 'Inactive' badge, muted"; "An inactive agency's card lists its rates … while shown").

### empty-1280-light, empty-1280-dark

- nothing found. Question and line match the spec text exactly, centered and legible in both themes. The missing Add agency button is a later checkpoint.

### empty-390-light, empty-390-dark

- nothing found.

### empty-read-only-1280-light, empty-read-only-1280-dark

- nothing found. "No sales tax is set up yet." matches the spec and the reference's placement.

### one-rate-1280-light, one-rate-1280-dark

- one-rate-1280-*: card bottoms — the "No rates yet." card and the groups card end on plain padding, while the Colorado card ends on a rule plus padding, so the three cards on one screen do not end the same way. Same root as the trailing-rule note. — NOTE
- Name order, "No rates yet.", and "Add at least two rates to combine them." match the spec. Nothing else found.

### loading-1280-light, loading-1280-dark

- loading-1280-*: spinner — centered about 160 px below the title where the reference places it about 70 px below. Core LoadingState placement; taste only. — NOTE

### error-1280-light, error-1280-dark

- nothing found. Banner text, Retry, colours and placement match the spec in both themes. The banner spans the card width (x 348–1180) where the reference insets it to the card content width; aligned with the cards, no decision lost.

## Cross-cutting

- Sidebar: the Taxes entry (percent icon) sits after Journal Entries and before Settings with the active highlight, as the spec places it. Reference shots predate the entry.
- Both themes read as the app's semantic tokens; no raw-colour look. Legibility is good in light and dark apart from the dark Inactive badge note.
- Hierarchy inside each card (bold title, muted account line, rows with right-aligned tabular figures) matches "Sparks carried" and the reference.
- Compared with critique 1: the light-mode Default badge now draws a bordered pill (was bare text), and the earlier spec question about Show inactive for read-only users is not repeated here because the spec and the reference both decide it.
