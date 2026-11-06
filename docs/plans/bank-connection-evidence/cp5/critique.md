# Gate 2 critique — bank-connection checkpoint 5 (Connect, edit and disconnect dialogs)

Scope: the Delivers line only (Connect dialog, Edit bank details dialog, Disconnect dialog, the no-account message). Upload area, file rows and strip are earlier/later checkpoints and were not judged.

## State check

| shot | state shown | valid |
|---|---|---|
| connect-1280-light | Connect dialog, empty form, over the populated page | yes |
| connect-1280-dark | same, dark | yes |
| connect-390-light | Connect sheet, empty form | yes |
| connect-390-dark | same, dark | yes |
| connect-errors-1280-light | Connect dialog with "Choose the account to connect" and "Enter the last 4 digits, or leave this blank", mask "55" | yes |
| connect-errors-1280-dark | same, dark | yes |
| connect-errors-390-light | Connect sheet with both errors | yes |
| connect-errors-390-dark | same, dark | yes |
| connect-none-1280-light | Connect dialog with the "none" text, the Open Chart of Accounts link, Connect disabled, over the intro page | yes (the "none" vs "all connected" text difference is accepted by the checkpoint) |
| connect-none-1280-dark | same, dark | yes |
| connect-none-390-light | Connect sheet with the "none" text | yes |
| connect-none-390-dark | same, dark | yes |
| edit-details-1280-light | "Bank details for 1000 Business Checking", Bank name prefilled and focused, Last 4 "4821" | yes |
| edit-details-1280-dark | same, dark | yes |
| edit-details-390-light | same as a sheet | yes |
| edit-details-390-dark | same, dark | yes |
| disconnect-1280-light | "Disconnect 1000 Business Checking?" with the 1-file body, Cancel / destructive Disconnect | yes |
| disconnect-1280-dark | same, dark | yes |
| disconnect-390-light | same as a sheet | yes |
| disconnect-390-dark | same, dark | yes |

0 INVALID.

## Findings

connect-none-1280-light, connect-none-1280-dark, connect-none-390-light, connect-none-390-dark: dialog body — the build keeps the Bank name and Last 4 digits inputs (with hints) under the no-account message and link, while Connect is disabled. The reference's no-account dialog is message + "Open Chart of Accounts" + Cancel/Connect(disabled) only, with no inputs. The build therefore shows two editable fields that can never be submitted, which reads as an unfinished state and makes the phone sheet twice as tall as the approved one. — BLOCKING (reference decision: `bank-connection-reference/connect-none-*.png` show no Bank name / Last 4 digits fields; spec §3 Connect account: "the dialog shows … and a link "Open Chart of Accounts" (`books/accounts`) instead of the Account picker; Connect is disabled." — the only reason to type a bank name is to connect, which is disabled). Counted once (one cause, four shots).

connect-1280-light, connect-1280-dark: nothing found.
connect-390-light, connect-390-dark: nothing found.
connect-errors-1280-light, connect-errors-1280-dark: nothing found.
connect-errors-390-light, connect-errors-390-dark: nothing found.
edit-details-1280-light, edit-details-1280-dark: nothing found.
edit-details-390-light, edit-details-390-dark: nothing found.
disconnect-1280-light, disconnect-1280-dark: nothing found.
disconnect-390-light, disconnect-390-dark: nothing found.

Checked and clean: titles and button labels match the spec word for word; hints present under Bank name and Last 4; field errors render inline in `text-danger` with a danger border and stay legible in dark; the destructive Disconnect keeps its muted-red dark variant as the reference does; the sheet at 390 shows the handle, title, close and footer; edit mode has no Account field and autofocuses Bank name on wide (ring visible), as spec "Focus and keyboard" asks; nothing wraps or truncates badly at either width.

## For gate 3

- connect-1280-light/dark: no visible focus on the Account select after the dialog opens, while edit-details-1280 shows a focus ring on Bank name. Spec "Focus and keyboard": "Connect account opens with Account focused (core `SelectInput` `autoFocus`) on web when wide". The reference shows no ring either, so it may be that `SelectInput` draws none; gate 3 should confirm the trigger is the active element.

CRITIQUE: 0 INVALID, 1 BLOCKING, 0 NOTE

## Fix round 1 re-capture

Scope: the 12 re-captured Connect shots (`connect-*`, `connect-errors-*`, `connect-none-*`). The fix removed the Bank name / Last 4 inputs from the no-account body and shows a LoadingState while the chart loads. Edit and Disconnect shots were not re-captured and keep the first section's verdict.

### State check

| shot | state shown | valid |
|---|---|---|
| connect-1280-light | Connect dialog with the Account picker ("Choose an account"), empty Bank name and Last 4, hints, Cancel / Connect, over the populated page | yes |
| connect-1280-dark | same, dark | yes |
| connect-390-light | Connect sheet with the picker and both inputs | yes |
| connect-390-dark | same, dark | yes |
| connect-errors-1280-light | picker with danger border and "Choose the account to connect", Last 4 "55" with "Enter the last 4 digits, or leave this blank" | yes |
| connect-errors-1280-dark | same, dark | yes |
| connect-errors-390-light | same as a sheet | yes |
| connect-errors-390-dark | same, dark | yes |
| connect-none-1280-light | "Your chart of accounts has no bank or credit card account.", "Open Chart of Accounts" link, Cancel, Connect disabled; no inputs; over the intro page | yes ("none" text accepted by the checkpoint) |
| connect-none-1280-dark | same, dark | yes |
| connect-none-390-light | same as a sheet | yes |
| connect-none-390-dark | same, dark | yes |

No shot shows the loading spinner in place of the picker. 0 INVALID.

### Findings

connect-1280-light, connect-1280-dark: nothing found.
connect-390-light, connect-390-dark: nothing found.
connect-errors-1280-light, connect-errors-1280-dark: nothing found.
connect-errors-390-light, connect-errors-390-dark: nothing found.
connect-none-1280-light, connect-none-1280-dark: nothing found. The first section's BLOCKING finding is resolved: the body is message + link only, the dialog height and footer match the reference.
connect-none-390-light, connect-none-390-dark: nothing found. The sheet is now the same height as the reference sheet (message, link, footer).

Checked and clean: the picker, inputs, hints and footer are unchanged from the first capture and match the reference at both widths and both schemes; the no-account message wraps to two lines at 1280 because the "none" text is longer than the reference's "all connected" text (accepted); the link is `text-primary` and legible in dark; the disabled Connect keeps its muted tint in both schemes as the reference does; the backdrop page differs (intro vs populated) because the shot fakes an empty chart, which is the checkpoint's capture setup, not a finding.

### For gate 3

- Unchanged from the first section (Account select focus on open at 1280).

CRITIQUE (re-capture): 0 INVALID, 0 BLOCKING, 0 NOTE
