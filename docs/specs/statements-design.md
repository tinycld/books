# Customer statements — design

Unit p2-statements · package `books` · feature `statements`. Written in helix unattended mode on 2026-11-20 and approved by the human at the design gate on 2026-11-20: direction A (one screen), the packet's recommended answers to Q1–Q20 except Q5 (the email is filled from the statement, §3.5) and its consequence for Q11 (a statement has a number, §3.1, §4.8), and the two new answers Q21 (migration numbers, §4.2) and Q22 (files shared with p5-ap-aging, §4.9). Branch `books/p2-statements` from books `main`@328bf8bb; core `main`@3981e9b4. Source of scope: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Sales: … Statements"; "Every report, the statements included, is a published report of the core report engine"; "PDF for invoices, estimates, statements, reports (server-rendered, one template with org logo and brand color)"), §Interface ("Customer and vendor pages: … tabs (Transactions, Statements, Contacts, Details, Notes)"). A mark (Qn) names question n of the design packet.

In this document "statement" always means a customer statement. A bank statement is not part of this unit.

## 1. Goal

A Books writer makes a statement for each of many customers in one run (what each owes, or its activity for a period), sees it as it will print, saves it, and sends it to the customer by email; each customer's statements are listed on its page.

## 2. Where it lives

- **Create statements**: a new screen at `books/statements/new` (`screens/statements/new.tsx`), pushed on the current stack. It takes `?customer=<id>`.
- **One statement**: a new screen at `books/statements/<id>` (`screens/statements/[id].tsx`), pushed (Q13).
- **Statements tab** on the customer page: the fifth entry of `PARTY_TABS` (`lib/party-page-tabs.ts`), key `statements`, label "Statements", keys `Alt+5`. In `CUSTOMER_TAB_ORDER` it is second: Transactions, Statements, Contacts, Details, Notes (Q12). The vendor page does not show it.
- **Entry points** (Q11):
  - the New menu (`lib/new-actions.ts`): "Statement" in the Customers column, after Refund receipt, `href: 'books/statements/new'`, `takesCustomer: true`. So the customer page's New transaction menu lists it too and opens `books/statements/new?customer=<id>`;
  - the Statements tab's button "Create statement" (the same link with the customer).
- **Two shipped reports** (Q1), listed in the Books Reports hub and shared with every Books reader like every `books.*` report: `books.statement_balance_forward` ("Statement: Balance Forward") and `books.statement_open_items` ("Statement: Open Items").
- No sidebar entry and no Sales tab (Q11).
- **Settings → Numbering** gains a "Statements" card (the prefix and the next number of the statement sequence, §4.8).

## 3. Behavior

### 3.1 Statement types (Q2)

- **Balance forward.** For one customer and a period (start day to end day): one line "Balance forward" with the customer's balance before the start day; then one line for each posted Accounts receivable line of the customer dated in the period, oldest first, with its date, its activity ("Invoice 1042", "Payment 317", "Credit memo 3", "Journal entry JE-12"), its amount (a charge positive, a payment or credit negative) and the running balance after it; then the **Amount due**: the balance on the end day. The amount due equals the customer's Total on the Customer Balance report for the end day.
- **Open items.** For one customer and the statement date: one line for each item of the customer that is open on that day (an invoice with an open amount, an unapplied payment, an unapplied rest of a credit memo, a manual journal line), in due-date order, with its date, its activity, its due date and its open amount (a credit negative); then the **Amount due** (the sum) and an aging line: Current, 1 - 30, 31 - 60, 61 - 90, 91 and over. The amount due equals the customer's Total on the A/R Aging report for the statement date.
- A statement covers one customer row. A sub-customer gets its own statement; a parent's statement holds the parent's own lines only (Q8).
- **Statement number** (human, 2026-11-20; replaces "no statement number" of Q11). Every saved statement has a number from its own Books number sequence, document type `statement`: prefix "ST-", first number 1001, so the first statement is "ST-1001" and no statement shares a number with an invoice. The server gives the number when the statement is stored (as an estimate takes its number at its first save); a refused store takes no number. The numbers of one run are in the order the server stores the rows, which is not the order of the list. An admin changes the prefix and the next number on the Statements card of Settings → Numbering; the next number cannot be set at or below the number of a stored statement. Books never moves the next number back, so a delete does not free a number by itself. The number shows on the PDF, on the statement screen, on the customer's Statements tab and in the email subject. A preview has no number: nothing is stored.

### 3.2 Create statements: options

