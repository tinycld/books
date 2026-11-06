# Checkpoint 7 — design critique (critic on fable)

Inputs: spec, lessons, `capture.json`, the 12 built shots in this directory, and the register (`account-register-reference/populated-*`), transfer form (`transfer-reference/filled-*`) and journal entry (`journal-entries-reference/posted-*`) references.

Not covered by a screenshot (behavior or text; e2e and gate 3 cover them): the help topic `help/transfers.md`, the Journal Entries row-menu Edit routing, Post & new keeping `?from`.

## register-1280-light / register-1280-dark
State check: VALID. Business Savings register, populated (posted TR-1, Opening balance row); header shows "This month", primary "New journal entry", secondary "Transfer". The added button keeps the reference's header structure.

Findings: nothing found.

## register-390-light / register-390-dark
State check: VALID.

Findings:
- register-390: header, control row — "Transfer" wraps alone onto a third line under "This month ▾ / New journal entry", so the two write actions sit on different rows — BLOCKING (spec §3 "Elsewhere in Books": "The register header shows a "Transfer" button next to "New journal entry""). Keep the two write buttons together on one row.
- Out of scope (earlier unit): a blank band between the TR-1 row and the "Opening balance" row.

## filled-1280-light / filled-1280-dark
State check: VALID. New transfer opened from the register (`← Register`), From 1010 Business Savings with its balance, To 1000 Business Checking with its balance, amount, today's date, memo, Draft badge, help icon, header amount, action bar.

Findings: nothing found (the amount shows its blurred form; per the plan that does not count).

## filled-390-light / filled-390-dark
State check: VALID.

Findings: nothing found.

## entry-type-1280-light / entry-type-1280-dark
State check: VALID. Journal entry view of posted TR-1; detail row "Type: Transfer, Date, Auto-reverse on, Posted by"; Void + Edit, no Reverse.

Findings:
- entry-type-1280: detail row, "Auto-reverse on: None" — shown for a transfer, which can never auto-reverse — NOTE.
- entry-type-1280: header back link reads "Journal entries" although the view was reached from the transfer's "View journal entry" — NOTE.
- entry-type-1280: title "Journal entry TR-1" next to "Type Transfer" — two labels for one record; spec-consistent — NOTE.

## entry-type-390-light / entry-type-390-dark
State check: VALID.

Findings: nothing found beyond the three NOTEs above.

Summary: 1 BLOCKING (phone register header), 3 NOTEs (journal entry view of a transfer). All 12 shots valid.

## Re-check after the fix (a fresh critic on fable)

Fix: the register header's two write buttons are one group, so they wrap together. The four `register-*` shots were re-captured.

- register-390-light, register-390-dark, register-1280-light, register-1280-dark: VALID; nothing found. "Transfer" is an outline button next to the primary "New journal entry" at both widths (spec §3). Both buttons fit on one line at 390 with equal height; the button and filter heights line up at 1280; legible in dark.
- Out of scope (earlier unit): at 390 the Opening and Ending balance blocks are top-aligned, where the reference centres the opening block against the large ending figure.
