# Gate 2 critique: customer-pages, checkpoint 5 (Contacts tab, tab strip)

Result: 0 INVALID, 6 BLOCKING, 3 NOTE.

The 6 BLOCKING lines have one cause: the Email cell of the wide contacts table does not truncate, and its text draws into the Phone column. It shows in each wide populated shot (1280, 1600, read-only; light and dark).

## State check

| Shot | State shown | Result |
|---|---|---|
| contacts-390-light / -dark | Contacts tab, 3 cards, primary first, Add contact | valid |
| contacts-1280-light / -dark | Contacts tab, table of 3 rows, page surface with back button | valid |
| contacts-1600-light / -dark | Contacts tab, table of 3 rows, record surface beside the list, no back button | valid |
| contacts-empty-390-light / -dark | "No contacts yet" + Add contact, inactive sub-customer Northwind Boise (closed) | valid |
| contacts-empty-1280-light / -dark | same, wide | valid |
| contact-dialog-390-light / -dark | "Edit contact" sheet, primary contact Dana Whitfield, Primary on | valid |
| contact-dialog-1280-light / -dark | "Edit contact" dialog, same contact | valid |
| read-only-1280-light / -dark | Contacts tab, no New transaction, no More, no Add contact, no row menus | valid |

## Findings

### contacts-1280-light
- contacts-1280-light: table, Email column, rows 1 and 3 — the email text is not cut at the column edge. Row 1: "dana.whitfield@harborviewhospitality.com" touches "(206) 555-0142" with no gap. Row 3: "rafael.mendoza-okafor@harborviewhospit…" and "(206) 555-0168" draw on top of each other; neither can be read — BLOCKING (reference decision: `contacts-1280-light.png` truncates each email with an ellipsis inside its column, "dana.whitfield@harborviewhospitality.…", "rafael.mendoza-okafor@harborviewh…", with a clear gap before Phone; the build's Role cell does this, the Email cell does not. Also the critic's mandate: "text that wraps or truncates badly".)
- contacts-1280-light: row menu — the build shows a vertical three-dot icon; the reference shows a horizontal one. No rule. — NOTE

### contacts-1280-dark
- contacts-1280-dark: table, Email column, rows 1 and 3 — same overlap of email and phone as the light shot — BLOCKING (same basis: reference `contacts-1280-dark.png` truncates the email with an ellipsis inside its column).

### contacts-1600-light
- contacts-1600-light: table, Email column, rows 1 and 3 — row 1 email touches the phone number; row 3 email and "(206) 555-0168" overlap and cannot be read — BLOCKING (reference decision: `contacts-1600-light.png` truncates the email, "rafael.mendoza-okafor@harborviewh…", with a gap before Phone).

### contacts-1600-dark
- contacts-1600-dark: table, Email column, rows 1 and 3 — same overlap as the light shot — BLOCKING (same basis as contacts-1600-light).

### read-only-1280-light
- Tab strip and header: nothing found. Four tabs in the spec order (Transactions, Contacts, Details, Notes), Contacts selected; header has no New transaction and no More, as the reference.
- read-only-1280-light: table, Email column, rows 1 and 3 — same overlap of email and phone. The list is what a read-only user gets, so it must be readable — BLOCKING (spec 3.6: "Read-only users see the list with no actions"; reference decision on the Email column as above).

### read-only-1280-dark
- read-only-1280-dark: table, Email column, rows 1 and 3 — same overlap — BLOCKING (same basis as read-only-1280-light).

### contacts-390-light
- contacts-390-light: card 2 (Kim Tran) — the card has an empty line where the phone would be, because all cards have one fixed height. The reference card is shorter when there is no phone. — NOTE

### contacts-390-dark
- contacts-390-dark: card 2 (Kim Tran) — same empty line. — NOTE

### contacts-empty-390-light, contacts-empty-390-dark
- nothing found. (The filled Add contact button differs from the reference's outline button; lesson "Empty-state actions use a core Button" is met.)

### contacts-empty-1280-light, contacts-empty-1280-dark
- nothing found.

### contact-dialog-390-light, contact-dialog-390-dark
- nothing found. (Button text "Save" follows the checkpoint text; the reference says "Save contact". Name shows the focus ring.)

### contact-dialog-1280-light, contact-dialog-1280-dark
- nothing found in the dialog. (The table behind the dialog shows the Email overlap already listed.)

## Not findings
- Open / Overdue amounts differ from the reference: real seeded data.
- The 1600 list column (search, Show inactive, New customer, company sub-lines) differs from the reference: not delivered by this checkpoint.
- Email and phone on the phone cards are link-colored; the reference shows them muted. Spec 3.6 says "Email link, Phone link".

## For gate 3
- none visible.