- The screen title is "Create statements". Focus starts on Statement type.
- **Statement type**: core `SelectInput`, "Balance forward" (default) or "Open items".
- **Statement date**: core `DateField`, default today. It prints on the statement. For Open items it is the day the items are read on.
- **Start date** and **End date**: core `DateField`s, shown only for Balance forward (Q9). Defaults: End date is today; Start date is the same day of the month before. When the user has not typed in End date, a change of Statement date sets End date to it.
- **Customer balance**: core `SelectInput`: "Open" (default), "Overdue", "All" (Q7).
  - Open: every customer whose balance is greater than zero.
  - Overdue: every customer with a posted invoice whose balance is greater than zero and whose due date is before the statement date.
  - All: every active customer, and every inactive customer whose balance is not zero.
- A change of an option keeps the ticks and the typed email addresses of the customers that stay in the list.
- Validation is one zod schema through `zodResolver`: each date is a real day (`isIsoDay`); Start date is not after End date; End date is not after Statement date. Errors show inline under the field.

### 3.3 Create statements: recipients

- Under the options the screen lists the customers that match, by name ignoring case. A sub-customer shows as "<parent>:<name>" and sorts under its parent. An inactive customer's name ends with " (inactive)".
- Columns on a wide screen: tick box, **Recipient**, **Email address**, **Balance**. The columns are flex with minimums; the heading and the rows share the style constants. Below the table's own minimum width the list draws cards: the tick box and the name with the balance at the right on the first line, the email field on the second. The list never scrolls sideways.
- **Balance** is the customer's open balance today (`books_party_balances`), in the book's currency (Q10). A credit balance shows negative.
- **Email address** is a core `TextInput` (email keyboard on native), filled with the customer's `email`. A change applies to this run only; the customer is not changed (Q6). An address that is not a valid email address shows an inline error under the field.
- Every listed customer starts ticked. A press on a row's tick box (Books `SelectBox`) ticks or unticks it. The heading holds one tick box that ticks or unticks every row; it shows the mixed state when some are ticked. On a phone the same control is a "Select all" row above the cards (lesson 28).
- With `?customer=<id>` the screen opens with Customer balance "All" and only that customer ticked; the list is scrolled to it.
- **Total.** At the top right on wide, and first on a phone: "Total balance of <n> customers" over the sum of the ticked rows' balances; "Total balance of 1 customer" for one. With no tick it reads "No customer selected" and the figure is the zero amount.
- The list is a windowed list (FlashList, as the Books lists). A run holds at most 200 ticked customers (Q15); with more, Save, Save and send and Preview are refused with "Select at most 200 customers. Narrow the list with Customer balance."

### 3.4 Create statements: actions

A sticky bar at the bottom: **Cancel** (Esc), **Preview** (⌥P), **Save** (⌘S), **Save and send** (⌘↵, the primary). Each is a core `ShortcutButton` with the screen's `scopeOwner`. On a phone the bar holds Save and send and a "More" menu (core `Menu`, a sheet) with Preview, Save and Cancel.

- **Preview** (Q16) asks the server for one PDF of the ticked customers' statements with the options on screen and stores nothing. The PDF opens in a core `Dialog` (a sheet on a phone) titled "Preview" with the page view of the document PDF view and a "Download" button; each statement starts on a new page. While the server prepares it, the button is disabled and reads "Preparing…". A refusal shows an error toast with the server's message.
- **Save** validates, then stores one statement for each ticked customer and returns to the screen the user came from, with the toast "<n> statements saved" ("1 statement saved"). While it runs, the bar's buttons are disabled and Save reads "Saving…".
- **Save and send** validates with one more rule: every ticked row has an email address ("Enter an email address or clear the tick." under the field; the first such row scrolls into view). It then saves as Save does, and sends each saved statement to its address. The button reads "Sending…". When every send succeeds the screen returns with the toast "<n> statements sent".
- **A part of the run fails.** Statements are stored first; a statement whose store was refused is not sent. When a store or a send fails, the screen stays, and a notice above the list reads "<n> of <m> statements were sent." or "<n> of <m> statements were saved.", followed by one line for each failed customer with the server's message. The rows that succeeded lose their tick, so a second press repeats only the failed rows. A stored statement that was not sent is on its customer's Statements tab as "Not sent".
- **A failed send never makes a new statement** (human, 2026-11-20; replaces "a second press stores a new statement" of the checkpoint-4 build). A statement is saved, and takes its number, once. While the screen is open it keeps, for each customer, the statement this screen saved and did not send (its id and number). Each such row stays ticked and is marked failed in the list: under its address a danger line reads "<number> not sent: <the server's message>". A second press of Save and send stores nothing for that row and sends that same saved statement (its own type and dates, as saved) to the address now in the row, so a corrected address is used; no new row and no new number. A second Save stores nothing for that row either: the statement is already saved, so the row counts as saved and loses its tick. When the send of a saved statement succeeds, the row's mark goes. A customer whose store was refused has no statement, so a second press stores it again. When the screen closes, a saved statement that was not sent stays on the customer's Statements tab as "Not sent", where the statement screen's Send… sends it again (§3.8).
- **Email is not set up.** When the server cannot send email (core `fetchEmailStatus()` answers `canSend: false`), Save and send is disabled and a line under the bar reads "Email sending is not set up". Save and Preview work.
- **Cancel**, Back and any other navigation away ask before leaving when the user changed an option, a tick or an address (core `useLeaveGuard` and its Discard dialog).
- With no ticked customer, Preview, Save and Save and send are disabled.

