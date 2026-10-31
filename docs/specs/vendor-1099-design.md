# 1099 vendor tracking and account mapping

Approved at the design gate 2026-10-30: direction A; packet Q1-Q15 as recommended; `HostSelect` overlap built now (Q16); the audit `Redact` core extension accepted (checkpoint 0). Built against books `main` 91ce648 and core `main` 1bda334. "(packet Qn)" names the approved answer of that packet question.

## Goal
Let a bookkeeper mark a vendor for 1099 reporting with its legal name and tax ID, map expense accounts to the 1099-NEC and 1099-MISC boxes, and set the 1099 reporting threshold, so the later 1099 report (p5-1099-report) has every input it needs.

## Where it lives
`books/` (package files import each other relatively):
- Vendor form: four new built-ins on the existing forms host `books:vendor` (`tinycld/books/forms/hosts.ts`), drawn by the vendor screens p3-vendors built (`screens/vendors/[id].tsx`, `new.tsx`). No new route.
- Settings section "1099s": a fifth entry in `lib/settings-sections.ts` (id `form-1099`, label "1099s", not admin-only), at `/a/books/settings/form-1099` through the existing `screens/settings/[section].tsx`, drawn by `components/settings/Form1099Section.tsx` (packet Q1).
- New files:
  - `lib/form-1099.ts` (pure, unit-tested): `BOXES_1099` (`{ key, form: 'NEC' | 'MISC', box, label }`), `BOX_1099_KEYS`, `box1099Label(key)` ("MISC 1 · Rents"), `box1099Options()` ("Not reported" first), `EXPENSE_GROUP_TYPES` (`cost_of_goods_sold`, `expense`, `other_expense`), `form1099Accounts(accounts)` (the rows the mapping card lists, in chart order with depth), `trackedVendorRows(vendors)` and `form1099Summary(settings, accounts)` (the section-list line).
  - `lib/tax-id.ts` (pure, unit-tested): `TAX_ID_TYPES` (`ein` "EIN (business)", `ssn` "SSN or ITIN (person)"), `taxIdLastFour(taxId)` ("•••6789"), `taxIdDigits(text)`.
  - `forms/vendor-1099-fields.tsx`: host components (the toggle needs none; it is a core `toggle` built-in) `LegalNameField` (over `ContactInput`, hint "The name on the vendor's W-9."), `TaxIdTypeField` (a `HostSelect`), `TaxIdField` (over `ContactInput`, `number-pad` keyboard, hint "9 digits, from the vendor's W-9."). Added to the one `components` map in `forms/ui.ts`.
  - `HostSelect` (packet Q16): p2-products-services owns it and moves it to `forms/account-fields.tsx`, exported. This unit imports it from wherever it lives on `main` at build time. If p2-products-services has not merged then, this unit only adds `export` to the existing `HostSelect` in `forms/vendor-fields.tsx` and changes nothing else in that file; the unit that merges second fixes the one import.
  - `components/settings/Form1099Section.tsx`, `ThresholdCard.tsx`, `AccountBoxesCard.tsx`, `AccountBoxRow.tsx`, `Tracked1099VendorsCard.tsx`.
  - `hooks/useThresholdForm.ts`, `hooks/useAccountBoxMutation.ts`, `hooks/useForm1099Section.ts`.
  - `lib/threshold-schema.ts` (zod: checks the threshold text and keeps it as text, because the Books settings form resets from a schema whose input and output types match; `thresholdCents` turns the checked text into integer cents for the write).
  - `lib/vendor-1099-fixture.ts` (synthetic data, imported by `seed.ts`).
  - Go `server/form1099.go` (box keys and the expense-group types, drift-tested against the migration and `lib/form-1099.ts`).
  - `help/1099-tracking.md`.
- Changed files: `pb-migrations/2100000001_create_books_settings.js`, `2100000002_create_books_ledger.js`, `2100000004_create_books_vendors.js` (edited in place, packet Q12); `forms/hosts.ts` (built-ins, columns, layout rule); `lib/vendor-columns.ts`; `server/vendors.go`, `server/accounts.go`, `server/search.go`; `lib/settings-sections.ts`, `components/settings/SectionBody.tsx`; `seed.ts`; `help/vendors.md`, `help/settings.md`.

