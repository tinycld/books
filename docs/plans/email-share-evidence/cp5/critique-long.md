# Gate 2 critique: email-share, checkpoint 5 — the two re-captured "long" shots

Scope: `public-long-390-light` and `public-long-1280-light`, captured again from a faked `books_invoice_public` row equal to the fixture's `INVOICE_PUBLIC_ROWS.long`. The first critique (`critique.md`) marked both INVALID. 2 built png read, 2 reference png read.

Result: 0 INVALID, 0 BLOCKING, 0 NOTE.

Accepted differences (not findings):
- No app chrome on the built page (the reference drew the card inside the Books layout; the spec says "no app chrome").
- The built dates line reads "Was due Nov 20, 2026" in the destructive color; the reference reads "Due Nov 20, 2026" in muted text. The built shot agrees with the spec for a balance above zero and a due date before today: "\"Due <due date>\" is `text-destructive` and reads \"Was due <due date>\"". The reference was drawn with an earlier "today".
- No contact block: the long row has no contact, and the reference shows none.

Measured on the built shots: the card is 560 px wide at 1280 (x 360 to 920), centered; at 390 it is 358 px wide with 16 px page padding. This agrees with the spec ("max width 560 px wide; full width with page padding on a phone").

## Per screenshot

### public-long-1280-light
State check: VALID. Long content is shown: the business name on 2 lines, "Invoice 1009 for St. Jude Community Hospital Foundation of the Greater Willamette Valley" on 2 lines, the 7-figure balance $1,230,500.50, "Total $1,846,000.00", the message on 5 lines, Download PDF.
Findings: nothing found. The line breaks of the business name, the customer line and the message are the same as the reference. The balance stays the largest text. The dates line is on one line. Nothing is cut and nothing leaves the card.

### public-long-390-light
State check: VALID. Long content is shown: the business name on 3 lines, the customer line on 2 lines, the 7-figure balance on one line, the Total line, the message on 6 lines, Download PDF.
Findings: nothing found. The business name, the customer line and the message wrap at word limits inside the card's padding, with the same breaks as the reference for the name and the customer line. The 7-figure balance at `text-3xl` fits the card width on one line and stays the largest text. Centered header text and the left-aligned message agree with the reference.
(The date that wraps to "2026" alone on a second line is the NOTE of `public-overdue-390-light` in `critique.md`; it is not counted again. The reference line fit only because it read "Due", not "Was due".)

## Not shown
- `OrgLogo`: no logo is set in the built shots or in the reference. Not judged.

## For gate 3
Nothing visible.