### 3.5 The email (Q4, Q5)

- One message for each statement, to the statement's address, with the statement's PDF attached.
- From: the server's sender address with the display name "<business name>" (`books_settings.business_name`, else the organization's name). Reply-To: the address of the user who sends.
- The subject and the message are filled by the server from the statement; the user does not edit them (human, 2026-11-20). The message is plain text (`SendRequest.TextBody`; no HTML body). Amounts print with Go `formatMoney` and days with Go `formatDay` (`server/display_format.go`), as on the PDF.
- **Subject**: "Statement <number> from <business name>", for example "Statement ST-1001 from Aspen Ridge Landscaping". A line break in the business name becomes a space.
- **Message, Open items** (each `<…>` is filled; a line in square brackets prints only under its condition):

  ```
  Hello <customer name>,

  Attached is statement <number> from <business name>.

  Statement date: <statement date>
  Amount due: <amount due>
  Past due: <past due> (oldest due date <day>)
  Open items: <count>

  The attached PDF lists each open item.

  To pay, or to ask about this statement, reply to this email[ or call <business phone>].

  <business name>
  ```

  - Past due is the sum of the four past-due aging figures of the statement (1 - 30, 31 - 60, 61 - 90, 91 and over), the same figures as the PDF's aging line. The oldest due date is the earliest due date before the statement date among the open items with an open amount greater than zero. When past due is zero or less, the line reads "Nothing is past due."
  - Open items is the count of item lines on the statement. With no item the line reads "Open items: none".
- **Message, Balance forward**: the same greeting, first sentence, closing sentences and signature, with this block between them:

  ```
  Statement date: <statement date>
  Period: <start date> to <end date>
  Balance forward: <balance before the start date>
  New charges: <sum of the period's positive amounts>
  Payments and credits: <sum of the period's negative amounts>
  Amount due: <balance on the end date>
  ```

  and "The attached PDF lists the activity of the period." in place of the open-items sentence. A period with no charge prints "New charges: $0.00"; the same for payments and credits.
- **Amount due of zero or a credit, both types**: with an amount due of zero the line reads "Amount due: $0.00. No payment is due."; with a negative amount it reads "Credit balance: <the amount, positive>. No payment is due.". In both cases the closing sentence reads "To ask about this statement, reply to this email[ or call <business phone>]."
- "[ or call <business phone>]" prints when `books_settings.phone` is not empty.
- The figures of the message are read from the same report run that fills the attached PDF (§4.4), at the time of the send, so the message and the attachment cannot differ. The stored Amount due is not used for the message.
- The attachment's name is `statement-<number>-<customer name>.pdf`, the name made as core makes a report file name (lower case, words joined by `-`), for example `statement-st-1001-aspen-ridge-landscaping.pdf`.
- The server refuses: more than 200 statements in one request; more than 500 statement emails by one user in an hour ("You have sent 500 statement emails in the last hour. Try again later."); a statement the user cannot read; a file over 10 MB.
- After a send the statement holds the day and time it was sent and the address it went to. A statement can be sent again; the latest send shows.
- **Retries** (human, 2026-11-20). Within one request the server tries the delivery of each statement at most 3 times (the first try and 2 retries, a short pause between them) when the sender returns an error (a transport or provider error, which can pass). It does not retry a refusal that cannot succeed on a retry: an address Books refuses, the hour's limit, a file over 10 MB, a statement that is not found, or a recipient the email server refused (`SendResult.FailedRecipients`, a permanent refusal), which fails at once with "The email server refused <address>. Correct the address and send again.". One statement takes one token of the hour's limit however many tries it takes. After the last failed try the statement fails with "The email could not be sent. Try again.". Each statement's tries end before the next statement's start. Once one statement of a request has failed all its tries, every later statement of that request gets one try only (the outage is known), so a request of 200 statements answers well inside the server's write timeout. A sender error that comes after the provider accepted the message is retried too, so in that rare case the customer can get the email twice.

