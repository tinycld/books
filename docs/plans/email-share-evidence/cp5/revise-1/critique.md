# Gate 2 critique: email-share, checkpoint 5, revise 1 (state "settled")

Scope: the new public invoice state `invoice-public-settled` (cp5-fix-r2 item 3; spec §3.5 "Settled"). No reference exists for this state. The nearest decisions are the paid reference (`email-share-reference/public-paid-*`) and the built paid shots (`email-share-evidence/cp5/public-paid-*`).

Basis used:
- Spec §3.5: "**Settled** … the amount line (`invoice-public-settled`) reads "No payment is due." (`text-foreground`: no payment covered it) with "Total <total>" under it."
- Fix item 3: "reading "No payment is due." in the same layout as the paid state (the amount line, then "Total <total>" under it; the line in `text-foreground`, not `text-success`".
- Spec §3.5 frame: "one centered card (max width 560 px wide; full width with page padding on a phone), `OrgLogo` and the business name on top, no app chrome, system light and dark".

## public-settled-390-light.png

State check: VALID. Shows the settled state: "Invoice 1014 for Delta Freight Partners", amount line "No payment is due.", "Total $215.50" below it, the dates line, Download PDF. No "Paid in full".

Findings: nothing found.
- Amount line is the largest text of the page, in the foreground color (near black), not green. Agrees with the spec.
- Order and spacing agree with the built paid shot at 390: business name, heading, amount line, Total, dates, Download PDF.
- Card is full width with page padding (16 px each side). The amount line stays on one line; no wrap, no truncation.
- Dates line reads "Due Nov 2, 2026" in muted text, not destructive. Correct for a zero balance with a past due date.

## public-settled-390-dark.png

State check: VALID. Same content as the light shot, in dark colors.

Findings: nothing found.
- Amount line is the light foreground color, legible on the card. Muted lines and the link are legible.
- The card border is faint but agrees with the paid reference in dark.

## public-settled-1280-light.png

State check: VALID. Shows the settled state, no app chrome.

Findings: nothing found.
- Card is centered and 560 px wide (x 360 to 920). Same frame as the built paid shot at 1280.
- Hierarchy agrees with the paid layout: amount line largest, Total under it, dates, Download PDF.

## public-settled-1280-dark.png

State check: VALID. Same content as the light shot, in dark colors.

Findings: nothing found.

## Not findings (recorded for the driver)

- No message block and no divider: the seeded invoice has no message. The spec shows the message only "when it is not empty". The built paid shot shows the divider and message with the same card, so the part exists.
- No contact block below the card and no logo: the same as the built paid shots of this checkpoint (the e2e book has no email, phone or logo). The contact block is not exercised by this state's shots.

## For gate 3

Nothing visible.

CRITIQUE: 0 INVALID, 0 BLOCKING, 0 NOTE
