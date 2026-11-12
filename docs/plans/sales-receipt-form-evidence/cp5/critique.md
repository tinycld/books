# cp5 design critique — Sales settings, hidden deposit, help

Delivers: Settings → Sales with the cards "Sales receipts" (Sales deposited to) and "Invoices and sales receipts" (Default message to customer), the receipt form hiding Deposit to live while an account is set, the default message filling a new invoice and a new sales receipt, and the help topics.

Already recorded from checkpoint 4 and not repeated here (unchanged, not worse): the header band's empty space above the Payment row's rule; Reference no.'s hint above its input; the "Tax" header wrap at 1280.

## State check

| shot | state shown | verdict |
|---|---|---|
| settings-ask-1280-light/dark | Settings → Sales, admin, select "Ask", message empty, two cards | valid |
| settings-ask-390-light/dark | same at phone width, rows layout with back arrow | valid |
| settings-set-1280-light/dark | select "1200 Undeposited funds", message filled | valid |
| settings-set-390-light/dark | same at phone width | valid |
| settings-reader-1280-light/dark | read-only rows "Sales deposited to — 1200 Undeposited funds", "Default message to customer — <text>"; rail without Access; no New button | valid (reader) |
| settings-reader-390-light/dark | same at phone width | valid |
| settings-list-390-light/dark | Settings list: Company, Accounting, Sales, Numbering, 1099s, Access; Sales summary "Sales deposited to 1200 Undeposited funds · Default message set" | valid |
| set-account-1280-light/dark | New sales receipt form; Payment row holds Payment method and Reference no. only, third cell empty; no text names the account; message prefilled | valid |
| set-account-phone-390-light/dark | same at 390; payment cells stacked under the first row | valid |
| errors-hidden-1280-light/dark | form with the red summary "Choose an active bank or Undeposited funds account." above the band; no Deposit to field | valid |

0 INVALID.

## Findings

### settings-ask-1280-light / settings-ask-1280-dark
- settings-ask-1280: Sales receipts card, "Sales deposited to" select — capped at 360 px (`max-w-[360px]`) while the "Default message to customer" textarea in the card below spans the full card width; the two inputs in one section stop at different right edges. The reference draws the select full width. — NOTE

### settings-ask-390-light / dark
nothing found

### settings-set-1280-light / settings-set-1280-dark
- settings-set-1280: same select width mismatch as settings-ask-1280 (one finding, both states). — NOTE (counted once)

### settings-set-390-light / dark
nothing found

### settings-reader-1280-light / settings-reader-1280-dark
- settings-reader-1280: read-only view — two titled cards ("Sales receipts", "Invoices and sales receipts") with one row each, where the reference shows one untitled card holding both rows. The spec names the two cards for the admin view and only says readers "see read-only rows", so no rule is broken; the titled cards keep the admin structure but cost height for two rows. Taste. — NOTE

### settings-reader-390-light / settings-reader-390-dark
- settings-reader-390: "Default message to customer" row — the value is right-aligned in the value column beside the label and wraps into six short ragged lines ("Thank you for / your business! / Keep this receipt: / returns are / accepted within / 30 days."). A message up to 4000 characters in this column would be unreadable on a phone. The reference wraps the same way, so this is the shared `ReadOnlyRow` `multiline` layout, not a reference loss; a multi-line value should drop under its label at full width on a phone. — NOTE

### settings-list-390-light / dark
nothing found (Sales sits between Accounting and Numbering; summary text as spec §3.11; other sections' summaries are data of the e2e book)

### set-account-1280-light / dark
nothing found beyond the cp4-recorded items. Deposit to absent, Payment method and Reference no. keep their cell widths with the third cell empty, no account named — matches spec §3.3 "the row holds Payment method and Reference no., the third cell stays empty so the cells keep their widths, and no text on the form names the account."

### set-account-phone-390-light / dark
nothing found. Payment cells stack under the first row; no Deposit to; legible in both schemes.

### errors-hidden-1280-light / dark
nothing found. The summary sits above the band in the red-bordered box as the reference; the final period comes from the fake's server-shaped refusal (PocketBase appends it), which is data, not layout.

## For gate 3
- set-account / set-account-phone are driven by Copy of the seeded posted receipt, and the message shown equals the default message the capture set in step 3 ("Thank you for your business! Keep this receipt: returns are accepted within 30 days."). Spec §3.5: "Copy copies the source's message". Confirm the seeded receipt's stored message is this same text; if it differs, Copy is taking the setting's default instead of the source's.
- From the capture notes: on desktop, pressing the sidebar Settings item while on Settings → Sales opened Company, and the next "Sales" rail click did not reach `/books/settings/sales` in time (capture run 2). Possible navigation defect.
- errors-hidden shows the refusal with a final period ("...account.") because the fake follows PocketBase's shape; the client-side `depositInvalid` text has none. Confirm which text the real server refusal renders in the summary and that tests compare with the period (memory p2-customers).

## Totals
CRITIQUE: 0 INVALID, 0 BLOCKING, 4 NOTE