### 3.6 The PDF

- Built on the server by the Books document template (`server/pdf_template.html`, the logo and brand color of every Books document): the business block; the title "Statement" with the statement number where the template prints every document's number (`pdfDocument.Title` and `pdfDocument.Number`: "No. ST-1001"; a preview has an empty `Number`, which prints no number); "Statement date <day>" and, for Balance forward, "Period <start> to <end>"; "To" with the customer's name, company and billing address; the big amount "Amount due"; then the type's table (§3.1): Date, Activity, Amount, Balance for Balance forward; Date, Activity, Due date, Open amount for Open items, with the aging line under it. Table headings repeat on every page; every page ends with "Page x of y".
- The lines of the table are the rows of a run of the type's shipped report (§4.3), run as the reader who asks. The PDF and the report cannot differ.
- A statement with no line prints its header, "No activity in this period." or "Nothing is open on this day.", and the amount due.
- One saved statement downloads from `GET /api/books/pdf/statement/<id>` (the route of every Books document PDF; file name as in §3.5). The file of a preview is named `statements-preview-<statement date>.pdf`.

### 3.7 Statements tab of the customer page

- Lists the customer's statements, newest statement date first, then newest created first. Columns: **Date** (the statement date), **No.** (the statement number, "ST-1001"), **Type**, **Period** ("Sep 21 – Oct 22, 2026" for Balance forward; "As of Oct 22, 2026" for Open items), **Amount due** (the figure stored when the statement was made), **Sent** ("Nov 20, 2026 to billing@aspenridge.example", or "Not sent"). Cards below the table's own minimum width: the number, the date and the type with the amount at the right, then the period and the sent line.
- A press on a row opens the statement (§3.8). A row menu (`RecordRowMenu`) holds Open, Send…, Download PDF and Delete; a reader with read-only access gets Open and Download PDF.
- The header of the tab holds the button "Create statement" (writers only).
- Empty: core `EmptyState` "No statements yet" with "Create a statement to show this customer what it owes." and, for a writer, the button "Create statement".
- Loading: the Books list skeleton of the Transactions tab. Load error: the error text with Retry (`recoverLiveQueries`).
- The tab's count is not shown in the strip.

### 3.8 One statement

- `books/statements/<id>`: a header with the customer's name (a link to its page), "Statement <number>" ("Statement ST-1001"), the type and the period; the sent line; the page view of the PDF under it. Actions: **Send…** (S), **Download PDF** (D), **Delete** in a More menu; Back (Esc) returns to where the user came from.
- **Send…** opens a core `Dialog` "Send statement" with one field, To (required, one valid email address; filled with the statement's address, else the customer's; focus on it at open with `useFocusOnOpen`), the line "Attachment: <file name>", Send (⌘↵, `Dialog.ActionButton` with `DIALOG_SUBMIT_SHORTCUT`) and Cancel (Esc). A zod schema validates To. A server refusal shows in `FormErrorSummary` and the dialog stays. On success the dialog closes with the toast "Statement sent to <address>". With email not set up, Send… is disabled with the second line "Email sending is not set up".
- **Delete** asks in a core `ConfirmDialog` "Delete statement <number>? The customer's balance does not change." and deletes the row; a sent statement can be deleted too (Q14). The screen then returns to the customer's Statements tab.
- A statement that does not exist or that the user cannot read shows `RecordNotFound`. A load error shows the error text with Retry. The PDF's own load error shows "Could not load the statement" with Retry (as `DocumentPdfView`).
- The PDF is built at each open from the ledger as it is now for the statement's dates. The stored Amount due is the figure when the statement was made; when the two differ (a back-dated post), a muted line reads "The amount due was <stored> when this statement was made."

### 3.9 Access

- Create, Save, send and Delete need Books write access (`useBooksAccess`: bookkeeper or admin); the server's rules enforce it.
- A read-only user sees the Statements tab, opens a statement and downloads its PDF. The New menu item, "Create statement", Send… and Delete are not shown. `books/statements/new` shows the Books no-write notice for such a user.
- Every statement create, send (an update of the sent fields) and delete is in the Books audit log (`audit.RegisterCollection`).

