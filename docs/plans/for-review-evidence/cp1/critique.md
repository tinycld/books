# Gate 2 critique — for-review checkpoint 1 (Review tabs and transaction lists)

Delivers judged: the tab bar with the For review count, the Files tab body, the three lists (wide table, phone cards, newest first) with loading / error / empty states, "N to review" on every card, the one-row strip with compact phone cards, the page as a fixed column. Not judged (later checkpoints): toolbar, date toggle, check boxes, select-all bar, selection bar, drawer, focus stripe.

40 built shots read, 20 reference shots read (one light reference per shot; the dark references are the same layout).

## State check

| shot | 1280 light / dark | 390 light / dark |
|---|---|---|
| review | valid: 1000 card chosen, For review (8) tab, table header; only the top of the first row ("CHECK 1050") is visible | valid: one card "CHECK 1050 · Oct 27, 2026 · -$362.40" |
| reviewed | valid (faked rows): Reviewed tab chosen, table header; no row visible, not even partly (see finding 1c) | valid: one card "Transfer to savings · Sep 1, 2026 · -$500.00" |
| reviewed-empty | valid: "No reviewed transactions yet…" | valid |
| excluded | valid: Excluded tab, header; top of "NETFLIX.COM" visible | valid: one card "NETFLIX.COM · -$15.49" |
| excluded-empty | valid: 2100 card chosen, "No excluded transactions…" | valid |
| empty-waiting | valid: 2100, "Nothing to review. 1 file is waiting to import." + Go to files | valid |
| empty-none | valid: 2100 with faked no files, "Nothing to review. Upload a statement…" + Go to files | valid |
| files | valid: Files tab, upload area (only its icon visible) | valid: upload area (icon only) |
| loading | valid: Excluded tab, core spinner | valid |
| error | valid: Excluded tab, "Books could not load these transactions." + Retry | valid |

No shot is INVALID. The populated 1280 lists cannot be judged for row content (second line, Spent / Received cells, date format) because the rows are hidden by finding 1; re-capture `review`, `reviewed`, `excluded` at 1280 after the fix.

## Findings

### 1. Every shot (40/40): account strip — the cards stretch to fill the free height; the tab body gets ~100 px — BLOCKING

Spec §2: "The page stops scrolling as one block: the header, the account strip, the panel heading and the tab bar stay put, and the tab's content fills the rest of the height (the transaction tabs scroll their own windowed list; the Files tab scrolls its own content)."

Built at 1280: the strip is ≈455 px tall (y 85–540); the full cards are their natural ≈210 px of content with ≈250 px of blank card below "8 to review". The panel starts at y 560 and ends at 775, so the tab body is ≈100 px. Reference at 1280: strip 85–295 (natural card height), panel 313–775, body ≈340 px with rows visible.
Built at 390: compact cards are ≈370 px tall (y 75–443) for three lines of text; reference compact cards are ≈85 px (75–158).

The free height of the column goes to the strip `ScrollView` (it flexes and its cards stretch on the cross axis) instead of to the panel. The strip must take its content height only (no flex grow; `alignItems: 'flex-start'` or a fixed card height on the content container), the panel `flex-1 min-h-0`.

Symptoms per shot, all from this cause:
- 1a. review-1280, excluded-1280 (light, dark): the table shows its header and one cut row; the list is below the panel bottom.
- 1b. files-1280, files-390 (light, dark): the upload area shows only its icon; the "Drag the file…" text, "Choose file" and the file list are below the fold. Reference shows the whole upload area and the file rows.
- 1c. reviewed-1280 (light, dark): header only and no row peeks at all, unlike review/excluded where the first row's text is cut at the border. Rows exist (the body is in the `ready` state, not `empty`). Check after the fix that the paged list (`useLiveInfiniteQuery` + `ListTable` window) draws rows when the scroller has a real height; if it does not, this is a second defect.

### 2. Tab body content overflows the panel's bottom border and the viewport — BLOCKING

Plan, checkpoint 1 step 8: "The panel is `flex-1` (`min-h-0` so the body can shrink)." Spec §2 (quoted above): the tab's content fills the rest of the height; nothing is drawn past the panel.

The body is not shrunk to the panel: its content is centered in a box taller than the visible panel, so centered content lands at the bottom edge and spills past the border.
- empty-waiting-1280 (light, dark): the sentence sits at y 747, 28 px above the panel border (775); the "Go to files" button is drawn at y 775–800, outside the panel, over the page background, cut by the viewport.
- error-1280 (light, dark): "Books could not load these transactions." at y 749; the "Retry" button is outside the panel at y 775–800, cut.
- empty-waiting-390, empty-none-390 (light, dark): the "Go to files" button is drawn below the panel border and cut by the tab bar (only its top edge shows).
- error-390 (light, dark): "Retry" is under the tab bar; only its top edge shows.
- empty-none-1280, reviewed-empty-*, excluded-empty-* , loading-*: the sentence / spinner sits at the very bottom of the panel instead of the body's center (reference: centered in the body).
- review-390, reviewed-390, excluded-390 (light, dark): the first card starts ≈115 px below the tab bar with a blank band above it; the reference starts the cards straight under the bar. The list is being placed by the same bottom-biased box. A list must be top-aligned inside the body, whatever its height.

Fixing finding 1 gives the body its height, but the overflow shows the body itself lacks `min-h-0` / `overflow-hidden` (or the body centers its content with `flex-1 justify-center` on a box that is not bounded). Both need the fix; re-capture every state after.

### 3. error-390 (light, dark): error sentence is left-aligned while every other state sentence is centered — NOTE

"Books could not load these / transactions." wraps to two lines, both starting at x 50 (left-aligned). The empty-state sentences on the same tab body are centered (reviewed-empty-390, excluded-empty-390, empty-waiting-390), and the reference error-390 is centered. Give `ReviewLoadError` the same `text-center` as `ReviewEmptyState`.

## Clean parts (checked, nothing found)

- Tab bar: core `SetupTabs`, labels "For review (8)" / "Reviewed" / "Excluded" / "Files", the chosen tab underlined; the 390 bar scrolls (files-390 shows "Files" chosen with "review (8)" cut on the left, as the reference does).
- Account cards: "8 to review" in foreground, "Nothing to review" in muted, under the files-waiting line; compact phone cards carry label, In Books balance, review count only (text present and sized as spec §2 — apart from the stretch in finding 1).
- Empty / error / loading texts match the Texts list exactly; "Go to files" and "Retry" are core outline Buttons (lesson 14).
- Dark mode: contrast of tabs, muted lines, card borders and the chosen-card ring all read; no raw-colour artefacts.
- Phone cards: description line, "Oct 27, 2026 · Check 1050" muted second line, signed amount right (`-$362.40`, `-$500.00`, `-$15.49`). The FAB covering the amount of the fourth card is in the reference too; not a finding.
- empty-none-1280 shows "No files waiting" on the 1000 card because the capture faked `books_bank_files` empty for every account; a capture artefact, not a finding.

## For gate 3

Nothing behavioural is visible in these shots. Item 1c (paged list draws no row even when a cut row would be expected) may turn out to be behavioural if it persists after the layout fix.
