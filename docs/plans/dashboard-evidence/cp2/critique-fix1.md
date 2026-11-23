# Design critique: dashboard, checkpoint 2, gate 2, fix round 1

Scope: only the four `prefs-error` shots captured again after the fix (every amount draws masked while the preference is not loaded or its read failed). Judged: how the masked card reads. Not judged: the mask itself (spec §3 Hide amounts), names and numbers (D8), the setup card (D13), the missing Customize button and the four later widgets (D7). The NOTEs of `critique.md` are not repeated.

The 4 built shots were read with their 4 reference shots.

## State check

| Shot | Shows the named state? |
|---|---|
| prefs-error-390-light | Yes. Banner "Your dashboard settings could not load." with Retry, switch disabled, default arrangement (Invoices card), amounts masked. |
| prefs-error-390-dark | Yes. Same. |
| prefs-error-1280-light | Yes. Same, card in column 1 of two. |
| prefs-error-1280-dark | Yes. Same. |

INVALID: 0.

## Findings

- prefs-error-390-light: header switch and Invoices card — the "Hide amounts" switch draws off (disabled) while all five amounts draw as the mask, and the banner text does not say that amounts are hidden until the settings load. The switch and the card disagree, and the user gets no reason for the dots. The spec gives no text for this, so there is no rule behind it — NOTE. The same applies to the other three shots; it is counted once.
- prefs-error-390-dark: nothing more.
- prefs-error-1280-light: nothing more.
- prefs-error-1280-dark: nothing more.

What reads correctly in the masked card, in light and dark:

- The leading mask keeps the figure's size (D4) and the "Unpaid" label under it; the card's hierarchy is the same as in the `hidden-amounts` shots.
- The count line "13 overdue invoices" stays, in the danger tone (spec: "Counts … stay").
- The bar stays drawn with both parts (spec: "Bars and columns stay drawn").
- The four small masks are right-aligned on their rows (left-aligned for Overdue), on the same baselines as the amounts in the reference. No row changes height and nothing wraps.
- The mask has the foreground tone in both themes and is legible in dark.
- The banner, Retry, the disabled switch and the one-card default arrangement are as in the first capture and as the reference decided.

No table or grid scrolls sideways at 390 or 1280.

## For gate 3

- None.

## Verdict

CRITIQUE: 0 INVALID, 0 BLOCKING, 1 NOTE