## Behavior

Vendor form
- The default Vendor form gains, after Default expense account and before Notes: "Track payments for 1099" (a toggle, off by default), "Legal name", and the half-width pair "Tax ID type" + "Tax ID" (packet Q10).
- A host layout rule hides Legal name, Tax ID type and Tax ID while Track payments for 1099 is off. Turning it on shows them at once; turning it off hides them and keeps their stored values (packet Q9). Admins can move, relabel or change this rule in Settings → Forms like any rule.
- Legal name: plain text, up to 200 characters, hint "The name on the vendor's W-9.". It is not required.
- Tax ID type: core `SelectInput` with "Choose…" (empty), "EIN (business)" and "SSN or ITIN (person)".
- Tax ID: text, `number-pad` keyboard, hint "9 digits, from the vendor's W-9.". It is not required, so a vendor can be tracked before its W-9 arrives (packet Q7). The server removes spaces and dashes, refuses anything that is not 9 digits ("A tax ID has 9 digits.") and stores it with the dashes of its type (EIN `12-3456789`, SSN `123-45-6789`). A tax ID with no type is refused on Tax ID type ("Choose whether the tax ID is an EIN or an SSN."). After a save the form shows the stored, dashed value.
- The tax ID shows in full in the vendor form to everyone who can open the vendor, read-only users included (packet Q8).
- Save, refusals, discard check and read-only mode are those of the vendor form (p3-vendors); field refusals land on their fields through the host's `onError`.
- Deleting a vendor is not affected: tracking for 1099 does not make a vendor "in use" (the bill and expense units add those refusals).
- Federated search also matches a vendor's legal name; it never matches or shows the tax ID (packet Q13).
- The audit log records that a vendor's tax ID changed, but never its value: the stored entry holds the fixed marker `[redacted]` for both the old and the new value, the audit-log screen shows `[redacted]` in place of the values, and a deleted vendor's snapshot shows the marker. The company tax ID in Books settings is logged the same way.

