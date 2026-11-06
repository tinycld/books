# Checkpoint 4 critique — Taxes page with agency cards

Gate-2 design critique. Inputs: the 20 built shots in this folder, the matching reference shots in `../../tax-rates-reference/`, `docs/specs/tax-rates-design.md`, `docs/helix-lessons.md`. Judged against the Delivers line only: the Taxes sidebar entry, the Sales tax page read-only (one card per agency with its rates, the groups card, the Default badge, Show inactive), and the empty, loading, error, read-only and phone states. The Add agency / Add group buttons, Add rate links, row and agency menus, the Default for new sales card and the help icon belong to later checkpoints and are not findings.

Summary: 0 INVALID, 0 BLOCKING, 7 NOTE.

## State check

| Shot | Shows its named state? |
|---|---|
| populated-1280-light / -dark | Yes. Two agency cards (City and County of Denver, Colorado Department of Revenue), rates in name order, groups card with Default badge on Denver combined, Show inactive chip off. |
| populated-390-light / -dark | Yes. Same structure at phone width, cards fill the width with a 16 px gutter, chip wraps under the title, New FAB and tab bar present. |
| read-only-1280-light / -dark | Yes. No Show inactive chip, no New button in the sidebar, cards and Default badge shown. |
| show-inactive-1280-light / -dark | Yes. Chip filled (on); Retired rate, Old county agency (with Old county rate) and Old combined shown muted with Inactive badges. |
| empty-1280-light / -dark | Yes. Question block "Which agencies do you collect sales tax for?" with its line; no cards. |
| empty-390-light / -dark | Yes. Same block at phone width, text wraps cleanly. |
| empty-read-only-1280-light / -dark | Yes. Centered "No sales tax is set up yet." and nothing else. |
| one-rate-1280-light / -dark | Yes. One rate (Colorado state 2.9%), groups card shows "Add at least two rates to combine them.". The second agency card "No rates yet." is real seeded data (capture note), not a defect. |
| loading-1280-light / -dark | Yes. Title and a spinner, no cards. |
| error-1280-light / -dark | Yes. Red ListBanner "Sales tax could not be loaded." with Retry, no cards. |

No INVALID shots.

## Findings

### populated-1280-light, populated-1280-dark

- populated-1280-*: every rate row, right edge — the percentage column stops about 52 px short of the row's right edge (the row divider runs to x=1163, the figures end at x=1111). This reserves the menu column that a later checkpoint fills. In the reference read-only shot (the state with no menus) the figures sit 16 px from the row edge. Not a structure or hierarchy loss, so polish only. — NOTE
- populated-1280-*: last row of each agency card and of the groups card — a divider is drawn under the last row and is followed by empty card padding, so the card ends on a loose rule. The "No rates yet." card (one-rate shot) ends with no rule, so cards do not end the same way. The reference draws the same trailing rule, so no decision is broken. — NOTE
- populated-1280-light: Tax groups card, Denver combined row — the Default badge is bare teal text with no visible pill, while the dark shot draws a pill. The reference does the same in both themes, so it is a core Badge rendering matter, not a decision broken here. — NOTE

### populated-390-light, populated-390-dark

- populated-390-*: Colorado Department of Revenue card, last row — "Scientific and Cultural Faciliti…" truncates with no way at this checkpoint to read the full name (the edit dialog comes later). The reference truncates the same way, so the direction is approved; flagging it so the later Edit path is the known fallback. — NOTE
- Otherwise nothing found. The chip wraps under the title, the group second lines wrap to two lines cleanly, and the FAB and tab bar match the spec ("The New FAB stays on this page").

### read-only-1280-light, read-only-1280-dark

- read-only-1280-*: title row — no Show inactive chip, so a read-only user can never see inactive agencies, rates or groups. This matches the spec ("A read-only user sees the page with no actions") and the reference, so it is not a defect of the build; recorded as a spec question because Show inactive is a view filter, not a write. — NOTE
- The percentage-column inset and trailing-rule notes above apply here too; not repeated.

### show-inactive-1280-light, show-inactive-1280-dark

- show-inactive-1280-dark: the "Inactive" badges (Retired rate, Old county agency, Old county rate, Old combined) — badge text is low-contrast on its pill in dark mode; legible on close inspection but faint. The reference dark shot renders the same, so no decision is broken. — NOTE
- show-inactive-1280-light: nothing found. Muted rows, muted agency title with its badge, and the filled chip match the spec ("they show with an 'Inactive' badge, muted") and the reference.

### empty-1280-light, empty-1280-dark

- nothing found. The question and its line match the spec text exactly; the block is centered and legible in both themes. The missing Add agency button is a later checkpoint.

### empty-390-light, empty-390-dark

- nothing found.

### empty-read-only-1280-light, empty-read-only-1280-dark

- nothing found. Text matches the spec ("No sales tax is set up yet.") and the reference's placement.

### one-rate-1280-light, one-rate-1280-dark

- nothing found beyond the shared notes. Name order (City… before Colorado…), "No rates yet.", and the groups card text all match the spec.

### loading-1280-light, loading-1280-dark

- loading-1280-*: spinner — sits about 160 px below the title where the reference places it about 70 px below. Core LoadingState placement; taste only. — NOTE

### error-1280-light, error-1280-dark

- nothing found. Banner text, Retry, and placement match the spec and the reference in both themes.

## Cross-cutting

- Sidebar: the Taxes entry (percent icon) is drawn after Journal Entries and before Settings with the active highlight, as the spec places it. Reference shots predate the entry.
- Both themes use the app's semantic tokens throughout; no raw-color look, no illegible text in light or dark apart from the dark Inactive badge note above.
- Hierarchy inside each card (bold title, muted account line, rows with right-aligned figures) matches the spec's "Sparks carried" and the reference.
