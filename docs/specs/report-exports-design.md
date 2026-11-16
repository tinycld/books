# Report exports

## Goal
A reader of any report downloads it as a PDF, an Excel (.xlsx) or a CSV file, or emails that file, from the report view.

## Design decisions (design gate)
Human, 2026-11-15: direction A; core checkpoint 0 signed off (small, no `exclusive`); every open question as recommended, with two changes:
- Q3: add Excel (`.xlsx`), written in Go with omnidoc `pkg/xlsx` (v1.2.0, already in core's `go.mod`). Formats are PDF, Excel and CSV.
- Q13: the server names the file, with a semantic name made from the report's name and its date (see Download). It is not editable.

## Where it lives
Reports are core. The feature is a core change (checkpoint 0) and a small Books part.

Core (`tinycld/core`):
- `server/reports/export.go` — the two routes, the full-report read, limits, audit rows.
- `server/reports/export_format.go` — Go text of a cell, a row label, a column heading, the period and the zone line; the same output as `reports/lib/format.ts`.
- `server/reports/export_csv.go`, `server/reports/export_xlsx.go`, `server/reports/export_pdf.go`, `server/reports/export_pdf.html` — the three writers and the page template.
- `server/reports/export_email.go` — the send, the per-user limit.
- `server/pdfrender/` — HTML to PDF with omnidoc (moved from Books `server/pdf_render.go`) and the download file name header (moved from Books `server/pdf_routes.go`).
- `lib/save-file.ts` — save bytes as a file: a Blob download on web, a cache file and the share sheet on native (moved from Books `hooks/usePdfDownload.ts`), and the file name from `Content-Disposition` (moved from Books `lib/pdf-download.ts`).
- `reports/lib/export-client.ts`, `reports/hooks/useReportExport.ts`, `reports/components/export/ReportExportMenu.tsx`, `reports/components/export/ReportEmailDialog.tsx`.
- `reports/components/ReportView.tsx` and `reports/hooks/useReportView.ts` gain the Export item.
- `reports/lib/fixtures/format-cases.json` — one case list that the vitest suite and the Go suite both read.
- `help/reports.md` — a section "Download or email a report".

Books (`books/`):
- `server/pdf_render.go`, `server/pdf_routes.go` call core `pdfrender`; `hooks/usePdfDownload.ts`, `lib/pdf-download.ts` call core `save-file`. No behavior change.
- `help/reports.md` links to the core section.
- `tests/e2e/report-exports.spec.ts` (test titles start with `report-exports:`).

## Behavior

Export menu
- The report toolbar has one new button, "Export", after "Copy link". It is shown for a saved report in the main view when the report is not being edited. The drill panel has no Export.
- The button opens a core `Menu` with four items in this order: "Download PDF", "Download Excel", "Download CSV", "Email report…".
- When the toolbar does not fit (a phone), "⋯" lists the four items as its own entries.
- Export is offered to every reader who can open the report. The file holds what that reader's run returns, never more.
- "Copy link" is unchanged. It is the "link" of this unit.

Download
- A press on "Download PDF", "Download Excel" or "Download CSV" asks the server for the file with the view's current state: params, sort, hidden columns, number format, folds, the reader's day, time zone and 12- or 24-hour clock.
- While the server prepares the file, the Export button is disabled and reads "Preparing…".
- On web the browser saves the file. On native the share sheet opens with the file.
- The server names the file semantically from the report's name and its date: `<report name>-<date part>.<pdf|xlsx|csv>`. The name is the report's saved title (not its id or key), in lower case, words joined by `-`, characters other than letters, digits and `-` removed (letters of any script are kept), at most 80 characters. The date part is the report's period (`2026-01-01-to-2026-11-15`), the as-of day of an as-of report (`as-of-2026-11-15`), or the reader's day for a report with no date param. Example: `profit-and-loss-2026-01-01-to-2026-11-15.pdf`. The download, the email attachment and the dialog's attachment line use the same name.
- A refusal or a failure shows an error toast with the server's message ("Could not create the file" as its title). The report stays as it was.
- A report in the state loading, error, timeout, no-access, incomplete, missing or invalid has the Export button disabled. An empty report can be exported: the file holds the headings and the empty text.

The PDF
- Paper: Letter. Portrait when every shown column fits at 9 pt; else landscape; else the type steps down to 7 pt; else the columns continue on further pages, each of which repeats the label column.
- First page, above the table: the org logo (when one is set), the heading (the source's heading, else the organization's name), the report title, the period in words, "Times in <zone>" when a shown column is a date-time, "Amounts in thousands" when that option is on, and one line that names every param other than the period with its value ("Rows: Non-zero · Accounts: All income accounts").
- The run's notices print under that header, one per line.
- The table holds the rows the view shows: the same folds, sort and hidden columns. Column headings repeat on every page.
- Rows keep their weight and rules: group and computed rows semibold; a rule above a subtotal; a heavier rule above a total; 12 pt of indent per depth level.
- Cells read as on screen: the number format options (divide by 1000, without cents, minus or parentheses, negatives in red), currency symbols on subtotal and total rows, percent with one decimal, dates and date-times in the reader's zone, bucket labels in words.
- Every page ends with "Page x of y" and the day and time the file was made, in the reader's zone.
- Figures are plain text: no links.
- An empty report prints the header and the view's empty text.

The CSV
- UTF-8 with a byte order mark, comma separated, CRLF line ends, quoted by RFC 4180.
- Line 1 holds the column headings: the row-label column first, then every shown column in view order.
- Then one line per row, with every group open, in report order: group, detail, opening, subtotal, computed and total rows.
- Values are raw: money as a decimal number with two places, a period and a leading minus, no symbol and no thousands separator; the number format options do not apply; percent as a number (12.5); a date as `YYYY-MM-DD`; a date-time as `YYYY-MM-DD HH:MM` in the reader's zone; a bool as `TRUE` or `FALSE`; a bucket label in words, as shown.
- A money column whose rows carry different currencies is followed by a column "<heading> currency" with each row's ISO code.
- A text cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading apostrophe, so a spreadsheet does not run it as a formula.
- No header lines, no notices, no page text.

The Excel file
- Written in Go with omnidoc `pkg/xlsx` (`xlsx.New()`, `SheetEdit`, `Save`). The client never makes the file.
- One sheet, named after the report title (cut to 31 characters, characters Excel refuses in a sheet name removed).
- Above the table: the heading, the report title, the period in words, and the params line, as in the PDF header; then one empty row; then the column headings. The heading row is frozen, so it stays in view while the user scrolls.
- The rows are the CSV's rows: every group open, in report order.
- Cells are typed, so the spreadsheet can calculate: money and numbers are numbers (`SetNumber`) with a two-place number format; percent is a number with a percent format (12.5 % is stored as 0.125); a date is a date (`SetDate`); a date-time is a date-time in the reader's zone; a bool is a bool; text and bucket labels are text. A text cell is never stored as a formula.
- Group, subtotal, computed and total rows are bold; subtotal and total rows have a rule above them; the label of each row is indented by its depth level.
- A mixed-currency money column gets a "<heading> currency" column, as in the CSV.
- Column widths fit the headings and values, up to a maximum width.

Limits
- The server reads the whole report, page by page, as the reader.
- A PDF of more than 5 000 rows is refused: "This report has more than 5,000 rows. Narrow the period or download CSV."
- A CSV or Excel file of more than 50 000 rows is refused: "This report has more than 50,000 rows. Narrow the period."
- An export that takes longer than 60 seconds is refused: "The report took too long to export."
- No file is ever cut short without a refusal.

Email
- "Email report…" opens the dialog "Email report": a core `Dialog`, which is a bottom sheet on a phone.
- Fields: To (required; one or more addresses separated by commas, semicolons or spaces), Cc (optional, same form), Subject (required, at most 200 characters), Message (plain text, at most 5 000 characters), Attach as (PDF, Excel or CSV; PDF first).
- Defaults: Subject "<report title> — <period in words>"; Message "Hello,\n\nAttached is the <report title> report of <heading>, <period in words>.\n\n<sender's name>"; Attach as PDF. To and Cc are empty.
- Under the fields one line names the attachment: the file name the server will use.
- The To field has focus when the dialog opens. Send is ⌘↵; Cancel is Esc.
- Validation is a zod schema: every address is a valid email address; To and Cc together hold at most 10 addresses. Field errors show inline; server refusals show in `FormErrorSummary`.
- Send disables the buttons and reads "Sending…". The server makes the file as a download does, with the same limits, and sends one message with the file attached.
- The message comes from the server's sender address, with the display name "<sender's name> via <organization name>" and Reply-To the sender's own address.
- On success the dialog closes and a toast reads "Report sent to <first address>" or "Report sent to <first address> and <n> others".
- On a refusal the dialog stays open with every typed value and shows the server's message.
- Server refusals: more than 10 addresses; a file over 10 MB ("The file is too large to email. Download it instead."); more than 20 report emails by this user in an hour ("You have sent 20 report emails in the last hour. Try again later."); the download limits above.
- When the server cannot send email, "Email report…" stays in the menu, disabled, with the second line "Email sending is not set up". The server also refuses a send in that state.
- No address is remembered between sends.

Access and audit
- The routes take a signed-in session only. An OAuth token, a signed-out request and a disabled account are refused. A reader who cannot open the report gets "You no longer have access to this report".
- Every download and every sent email writes one core audit row: action `report.export` or `report.email`, the report's id and title, the format, the row count, and for an email its recipients. It shows in Settings → Audit log.

States
- Offline: the Export button and the dialog's Send are disabled.
- The export does not rerun or change the report on screen.

## Data
- No new collection and no new field. One core migration adds the values `report.export` and `report.email` to the `audit_logs.action` select, because a value the select does not list fails the save (human decision 2026-11-16). Nothing is stored except the audit row (`audit.Log`).
- `POST /api/reports/export`, body `{ reportId, params, options, format, hour12 }` where `params` and `options` are the run endpoint's (`options` carries expand, collapse, sort, today, timeZone and display). Answer: the file bytes with `Content-Disposition`.
- `POST /api/reports/email`, the same body plus `{ to, cc, subject, message }`. Answer: `{ sent: true, recipients: <count> }`.
- `GET /api/reports/email-status`. Answer: `{ canSend: boolean }`. True when `mailer.CanDeliver` is true, or when the server's mail capture log is on (dev and e2e).
- `format` is `pdf`, `xlsx` or `csv`.
- The server loads the report with the run endpoint's own check (`viewableSpec`) and reads it with `reports.Run`, one call per page with the page cursor, as the reader. The CSV and Excel reads set `ExpandAll`.
- The file name comes from one Go function (`exportFileName`) used by download and email; a Go test covers period, as-of, no-date, non-Latin and over-long titles.
- The text of each cell comes from `export_format.go`. `format-cases.json` lists cells, labels, headings and periods with their expected text; the vitest suite runs it against `lib/format.ts` and the Go suite against `export_format.go`, so the two cannot drift.
- The client calls the routes with `serverFetch` inside `useMutation` (core `lib/mutations`), reads the bytes, and hands them to `saveFile`.
- These are files and one action, not record data: no pbtsdb collection is read or written by this feature.

## Cut
- A print button: the PDF prints from any viewer; a browser print of the app page is web-only.
- A public link for people with no account: out of scope in the report engine design; "Copy link" stays the link.
- A preview page before the download or the send: the report on screen is the preview.
- An editable file name: the server names the file.
- Orientation, paper size and "what to include" options: the server picks the orientation; the paper is Letter.
- Scheduled or repeated emails: out of scope in the report engine design.
- Remembered recipients and a recipient picker from contacts.
- Export from a hub row and from the drill panel: the full report is one press away.
- The gear icon, "Add notes", "Edit titles": Customize exists; the others were cut in the report shell.
- Sending through the mail package's mailboxes: core cannot name a package; the server's own sender is used.

## Platform notes
None new. A download is a browser save on web and the share sheet on native. ⌘↵ and Esc in the dialog, and focus on To at open, are the standing approvals for Books forms (2026-11-11).

## Sparks carried
1. Finished-document page — the PDF's first page: logo and brand color from `branding.Load`, heading, title and period centered, ink on white.
3. Complete email form — default values in `useForm`.
Spark 2 was dropped at triage. No design-system extension.

## Non-goals
- No change to the run endpoint, the report spec, the result shape or the report table.
- No client-made file: the client never formats a CSV, an Excel file or a PDF, and the server never accepts rows from the client.
- No export of an unsaved draft.
- No new permission level: who can open a report can export it.
- No change to Books document PDFs (invoice, estimate, sales receipt) beyond where their shared code lives.