### 3.10 States of the create screen

- Loading: the options render at once; the list shows row skeletons.
- No match: core `EmptyState` in the list area: "No customer has an open balance" (Open), "No customer is overdue" (Overdue), "No customers yet" (All), each with "Change Customer balance to list more customers." The bar's actions are disabled.
- Load error: the error text with Retry (one `recoverLiveQueries` call over the merged recoveries).
- Live: a balance that changes, a new customer or a renamed one updates the list; ticks and typed addresses stay.

### 3.11 Help

- New `help/statements.md` (id `books:statements`): "To send statements to your customers…": the two types and when to use each, the dates, Customer balance, changing an address for one run, Preview, Save and Save and send, what happens when a send fails (the server tries again; the failed row keeps its saved statement and a second Save and send sends that same statement, no new number), what the email says (the subject with the statement number, the balance figures of each type, how the customer replies), the statement number and its Statements card in Settings → Numbering, where a customer's statements are, sending one again, Delete, why the amount due can differ later, the keys (`⌥P`, `⌘S`, `⌘↵`, Esc; S, D on a statement).
- `help/customer-pages.md` gains the Statements tab; `help/customers.md` and `help/reports.md` link to the topic; `help/reports.md` names the two statement reports; `help/settings.md` (Numbering) names the Statements card and says that a statement takes its number when it is saved.

## 4. Data

### 4.1 Read

- **Recipients.** One live query on `books_customers` (id, display name, parent, email, inactive) with `materialize()` of the customer's `books_party_balances` row (its id is the customer's id) and of its parent's name. The Customer balance filter and the sort run in JS over that result (the balance is a view row, not a customer field). Overdue reads a second live query: `books_invoices` with status posted, balance greater than zero and due date before the statement date, reduced to a set of customer ids (as `usePartyBalance` reads overdue).
- **Tab.** One `useLiveQuery` on `books_statements` where `customer` is the page's customer, ordered by `statement_date` and `created` descending.
- **One statement.** `useLiveQuery(… findOne())` on `books_statements` with `materialize()` of its customer (error state and Retry as the Books dialogs do).
- **Email status.** Core `fetchEmailStatus()` (`@tinycld/core/reports/lib/export-client`) in a React Query read.

### 4.2 New collection `books_statements`

One new migration, `pb-migrations/2100000033_create_books_statements.js` (Q17, Q21). Unit p5-ap-aging owns number 2100000032 and merges first. The audit-log view migration, `2100000032_create_books_audit_log.js` on main, is renamed to `2100000034_create_books_audit_log.js` with no change of content, so the view stays last. The merge of main before the PR checks the three numbers again.

| field | type | note |
|---|---|---|
| `customer` | relation → `books_customers`, required, cascade delete | |
| `number` | text, max 40 | set by the server at create: the display number ("ST-1001") |
| `sequence` | number, integer, min 0 | set by the server at create: the number without its prefix |
| `type` | select `balance_forward`, `open_items`, required | |
| `statement_date` | text day (the `DAY` pattern of Books documents), required | |
| `start_date`, `end_date` | text day; required for `balance_forward`, empty for `open_items` | checked in the Go create guard |
| `email` | email, optional | the address of this statement |
| `balance` | number (integer cents) | set by the server at create: the amount due |
| `currency` | text | set by the server from `books_settings` |
| `sent_at` | date | set only by the send route |
| `sent_to` | text, max 320 | set only by the send route |
| `created`, `updated` | autodate | |

Rules: list and view for Books `can_read`; create and delete for Books `can_write`; no update rule (only the send route updates, with the app's own save). Indexes: `(customer, statement_date)`, and a unique index on `sequence`. A Go create guard (`server/statements.go`) checks the dates (Start ≤ End ≤ Statement date), refuses client values for `number`, `sequence`, `balance`, `currency`, `sent_at` and `sent_to`, computes `balance` (the sum of `debit − credit` of the customer's `books_receivable_items` rows dated on or before the end day for Balance forward, or the statement date for Open items), and takes the number (§4.8). The guard runs inside `serialized` (`server/ledger.go`), as the estimate's create does: `allocateNumber` needs the transaction, and a refusal rolls the sequence back.

