# Gate 2 critique: email-share, checkpoint 5 (public invoice page and help)

Scope: the customer's invoice page at `/p/books/invoices/<token>` and its states. Help topics have no screenshot. 22 built png read, 22 reference png read.

Result: 2 INVALID, 0 BLOCKING, 2 NOTE.

Accepted data differences (capture notes, not findings): "Test Organization" in place of "Hartwell Supply Co."; no contact block (e2e `books_settings` has no email or phone); invoice numbers; no app chrome (the reference drew the card inside the Books layout).

Measured on the built shots: the card is 560 px wide at 1280 (x 360 to 920), centered; at 390 it is 358 px wide with 16 px page padding. This agrees with the spec ("max width 560 px wide; full width with page padding on a phone").

## Per screenshot

### public-390-light, public-390-dark, public-1280-light, public-1280-dark
State check: VALID. Part-paid open invoice: "Balance due" $1,311.77, "Total $2,111.77" under it, "Due Dec 20, 2026" not red, message, Download PDF.
Findings: nothing found. The balance is the largest text. Light and dark are legible. At 390 the dates line fits on one line with about 8 px to spare (see the NOTE on public-overdue-390-light).

### public-open-1280-light
State check: VALID. Balance equals total, no Total line, "Due Dec 20, 2026" in muted text.
Findings: nothing found.

### public-overdue-1280-light
State check: VALID. "Was due Nov 20, 2026" in the destructive color, the rest of the line muted.
Findings: nothing found.

### public-overdue-390-light
State check: VALID.
Findings:
- public-overdue-390-light: dates line under the balance — the line wraps inside the date: "Invoice date Oct 21, 2026 · Was due Nov 20," then "2026" alone on a second line, in red. The reference did not wrap only because its dates were shorter ("Oct 6"). Each date must stay whole: break at the "·" (two no-wrap parts, or two lines on a phone). — NOTE

### public-paid-390-light, public-paid-390-dark, public-paid-1280-light, public-paid-1280-dark
State check: VALID. "Paid in full" in the success color, "Total $1,344.00" under it, the past due date not red, message, Download PDF.
Findings: nothing found. The green is legible in light and dark.

### public-void-390-light, public-void-1280-light
State check: VALID. Business name, "Test Organization voided this invoice. No payment is due.", no amounts, no PDF.
Findings: nothing found. Same structure and spacing as the reference.

### public-replaced-390-light, public-replaced-1280-light
State check: VALID. "This invoice was replaced by invoice 1003." and the button "Open invoice 1003". (The correction keeps the number, so old and new are both 1003; this is data.)
Findings: nothing found.

### public-loading-1280-light
State check: VALID. Card frame, spinner, "Loading invoice…".
Findings: nothing found.

### public-error-390-light, public-error-1280-light
State check: VALID. "The invoice could not load." and "Try again".
Findings: nothing found.

### public-not-found-390-light, public-not-found-1280-light
State check: VALID. "This link is not valid." and "Ask the business that sent it for a new link."
Findings: nothing found.

### public-long-1280-light
State check: INVALID. The name says long content. The shot shows an ordinary part-paid overdue card: a short business name, a customer name that fits on one line, no message, a 4-figure amount. Nothing wraps and nothing is stressed. The reference "long" state has a business name of 2 lines, a customer name of 2 lines, a message of 5 lines and a 7-figure balance.
Not critiqued.

### public-long-390-light
State check: INVALID. The shot shows only a long customer name (2 lines). The long business name, the long message and the 7-figure amount of the reference "long" state are not shown, so the wrap of the header, of the message and of the largest text at 390 is not proved.
Not critiqued. (Its one visible defect, the date that wraps, is the NOTE on public-overdue-390-light.)

To make the two "long" shots valid: fake the `books_invoice_public` read with the fixture's long row (`fakeRecords`, as the loading and load-error shots do). The seed has no such invoice.

## Not shown in any built shot
- Contact block ("Questions? Contact <business>" with the mailto and tel link buttons, below the card) — the reference shows it in the open, paid, overdue, void and replaced states; no built shot shows it, because the e2e settings row has no email or phone. Its look, its place below the card and its dark colors are not proved by this capture. One shot with a faked view row that has `business_email` and `business_phone` proves it. — NOTE
- `OrgLogo`: no built shot and no reference shot shows a logo (none is set). Not judged.

## For gate 3
Nothing visible.
