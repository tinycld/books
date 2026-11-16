# Gate 2 critique after fix round 1: audit-log, checkpoint 2 (Record history screen)

Verdict: `CRITIQUE: 0 INVALID, 0 BLOCKING, 0 NOTE`

The count is for new findings only. The 4 NOTEs of the first critique (`critique.md`) are not repeated; their status is in "Earlier NOTEs" below.

Read: all 22 built shots (11 names, light and dark), the 11 light reference shots, the spec, the lessons, `memories-design.md`, the first critique, the capture notes.

## What the fix round changed, as the shots show it

- Position row: `history-more-1280-*` "Line 1 — Changed" lists Debit only and "Line 2 — Changed" starts with Credit. No Position row is visible. Confirmed in the visible part.
- Show 50 more loading state: NOT judged. The button is below the fold in `history-more-1280-*` (same capture limit as before), so no shot shows the button or its loading state.
- Party contact's Open label: NOT judged. No shot shows a party contact history.
- Inline error for value reads: NOT judged. No shot shows it.

## Per screenshot

### history-1280-light / -dark
State check: VALID. Product history, Changed event (Name, Price in Field | Before | After), Added event, Open button, back link.
- nothing found.

### history-390-light / -dark
State check: VALID. The same product at 390, one card per field (label, Before, After), no sideways scroll.
- nothing found.

### history-more-1280-light / -dark
State check: VALID for the long document history (Posted, "Line 1 — Changed", a "No visible fields changed" event, "Line 2 — Changed"). Show 50 more is below the fold and is not judged.
- nothing new found. The bottom card is cut by the viewport (capture limit, not a finding).

### history-deleted-1280-light / -dark
State check: VALID. Deleted line, no Open button, Deleted event with Field | Value, Added event below.
- nothing found.

### history-deleted-390-light / -dark
State check: VALID. The same at 390 with Field / Value cards. Only the viewport is in the PNG (capture limit).
- nothing found.

### history-vendor-1280-light / -dark
State check: VALID. Vendor Changed event with Tax ID "Changed (hidden)" in the two columns; Added event.
- nothing found.

### history-loading-1280-light / -dark
State check: VALID. Three skeleton cards under the header.
- nothing new found.

### history-error-1280-light / -dark
State check: VALID. "Could not load this record's history" with Retry.
- nothing new found.

### history-empty-1280-light / -dark
State check: VALID. "No changes recorded for this record."
- nothing new found.

### history-no-access-1280-light / -dark
State check: VALID. The no-access message with the back link; no header, no events. The sidebar has no New button (the reference has one); that is the app shell for a reader with no Books access, not this checkpoint's screen, and not a finding.
- nothing found.

### history-no-access-390-light / -dark
State check: VALID. The same message at 390, on 2 lines.
- nothing new found.

## Earlier NOTEs (from `critique.md`; no shot changed them)

1. Money cells carry the currency symbol ("$900.00", "$1,250.00", "$45.00", "$864.43"): unchanged.
2. `history-more-1280-*`, Posted event: the "Sequence 0 → 21" and "Revision 2 → 3" rows are still listed: unchanged.
3. `history-loading` / `history-error` / `history-empty`: "Product or service" still shows two times in the header: unchanged.
4. `history-no-access`: message centered at 1280, left-aligned at 390: unchanged.

Light and dark: all 22 shots are legible in the two schemes. Spacing, column alignment and hierarchy agree with the reference in all states.

## For gate 3

- Show 50 more and its new loading state are in no shot. Gate 3 or the hook test (P14) must confirm that the button renders, shows the loading state, and works.
- The party contact's Open label and the inline error for value reads are in no shot. Gate 3 must confirm them from the code or a test.
- `history-more`: the Posted event lists "Revision 2 → 3", but a draft re-save reads "No visible fields changed". Check that `AUDIT_FIELDS` treats `revision` and `sequence` the same way in the two events (carried from the first critique).