The collection is registered in `collections.ts` (`onDemand`, relation `customer`; `omitOnInsert` holds `created`, `updated` and the six server-set fields), in the audit registry (`server/audit.go`, the row's label is its `number`; field labels in `lib/audit-fields.ts`), and in the OAuth scopes (`server/oauth_scopes.go`).

### 4.3 Shipped reports (core report engine; existing API only)

`server/report_statements.go`, both `Unpublished: true`, Revision 1, shared by `server/report_shares.go` (its `books.%` filter covers them):

- `books.statement_balance_forward`, base `books.journal_lines` (as the Customer Balance): params `period` (`ParamDateRange`, default `thisMonthToDate`), `customers` (`customersParam()`); filter: the posted Accounts receivable lines (the first two terms of `receivableLines`) dated in the period, and the customer in `customers`; group `byCustomer` (open; `reports.Opening` with label "Balance forward" and the cell `balance` = the customer's net before the period start, a lookup as `generalLedgerOpening()` in `report_general_ledger.go`; a customer with an opening balance and no line in the period keeps its group, as a General Ledger section does); columns `date`, `activity` (`lineEntryTypeLabel()` and the entry number), `amount` (`debit − credit`), `balance` (`add(opening, runningSum(net))`, with `Rollup` as the General Ledger's balance column); sort by `date`, `entry.posted_at`; `detail.open` = `entryOpenPath()`; a phone `display.layouts` measured at 375 and 390 (lesson 21).
- `books.statement_open_items`, base `books.receivable_items` (as the A/R Aging): params `asOf` (`ParamAsOf`, default `today`), `customers`; filter `settled > asOf`, `date <= asOf`, the customer in `customers`; groups `byCustomer` and `byItem` (label "<kind> <number>", `having: sum(net) ≠ 0`); columns `date` (`min(date)`), `due` (`min(due_date)`), and the six `agingColumns(age, net)` columns (the five ages, blank where zero, and Total, which is the open amount), as the A/R Aging has them on every row; the PDF prints an item row's Total as its open amount and the customer row's six figures as the aging line and the amount due; sort by `min(due_date)`, `min(item_seq)`; `detail.open` = `entryOpenPath()`.

Each spec is pinned by a Go test (`reports.CheckSources`, `reports.Load`, `reports.Validate`, and runs as a Books reader: an invoice, a part payment, an overpayment, a credit memo and its application, a write-off, a void, a line before the period, a sub-customer, a reader with no Books access). The amount due of each type is compared with a Customer Balance run and an A/R Aging run of the same day. Per the human's rule (2026-11-01), an engine refusal found there is fixed in core as checkpoint 0, not designed around. Before the PDF builder reads a run, the build dumps one real run and writes against it (lesson 31).

### 4.4 Server routes (`server/statements.go`, `server/pdf_statement.go`)

These are files and one action, not record reads: no route returns or changes record data except the sent fields.

- `GET /api/books/pdf/statement/{id}`: a new entry `"statement"` of `documentKinds` (`server/pdf_kinds.go`, Collection `books_statements`); the route's own view-rule check applies.
- `POST /api/books/statements/preview`, body `{ type, statement_date, start_date, end_date, customers: [ids] }` (at most 200): one PDF, each statement on a new page; nothing stored. Books `can_write` only.
- `POST /api/books/statements/send`, body `{ statements: [{ id, to }] }` (at most 200): for each, checks that the user can read the row and has Books write access, builds the statement document, renders its PDF, fills the subject and the text of §3.5 from the same document (`statementEmail(doc)` in `server/statement_email.go`: one pure function, no second read), sends it (`mailer.DefaultSender(app)` as `mailer.FullSender`, `SendFull` with `Subject`, `TextBody`, `ReplyTo` and one `mailer.Attachment`; a returned error is retried as §3.5 "Retries" says, a `FailedRecipients` answer is not), and saves `email`, `sent_at`, `sent_to`. Answer: `{ sent: [rows], failed: [{ id, message }] }`. The client files the returned rows with `collection.accept(rows)` (`@tinycld/core/lib/server-rows`). The limit is `ratelimit.NewPerApp("books.statements.send", 500, time.Hour)` by user. When `mailer.CanDeliver(app)` is false and `mailer.CaptureLogOn()` is false, the route refuses "Email sending is not set up."
- The PDF builder (`buildStatementDocument`) loads the type's shipped spec (`reports.Load`), runs it with `reports.Run(ctx, app, reports.Request{Spec, Loaded, Params, Options, Auth: <the user>, PageCap})` for the one customer, maps the rows to the statement table and to the figures of the email (the amount due, the aging figures, the oldest past-due day and the item count for Open items; the opening balance, the charges and the payments and credits for Balance forward), and renders with `pdfrender.HTMLToPDF`. A saved statement's document carries its `number`; a preview's does not. `pdfDocument` (`server/pdf_document.go`) gains a statement table (date, activity, due, amount, balance columns, an opening line, an aging line); `server/pdf_template.html` gains its block.

### 4.5 Writes

- **Save**: one core `useMutation` generator that yields the array of `books_statements` inserts (one insert for each ticked customer that has no saved, unsent statement of this screen, ids from `newRecordId()`; parallel transactions; each row is one insert, never an insert and an update; the server stores them one after the other in `serialized` and gives each its number, which the client reads from the stored row). The outcome is read as `{ done, failed }` from the settled transactions, not from the store after a refusal. A ticked customer with a saved, unsent statement of this screen (§3.4) gets no insert: on Save it counts as saved, on Save and send its saved id goes into the send request with the row's address.
- **Saved, unsent statements of the screen**: for each customer, `{ id, number }` of the statement this screen stored and did not send, kept in the create screen's Zustand store (`stores/statements-store.ts`) for the screen's life and cleared when it unmounts; a send that succeeds removes the customer's entry.
- **Send**: a core `useMutation` whose function calls the send route with `serverFetch`, then `collection.accept(sent)`.
- **Delete**: `useMutation` with `books_statements.delete(id)`.
- The create screen holds its form through the writes with a synchronous Zustand flag set before the mutation (`stores/statements-store.ts`), so an optimistic row does not unmount the screen's notice (p1-opening-balances memory).

### 4.6 Forms

The create screen and the Send dialog are plain `useForm` + `zodResolver` forms (`lib/statement-schema.ts`). Statements are not a forms-engine host: the umbrella spec's host list does not name them, and they hold no custom fields. The recipients are a field array `{ customer, ticked, email }`; the send-only rule (a ticked row needs an address) is a `superRefine` on a hidden `intent` value (`save` or `send`) that the pressed button sets before `handleSubmit`.

### 4.7 Seed and tests

- `seed.ts` stores two statements of one seeded customer that has an open invoice (one Balance forward, one Open items), through the collection writes, both not sent, in its own block (Q22). The server numbers them. No seeded figure of another spec changes: a statement posts nothing.
- Go: the create guard (each refusal, the stored balance for both types, a client `sent_at`, `number` or `sequence` refused, a reader refused, the number taken from the `statement` sequence, a refused create takes no number, two creates get two numbers); the sequence guard (the Statements next number does not move back over a stored statement's number); the send route (each refusal, the limit, a part failure, a transient sender error retried to success, a sender error on every try failing after 3 tries, a permanent recipient refusal not retried, a Books refusal not retried, one limit token for a retried statement, the saved sent fields, the message's subject, text, Reply-To and attachment name read from the capture log); `statementEmail` for both types (the full text; nothing past due; an amount due of zero; a credit balance; no open item; no business phone; a business name with a line break); the preview route; the PDF read back with `omnidoc.OpenBytes` (both types, an empty statement, two pages, two customers in one preview); `TestRegister_BindsEachPartOnce`.
- E2e (`tests/e2e/statements-*.spec.ts`, helpers in `statements-helpers.ts`): a customer and an invoice the test creates with a unique name; create with Open and find the row by name; untick all, tick one, the total follows; change the address; Preview shows a PDF; Save and the row on the customer's tab; Save and send and the "Sent" line (the e2e server's capture log sends); a blank address refused on Save and send only; the Send… dialog on a saved statement; Delete; a read-only user (faked `books_access`, lesson 32) sees no write control; one phone run (390) of the create screen's cards, Select all and More, and of the tab's cards; the leave guard. The unit harness (`tests/accounts-form-harness.ts`) covers the part-failure notice with `refuseAfter`, and that a second Save and send (or Save) after a failed send inserts no row and sends the saved id with the row's current address. One e2e test fails a send (the send answer rewritten with `page.route`, as the capture spec's `sendFailures`), asserts the failed row's mark, presses Save and send again, and asserts that the customer has one statement, sent, with the number of the first press. An e2e test reads a statement's number from the row it made and never expects a fixed number: the e2e database is shared.
- Unit tests that list the document types gain `statement`: `tests/doc-types.test.ts`, `tests/doc-type-coverage.test.ts`, `tests/migration-doc-types.test.ts`, `tests/settings-sections-numbering.test.ts`, and the doc-type table of `server/numbering_test.go`.

