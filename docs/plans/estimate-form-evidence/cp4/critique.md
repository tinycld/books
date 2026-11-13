# Design critique: estimate-form, checkpoint 4 (Numbering, default message, help)

Scope: the Numbering card "Estimates" with its helper text, and the renamed default-message card with its note. Help topics have no screenshot and are not judged here.

Reference: `settings-{390,1280}-{light,dark}.png` (one mock with both cards; loose anchor).

## State check

| Shot | Shows the named state? |
|---|---|
| settings-numbering-390-light | Yes. Settings → Numbering, "Estimates" card first and complete. |
| settings-numbering-390-dark | Yes. Same. |
| settings-numbering-1280-light | Yes. Numbering selected in the section list, all five cards visible. |
| settings-numbering-1280-dark | Yes. Same. |
| settings-sales-390-light | Yes. Settings → Sales, card "Invoices, estimates and sales receipts". |
| settings-sales-390-dark | Yes. Same. |
| settings-sales-1280-light | Yes. Sales selected, renamed card visible. |
| settings-sales-1280-dark | Yes. Same. |

INVALID: 0.

## Findings

### settings-numbering-390-light
Nothing found.

### settings-numbering-390-dark
Nothing found.

### settings-numbering-1280-light
Nothing found.

### settings-numbering-1280-dark
Nothing found.

### settings-sales-390-light
Nothing found.

### settings-sales-390-dark
Nothing found.

### settings-sales-1280-light
Nothing found.

### settings-sales-1280-dark
Nothing found.

## Checks made (no finding)

- Card title "Estimates", fields Prefix and Next number, preview line "Next estimate: <n>", helper, Save: same structure and order as the reference card and as the adjacent Invoices, Journal entries, Sales receipts and Transfers cards. Spacing, label weight and input height are the same in all five cards.
- Helper text reads "A new prefix applies to estimates saved from now on. Numbers already issued do not change. The next number can move forward only." This agrees with the ledger decision ("estimates saved from now on"). The other cards keep "posted".
- Preview shows 1006, not the reference's 1001. This is real data (the seed made estimates through the sequence); the brief asks for presence and the "Next estimate:" prefix only. Not a finding.
- Sales card title "Invoices, estimates and sales receipts" and note "New invoices, estimates and sales receipts start with this message. You can change it on each one." agree with spec §3.5 word for word. The title stays on one line at 390.
- The message field is empty in the build and filled in the reference. This is real data, not a lost state.
- The reference shows both cards on one page with section headings; the build shows them in the real Settings sections (section list at 1280, back header at 390). This is the real shell, as the brief's stand-in note says (`SettingsMock` → the real `NumberingSection` and `SalesSection`).
- Light and dark: all text, borders and inputs are legible. The helper text wraps cleanly at 390 (3 lines) and at 1280 (2 lines).

## For gate 3

Nothing visible.

CRITIQUE: 0 INVALID, 0 BLOCKING, 0 NOTE
