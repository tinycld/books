# Gate 2 critique: audit-log, checkpoint 2 (Record history screen)

Verdict: `CRITIQUE: 0 INVALID, 0 BLOCKING, 4 NOTE`

Read: all 22 built shots (11 names, light and dark), the 11 light reference shots and `history-1280-dark` of the reference, the spec, the lessons, `memories-design.md`, the capture notes.

## Differences from the reference that are not findings

- Type line above the title (reference: title, then type). The plan's Produces says `typeWords` is "shown above it in `history-type`".
- Back link reads "Back" (reference: "Audit Log"). Plan Do 6: `label "Back"`.
- Amounts carry the currency symbol ("$1,250.00"; reference "240.00"). Plan Do 2: "Money is written with `formatMoney(cents, currency)`"; `tests/audit-field-value.test.ts` expects `formatMoney(125000, 'USD')`. See NOTE 1.

## Per screenshot

### history-1280-light / -dark
State check: VALID. A product history with a Changed event (Name, Price in Field | Before | After) and an Added event; Open button; back link.
- nothing found (see NOTE 1 for the money text).

### history-390-light / -dark
State check: VALID. The same product at 390: one card per field (label, Before, After); no sideways scroll; title wraps to 2 lines cleanly.
- nothing found.

### history-more-1280-light / -dark
State check: VALID for the long document history (Posted event, "Line 1 — Changed", "Line 2 — Changed", a "No visible fields changed" event). The Show 50 more button is below the fold and is not in the PNG (the reference has the same limit), so its look is NOT judged here.
- history-more-1280-*: Posted event table — the rows "Sequence 0 → 21" and "Revision 2 → 3" are bookkeeping counters with no meaning to a bookkeeper; the reference's Posted event lists only Status, Number and Posted by. The spec's internal list ("sort and name keys, custom field JSON, search vectors") does not name them — NOTE (2).
- history-more-1280-*: bottom edge — the "Changed / No visible fields changed" card is cut by the viewport. Capture limit, not a finding.

### history-deleted-1280-light / -dark
State check: VALID. Deleted line "This record was deleted on Nov 15, 2026.", no Open button, Deleted event with a Field | Value table, Added event below.
- nothing found.

### history-deleted-390-light / -dark
State check: VALID. The same at 390: deleted line, Field / Value cards. Only the viewport is in the PNG (capture limit).
- nothing found.

### history-vendor-1280-light / -dark
State check: VALID. Vendor Changed event with Tax ID "Changed (hidden)" in both columns; Added event.
- nothing found.

### history-loading-1280-light / -dark
State check: VALID. Three skeleton cards under the header.
- history-loading-1280-*: header — "Product or service" shows two times, one above the other (type line, then the title fallback). It reads as a defect. The capture notes say it is by design; a title skeleton, or no title until the first row loads, is cleaner — NOTE (3; the same finding applies to error and empty).

### history-error-1280-light / -dark
State check: VALID. "Could not load this record's history" with a core Retry button.
- history-error-1280-*: header — the doubled "Product or service" (NOTE 3).

### history-empty-1280-light / -dark
State check: VALID. "No changes recorded for this record."
- history-empty-1280-*: header — the doubled "Product or service" (NOTE 3).

### history-no-access-1280-light / -dark
State check: VALID. "You need Books access to see a record's history." with the back link; no header, no events.
- nothing found.

### history-no-access-390-light / -dark
State check: VALID. The same message at 390, wrapped to 2 lines.
- history-no-access-*: message — centered at 1280, left-aligned at 390. The reference has the same difference, so it is approved — NOTE (4), polish only.

## Findings

1. NOTE — all populated shots, money cells: "$900.00", "$1,250.00", "$45.00". The spec's example is "1,250.00" and the reference shows "240.00", but the plan names `formatMoney` and the unit test accepts its output. The Deleted table then shows the currency two times ("$45.00" and a "Currency USD" row). No rule broken; the human may prefer the bare number.
2. NOTE — history-more-1280-*, Posted event: "Sequence" and "Revision" rows are noise beside Status / Number / Posted by. Consider kind `internal` for them.
3. NOTE — history-loading / history-error / history-empty (6 shots), header: the type words are also the title, so the same words stack.
4. NOTE — history-no-access: message alignment differs between 1280 (center) and 390 (left); as in the reference.

Light and dark: every shot is legible in the two schemes; borders, muted labels and the Open / Retry buttons hold their contrast. Spacing and column alignment agree with the reference in all states.

## For gate 3

- history-more: the PNG does not show `history-show-more`; gate 3 (or the hook test, P14) must confirm it renders and works.
- history-more: the Posted event lists "Revision 2 → 3", while a draft re-save shows "No visible fields changed". If the re-save also moved `revision`, the two events treat the field differently. Check `AUDIT_FIELDS` for `revision` and `sequence`.