### 4.8 Statement number sequence

Books' existing sequence machinery, with one new sequence; no new mechanism.

- `pb-migrations/2100000001_create_books_settings.js` is edited in place (it is unreleased, and its own comment says that a later phase adds its row there): `statement` joins the `doc_type` values of `books_doc_sequences`, and one seeded row is added: id `booksseqstatemt`, `doc_type` `statement`, `prefix` `ST-`, `next_number` 1001. A developer database needs `pnpm run db:reset` after this change.
- The create guard of `books_statements` calls `allocateNumber(tx, "statement")` (`server/numbering.go`) inside `serialized` and sets `sequence` and `number`.
- `highestSequence` (`server/sequences.go`) reads journal entries only. For the document type `statement` it reads the highest `sequence` of `books_statements` instead, so `registerSequenceGuard` refuses a next number at or below a stored statement's number with its existing text.
- `tinycld/books/lib/doc-types.ts`: `DOC_TYPES` gains `statement: { label: 'Statements', noun: 'statement' }`, and `sequenceHelper` says "saved" for `statement` as it does for `estimate`. The Numbering section of Settings draws one card for each sequence row, so the Statements card needs no other change.
- A statement is not a journal entry: `statement` is not added to `documentDocTypes`, `entry_routes.json`, `entry_type_labels.json` or the Sales lists.