Settings → 1099s
- The Settings section list shows "1099s" with the summary "Threshold $2,000.00 · 3 accounts mapped" (the threshold in the book's currency; "No accounts mapped" when none).
- The section has three cards, in this order: Reporting threshold, Accounts reported on 1099s, 1099 vendors.
- Reporting threshold card (packet Q6):
  - Books admins see a form: "1099 reporting threshold" (money text input, the book's currency), the note "Vendors paid less than this in a calendar year are left out of the 1099 report. Check the IRS instructions for the current amount.", and a Save button. zod (`lib/threshold-schema.ts`) refuses an empty or malformed amount ("Enter an amount, like 2,000.00"), a negative amount ("The threshold cannot be negative"), and an amount above `maxStoredAmount` cents ("Use a smaller amount"). Save writes `threshold_1099` through `useMutation`; a server refusal shows in the card's root-only `FormErrorSummary` (the Books settings pattern, `lib/root-errors.ts`). The form resets to the saved value.
  - Other Books users see a read-only row "1099 reporting threshold — $2,000.00".
- Accounts reported on 1099s card (direction A):
  - Lists every account whose type is Cost of goods sold, Expense or Other expense: the active ones, plus any inactive one that has a box (dimmed, with "Inactive"). Chart order, indented by depth, labelled `number name`.
  - Each row has a box select: "Not reported" first, then NEC 1 · Nonemployee compensation, MISC 1 · Rents, MISC 2 · Royalties, MISC 3 · Other income, MISC 5 · Fishing boat proceeds, MISC 6 · Medical and health care payments, MISC 8 · Substitute payments in lieu of dividends or interest, MISC 9 · Crop insurance proceeds, MISC 10 · Gross proceeds paid to an attorney, MISC 11 · Fish purchased for resale (packet Q4).
  - Choosing a box saves at once (the AccessRow pattern): `useMutation` updates that account's `form_1099_box`. The select is disabled while its write runs. A refusal shows under the row and the select goes back to the stored box (the live value feeds the row's form). A write with no answer shows "Your change wasn't saved: the server could not be reached.".
  - One account has at most one box; several accounts may share a box. A sub-account has its own box; it does not take its parent's.
  - Books writers (Bookkeeper and Admin) edit the boxes; read-only users see the box label as text.
  - Above the list: "Payments posted to these accounts count toward the vendor's 1099 box." Empty (no expense accounts): "Add an expense account to the chart of accounts first." with a "Chart of accounts" button (writers).
- 1099 vendors card:
  - Lists every vendor with Track payments for 1099 on, sorted by display name (case-insensitive, then id), inactive ones included and marked "Inactive". Each row: display name, the legal name below in muted text when it differs, and on the right the tax ID's last four digits ("•••6789") or a "Missing tax ID" chip (`border border-warning/40 bg-warning/10`, `text-foreground`, the fill of core `PendingBadge`).
  - Above the list: "5 vendors tracked · 1 missing a tax ID".
  - Tapping a row opens that vendor (`books/vendors/<id>`, a push). Closing the vendor returns to the Vendors list, as for any link from outside the list (packet Q15).
  - Empty: "No vendors are tracked for 1099 yet." with "Turn on Track payments for 1099 on a vendor." and a "Vendors" button.
  - The list is not windowed: it holds only tracked vendors (packet Q11 explains the bound).
- Loading: the section shows `LoadingState` until settings, the accounts query and the vendors query are ready. A failed query shows "1099 settings could not be loaded." with Retry, which rebuilds the failed queries with one `recoverLiveQueries` call.
- Phone: the section is the pushed settings page (existing shell). Account rows stack: the account label on one line, the box select full width below it. Vendor rows keep name left and tax ID status right.

Accounts
- An account with a box must have an expense-group type. The account guard refuses a write that sets a box on another type, and a type change of a mapped account to a non-expense type, with the root refusal "Only expense accounts can be reported on a 1099. Set this account to Not reported in Settings → 1099s first." (packet Q5). The Account panel shows it in its summary.
- Making an account inactive keeps its box. Deleting an account removes its box with it.

## Data
- `books_vendors` (edit 2100000004 in place): `track_1099` bool; `legal_name` text max 200; `tax_id_type` select max 1, values `ein`, `ssn` (empty = none); `tax_id` text max 11, pattern `^(\d{2}-\d{7}|\d{3}-\d{2}-\d{4})?$` (the stored, dashed form; the guard normalizes before the schema check). Rules unchanged.
- `books_accounts` (edit 2100000002 in place): `form_1099_box` select max 1, values `nec_1`, `misc_1`, `misc_2`, `misc_3`, `misc_5`, `misc_6`, `misc_8`, `misc_9`, `misc_10`, `misc_11` (empty = not reported). Rules unchanged (writers update accounts).
- `books_settings` (edit 2100000001 in place): `threshold_1099` number, onlyInt, min 0, max 9007199254740991; the migration's row sets 200000 (packet Q6). Rules unchanged (admins update).
- Go guards, each inside `serialized`:
  - `validateVendor` (server/vendors.go) gains `validate1099Fields`: trims `legal_name`; normalizes `tax_id` (spaces and dashes removed, 9 digits, dashed by type) and refuses as above. Every message ends with a period. The guard runs on every create and update, so the stored form is always dashed.
  - `validateAccount` (server/accounts.go) refuses a box on a non-expense type (create, update, type change).
  - `server/form1099.go`: `boxes1099` and `expenseGroupTypes`; a test checks the box keys against the migration and `lib/form-1099.ts`.
- Forms host `books:vendor`: columns gain `track_1099`, `legal_name`, `tax_id_type`, `tax_id`; built-ins `track_1099` (kind `toggle`, label "Track payments for 1099"), `legal_name` (custom `LegalNameField`), `tax_id_type` (custom `TaxIdTypeField`), `tax_id` (custom `TaxIdField`), each inserted before `notes`; layout fields `tax_id_type` and `tax_id` half width; layout rule `hide_1099_details` (core rule keys allow only lowercase letters, digits and underscores): when `track_1099` `is_false`, hide `legal_name`, `tax_id_type`, `tax_id`.
- `lib/vendor-columns.ts`: `vendorColumnsSchema` gains `track_1099` (boolean), `legal_name` and `tax_id` (optional text), `tax_id_type` (enum or ''); `EMPTY_VENDOR_FIELDS` gains `track_1099: false`, `legal_name: ''`, `tax_id_type: ''`, `tax_id: ''`.
- Queries (one per need, explicit `queryKey`, row types derived from the queries):
  - Settings: the existing `useBooksSettings`.
  - Accounts card: one `useLiveQuery` over `books_accounts` filtered to the expense-group types (`inArray(type, EXPENSE_GROUP_TYPES)`), shaped by `form1099Accounts`.
  - Vendors card: one `useLiveQuery` over `books_vendors` where `track_1099 = true`, ordered by display name.
- Search: vendors and customers share `searchParties` (server/search.go); `partySource` gains a `matchColumns` list so the vendor source matches `c.legal_name` as well, and customers keep their three columns. The hit's title and subtitle do not change.
- Audit (core extension, checkpoint 0): core `audit.CollectionConfig` gains `Redact []string`. A change to a listed field is still logged, but both its old and new values, and its value in a delete snapshot, are replaced by a fixed marker. Core names no package; its tests use a fictional collection. Books registers `books_vendors` with `Redact: []string{"tax_id"}` and `books_settings` with `Redact: []string{"tax_id"}` (the company tax ID). The core PR (branch `books/p3-vendor-1099` in `tinycld/`) merges before checkpoint 1. Small core change: an added optional field, so no `exclusive` claim.
- Report engine: no source is registered here; p5-1099-report adds `track_1099`, `legal_name`, `tax_id_type` and `form_1099_box` to the vendors and accounts sources (packet Q14).
- Seed: `lib/vendor-1099-fixture.ts` marks five seeded vendors as tracked (an EIN vendor, an SSN sole proprietor, an attorney firm, one with no tax ID, one inactive), with synthetic tax IDs, and maps seed accounts by number: 6100 Rent → `misc_1`, 6200 Software Subscriptions → none, 6210 Design Tools → `nec_1`. `seed.ts` writes them after the vendors and accounts.

## Cut
- Form printing, e-filing, W-9 import, the "Prepare 1099s" wizard and the review-and-file steps of the screenshots (spec: Later).
- The 1099 summary and detail report and how the threshold applies per box: p5-1099-report.
- Direct sales boxes (NEC 2, MISC 7): checkboxes on the form, not amounts from accounts (packet Q4).
- Federal income tax withheld (NEC 4, MISC 4): Books has no backup withholding (packet Q4).
- MISC 12-14 (section 409A deferrals, excess golden parachute payments, nonqualified deferred compensation): payroll-adjacent, payroll is Later (packet Q4).
- A 1099 badge, column or filter in the Vendors list: the 1099 vendors card lists them (packet Q11).
- Uniqueness of tax IDs among vendors: two vendors may share a tax ID (two locations of one business).
- CSV export of recipients, "Include more recipients", "Open transaction list by vendor" (screenshots): the report unit covers listing payments.
- Masking the tax ID in the vendor form (packet Q8).
- Client-side format checks of the tax ID: a server rule, as email and website on the vendor form.

## Platform notes
None. Every behavior here is the same on web and native. The vendor page's no-slide-on-web item was signed off for p3-vendors and is unchanged.

## Sparks carried
- "Each account's 1099 box is readable at a glance in one list": expressible — `SectionCard` with rows `border-b border-border`, labels `text-foreground`, depth indent through padding, core `SelectInput` per row; inactive rows `opacity-60` with a `text-muted-foreground` "Inactive".
- "A missing tax ID stands out without opening the vendor": expressible — a "Missing tax ID" chip `rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5` with `text-xs font-medium text-foreground` (core `PendingBadge`'s fill) in the row's trailing slot; no new token. `global.css` defines no `warning-soft` token (phase 3 found it draws no fill), and plain `text-warning` on white is too faint, so neither is used.

## Non-goals
Tax computation, payments counting by payment date, card payment exclusion (all report-side), vendor balances, W-9 requests by email, TIN matching with the IRS, state 1099 boxes, 1099-K, 1099-INT and other forms, a "Taxes" sidebar area.
