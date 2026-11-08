# Gate 2 critique — bank-import-mapping, checkpoint 1 (Import page with OFX import)

Scope: the Delivers line of checkpoint 1 (route, read states, header, steps, Choose transactions step, import, result; Banking entry points; seeded card statement file). Back, "Change mapping", the help icon and the statement line are later checkpoints and are not findings. The references show the CSV fixture; the build shows the seeded OFX file; structure compared, not data.

Verdict: CRITIQUE: 0 INVALID, 0 BLOCKING, 2 NOTE

## State check

Every built screenshot shows the state its name says. None INVALID.

- choose-ofx (390/1280, light/dark): OFX Choose step, 4 rows all checked, "4 selected", Cancel + "Import 4 transactions". Phone shows the "Select all" bar and two-line rows.
- choose-none: every box empty, "0 selected · Money in $0.00 · Money out $0.00", FormErrorSummary "Choose at least one transaction to import.", button "Import".
- importing: boxes dimmed, Cancel disabled, "Importing…" with spinner.
- refusal: FormErrorSummary with the server line message; choice kept.
- transport: FormErrorSummary "The import could not be sent. Check your connection and try again."
- result: steps gone; card "Imported 2 transactions into 2100 Company Card." + skipped detail + Back to Banking (primary) + Import more from this file (outline).
- result-none: "Nothing new was imported: all 4 chosen transactions were already in Books." + Back to Banking only.
- all-imported: steps shown, message block, Back to Banking.
- loading: back link + title + spinner.
- error: message + Retry (outline).
- not-found: message + Back to Banking.
- unreadable: File/Into lines, danger text, Back to Banking.
- read-only: message + Back to Banking.
- banking: 2100 Company Card selected, "1 file waiting", file row card-2026-10.ofx · OFX · Waiting to import · Import + Remove (table on 1280, card on 390).

The sidebar in unreadable-1280-* and read-only-1280-* is scrolled ~64 px (no "New" button): capture artifact of the shell as noted; not critiqued.

## Findings

### choose-ofx-1280-light / dark, choose-ofx-390-light / dark
- List box — the bordered list keeps its full 480 px view height with only 4 rows (wide: ~208 px of rows, ~270 px blank inside the border; phone: ~300 px of rows, ~230 px blank). It reads as an unfinished box. The plan fixes `viewHeight: 480`; a `maxHeight` of 480 that lets the box shrink to its rows would keep the windowing and remove the blank area. — NOTE

### choose-none-*: nothing found (structure as the reference: empty boxes, zero selection line, summary band, "Import").

### importing-1280-light, importing-390-light
- Primary button "Importing…" — white text on pale teal in light mode is low contrast while the write runs. This is core `ServerActionButton`'s disabled style and the reference shows the same, so no action in this checkpoint; a change belongs to core. — NOTE

### importing-1280-dark, importing-390-dark: nothing found.
### refusal-*: nothing found.
### transport-*: nothing found.
### result-*: nothing found (phone stacks the two buttons as the reference does; headline wraps cleanly).
### result-none-*: nothing found.
### all-imported-*: nothing found. ("Back to Banking" is primary where the reference drew outline; the plan's Produces names `BankImportToBanking` primary `min-h-11`, so this is a plan decision, not a loss.)
### loading-*: nothing found.
### error-*: nothing found.
### not-found-*: nothing found.
### unreadable-*: nothing found (danger text, File/Into lines above the message as the spec says).
### read-only-*: nothing found.
### banking-*: nothing found. The actions column fits Import and Remove side by side on 1280; the 390 card puts them in one row under the status.

## Checked against spec and plan (no deviation seen)
- Header: back link "Banking" (lucide `ChevronLeft` per plan; the reference's "←" is not a decision the plan kept), title `text-2xl font-semibold`, "File: … " + FormatChip, "Into: …" + details in muted. Padding 24 px wide, 16 px phone.
- Steps: OFX "Upload · Choose transactions", current bold.
- Summary and selection lines, column headers DATE / DESCRIPTION / AMOUNT, amounts right `tabular-nums`, money out with a minus, phone "Oct 2, 2026 · Line 9" in small muted text.
- Buttons: Cancel outline, Import primary; FormErrorSummary below the list.
- Light and dark both legible; dark error summary and chips read fine.

## Not captured (cannot be judged here)
Two items of the Delivers line have no shot because the gate's `banking` capture is the seeded 2100 card with no upload and no import: the "Import transactions" button after an upload, and the "Imported: N transactions" status text (the reference shows it truncated to "Imported: 6 trans…" at 1280 in the STATUS column). Gate 3's e2e asserts both texts; their appearance is unreviewed.

## For gate 3
Nothing visible.