### 4.9 Files shared with p5-ap-aging (Q22)

Unit p5-ap-aging also edits `tinycld/books/lib/shipped-reports.ts`, `server/register.go`, `server/registrations_test.go`, `server/oauth_scopes.go` and its test, `tinycld/books/seed.ts`, `help/reports.md`, `tests/help-reports.test.ts` and `server/report_spec_helpers.go`. This unit only appends to those files (a new line or a new block; no reorder, no rewrite of a line it does not own). p5-ap-aging merges first; the merge of main into this branch keeps both sides.

## 5. Cut

- **Transaction statement** (the third type of the source): its content is the customer page's Transactions tab and the Customer Balance report (Q2).
- The menu beside "Save and send" ("Save and close", "Save and new"): Save and Save and send both close the screen.
- "Give feedback" and the help icon of the source's header; Books help opens from the app's help.
- An editable email subject and message, and a default message in Settings (Q5): the server fills both from the statement.
- An HTML email body, and payment instructions or a payment link in the message: Books holds no such setting; the message asks the customer to reply.
- Past-due figures in the email of a Balance forward statement (that type has no aging).
- Cc, Bcc and more than one address for a statement.
- Saving a changed address on the customer (Q6); the customer form does that.
- A Statements tab in the Sales area (Q11): a statement is not a ledger document. (A statement number is in scope: human, 2026-11-20.)
- Finding a statement by its number in Books search: the number shows on the PDF, the statement screen and the customer's Statements tab only.
- A statement for a parent that includes its sub-customers (Q8).
- Scheduled or repeated statements, reminders and collection letters.
- An aging line on a Balance forward statement.
- Sending through the `mail` package's mailboxes (p2-email-share decides that for invoices; the server's own sender is used here, as core's report email does).
- Printing from the app: the PDF prints from any viewer.
- A vendor statement.

## 6. Platform notes

None new. Keyboard shortcuts (web and an iOS hardware keyboard; Android uses the visible buttons and menus) and first-input autofocus (web) have standing approval (human, 2026-11-11). The PDF page view and the download follow the signed-off document PDF view (p2-pdf, p2-invoice): an inline page on web, the cached file and the share sheet on native.

## 7. Sparks carried

1. The amount that the run bills is the largest thing on the screen and follows the ticks: the big-amount pattern of the Books bands (`PayBillsBand`, `PaymentBand`), semantic tokens only.
2. Each recipient is one calm line whose address can be corrected in place: flex columns with minimums, Books `SelectBox`, core `TextInput`; cards below the table's minimum width.

No core extension.

## 8. Non-goals

- No ledger write: a statement posts nothing and changes no balance, and no document balance is written.
- No change to the A/R Aging or Customer Balance specs, to `books_receivable_items`, or to its refresh.
- No new core component, token, route or report-engine feature.
- No use of core's `/api/reports/export` or `/api/reports/email` for a statement: the statement PDF is the Books document template, and the send is the Books route.
- No statement email text in Settings, and no change to the `books_settings` collection. (`books_doc_sequences`, in the same migration file, gains the statement row, §4.8.)
- No new numbering mechanism: `allocateNumber`, `books_doc_sequences` and the Numbering cards are used as they are.
- No change to how an estimate's or a posted document's highest number is read.
- No change to the vendor page's tabs.
- The customer's stored email address is never written by this feature.
