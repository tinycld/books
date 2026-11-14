# Gate 2 design critique: estimate-public-link, checkpoint 2

Scope: the Delivers line of checkpoint 2 (Copy customer link in Books; the read-only public page with its outcome, loading, not-found and load-error states). The decision block (Accept / Decline) is checkpoint 3 and is not a finding.

Read: all 42 built screenshots. Reference: 21 of the matching shots (each state at 1280 and 390, light or dark mixed). The reference shots not opened are the other colour scheme of states already compared.

Result: 0 INVALID, 0 BLOCKING, 4 NOTE.

## State check

| Shot | Widths / schemes | Shows the named state? |
|---|---|---|
| pending | 1280, 390 · light, dark | Yes. Pending estimate 1001, no outcome text. No Accept / Decline (checkpoint 3). No contact line (e2e settings have no email or phone). |
| long | 1280, 390 · light, dark | Yes. Long business name, long customer name, long message; all wrap. |
| bare | 390 · light, dark | Yes. No message, no expiry; contact line with email and phone shows (fake row). |
| accepted | 1280, 390 · light, dark | Yes. "You accepted this estimate on Oct 24, 2026." and "Accepted by …". No buttons. |
| declined | 1280, 390 · light, dark | Yes. "You declined this estimate." No reason, no buttons. |
| closed | 1280, 390 · light, dark | Yes. "Test Organization has turned this estimate into an invoice." |
| expired | 1280, 390 · light, dark | Yes. "This estimate expired on Oct 31, 2026. Contact Test Organization for a new one." |
| loading | 1280, 390 · light, dark | Yes. Card frame, spinner, "Loading estimate…". |
| not-found | 1280, 390 · light, dark | Yes. Both texts, no business name. |
| load-error | 1280, 390 · light, dark | Yes. "The estimate could not load." with Try again. |
| books-bar | 1280 · light, dark | Yes. Estimate 1001 form, bar with Copy customer link after Convert to invoice. |
| books-more | 390 · light, dark | Yes. More sheet open, Copy customer link row after Convert to invoice with the ⌥L hint. |

No screenshot is INVALID.

## Comparison with the reference

The built public page keeps every reference decision: one centered card (560 px at 1280, full width with page padding at 390), business name at the top, heading, "ESTIMATE TOTAL" label, the total as the largest text, the dates line, the message under a divider, the outcome text under a second divider, Download PDF as the last item in the card, the contact line below the card (bare). Card, border and text colours agree in light and dark. The shipping route has no sidebar, no rail and no tab bar, as the spec requires ("no sidebar, no rail, no sign-in prompt").

## Findings

- pending-1280-light, pending-1280-dark: nothing found.
- pending-390-light, pending-390-dark, accepted-390-light, accepted-390-dark, closed-390-light, closed-390-dark, expired-390-light, expired-390-dark, long-390-light, long-390-dark: dates line under the total — the line breaks before the year ("… Expires Jan 15," / "2027"), so one word stands alone on the second line. The reference has the same break. A break at the " · " separator (date and expiry on their own lines at 390) reads better — NOTE.
- long-1280-light, long-1280-dark: nothing found.
- bare-390-light, bare-390-dark: nothing found.
- accepted-1280-light, accepted-1280-dark: nothing found.
- declined-1280-light, declined-1280-dark, declined-390-light, declined-390-dark: nothing found.
- closed-1280-light, closed-1280-dark: nothing found.
- expired-1280-light, expired-1280-dark: nothing found.
- loading-1280-light, loading-1280-dark, loading-390-light, loading-390-dark: nothing found.
- not-found-1280-light, not-found-1280-dark, not-found-390-light, not-found-390-dark: nothing found.
- load-error-1280-light, load-error-390-light: nothing found.
- load-error-1280-dark, load-error-390-dark: Try again button — the outline border is almost the same colour as the card, so the button edge is hard to see in dark. This is the core outline Button and the reference shows the same — NOTE.
- books-bar-1280-light, books-bar-1280-dark: bottom action bar — with Copy customer link the bar holds eight buttons and fills the full width at 1280 with the sidebar open; the gaps between buttons look unequal (wider after Cancel and after Save, narrow around Convert to invoice / Copy customer link). The new button itself agrees with its neighbours (same outline style, height, text size) and sits after Convert to invoice as the spec says. No room is left for a narrower window — NOTE.
- books-more-390-light, books-more-390-dark: More sheet, last row — "Download PDF" has a highlight background while the other rows have none. It looks like a hover from the pointer position of the capture, not a selected state. The Copy customer link row agrees with the other rows (indent, text size, right-aligned hint) — NOTE.

## For gate 3

- books-bar-1280-*: the bar has no free width at 1280. Check what the bar does between the phone breakpoint and 1280 (tablet, or sidebar open at about 1024): overflow, wrap or cut buttons.
- books-bar-1280-*, books-more-390-*: the back link of Estimate 1001 reads "Journal entries". Possibly the path the capture took to the form; check that it is not a wrong back target.
