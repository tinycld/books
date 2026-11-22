# Design critique: bank-deposit, checkpoint 5 (Deposit notices and help)

Scope judged: the "In Deposit" notice on the read view of a deposited document, and the read bar without Edit and Void. The help topic has no screenshot and is not judged here.

The reference shows a payment (`PaymentReadView`). The build shows a sales receipt (`DocumentReadView`), as the checkpoint's Gates line states. The differences in body, tabs and bar actions come from that document kind and are not findings.

## in-deposit-1280-light

State check: VALID. A posted sales receipt (1009) that Deposit 1001 holds, with `in-deposit-notice`.

- Notice: directly below the header, above the tabs, link "In Deposit 1001" then the reason text on one line. Same structure, place and styles as the reference. Nothing found.
- Bottom bar: no Edit and no Void button; View journal entry stays. Agrees with the spec.
- in-deposit-1280-light: bottom bar — "Copy" is the filled primary button. On a document that the notice says cannot be changed, the primary weight on Copy pulls the eye more than View journal entry, which the reference shows as the primary action — NOTE

## in-deposit-1280-dark

State check: VALID. Same state as the light shot.

- Notice: the link (`text-primary`) and the muted reason text are legible on the dark surface; the border is visible. Nothing found.
- in-deposit-1280-dark: bottom bar — same primary weight on "Copy" as the light shot — NOTE (same finding, counted once)

## in-deposit-390-light

State check: VALID. Same state, phone layout.

- Notice: the link on its own line, the reason text wrapped on two lines below it, inside the page width. Same as the reference. No sideways scroll is visible.
- in-deposit-390-light: bottom bar — the bar holds only a lone outline "More" button. The reference phone bar shows "View journal entry" as a visible primary button. With Edit removed, no action of this document is visible without a press on More, and the bar looks unfinished — NOTE

## in-deposit-390-dark

State check: VALID. Same state as the light phone shot.

- Notice: legible in dark; same layout as light. Nothing found.
- in-deposit-390-dark: bottom bar — same lone "More" button — NOTE (same finding, counted once)

## For gate 3

- 390: "View journal entry" is not visible on the phone bar. The spec says "View journal entry stays". Make sure that More holds it.
- 1280 and 390: the content of More is not visible in the shots. Make sure that More holds no Edit row and no Void row for a deposited document.

## Totals

CRITIQUE: 0 INVALID, 0 BLOCKING, 2 NOTE
