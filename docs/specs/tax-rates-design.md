# Tax rates and groups

Spec for auto-helix unit p2-tax-rates, approved at the design gate on 2026-11-04: direction A (a Taxes page with one card per agency, edits in dialogs), and the recommended answer to each of the packet's 16 open questions. Sources: the Books design spec (Scope, Ledger rules, Forms, Interface), the glossary, `books-quickbooks-fixes.md`, the master plan, and the code at books main 0377271 / core 3eb7915e.

## Goal

Let a Books writer set up the sales tax the business collects (agencies, rates, groups, a default for new sales, and the liability account each agency's tax goes to) and mark which products and customers are taxable, so the invoice and sales receipt units can charge tax and the sales tax liability report can total it per agency.

## Where it lives

- Route `/a/books/taxes`: `books/tinycld/books/screens/taxes.tsx`. One screen; every edit is a dialog (a bottom sheet on phones). No child route.
- Sidebar: a **Taxes** entry (lucide `Percent` icon) in `lib/shell-nav.ts`, drawn after the Accounting group and before Settings, `available: true`. No Lists hub card and no + New action.
- `books:product` host: one new built-in, `taxable`.
- `books:customer` host: four new built-ins, `tax_exempt`, `exemption_reason`, `exemption_number`, `default_tax_rate`.

## Vocabulary

- **Tax agency**: the government body the business pays sales tax to. It names one liability account; all tax collected for it posts there.
- **Tax rate**: a percentage collected for one agency.
- **Tax group**: two to ten tax rates charged together as one choice (for example state + county + city). Its percentage is the sum of its rates.
- "Rate or group" is one choice on a customer, on the default, and later on an invoice.

Glossary change (books `GLOSSARY.md`): **Tax Rate**: "A percentage collected for one Tax Agency. A Tax Group combines several Tax Rates into one choice." New **Tax Agency**: "The government body sales tax is paid to. Its tax posts to one liability Account." (The current entry says a rate is tied to one liability account; it now is, through its agency.)

## Behavior

### The Taxes page

- The page title is "Sales tax". Under it, for a writer, one row of actions: **Add agency**, **Add group**, and a **Show inactive** chip. A read-only user sees the page with no actions, no row menus and no default picker (the default shows as text).
- **Default for new sales** card, at the top once at least one active rate exists: a `SelectInput` of every active rate and group (rates first, grouped under their agency name; then groups), "None" first. Choosing one saves at once; the chosen row also shows a "Default" badge in its list row. Help text: "Invoices and sales receipts start with this tax unless the customer has its own default."
- **One card per agency**, in name order (caseless). The card title is the agency name; under it "Tax goes to <number> <account name>" (the liability account). A writer's card has a menu: Edit agency, Make inactive / Make active, Delete. Inside the card, one row per rate of that agency in name order: name, percentage (right-aligned, tabular figures, up to four decimals with trailing zeros dropped, e.g. "8.25%", "8.875%", "0%"), the Default badge when it is the default, an "Inactive" badge when shown, and a writer's row menu (Edit, Make default / Remove default, Make inactive / Make active, Delete). Under the rows, a writer sees **Add rate**, which opens the rate dialog with this agency chosen. An agency with no rates shows "No rates yet."
- **Tax groups card**, after the agency cards: one row per group in name order: name, combined percentage, and a muted second line listing its rates ("Colorado state 2.9% + Denver city 4.81%"), badges as for rates, and the same row menu. While fewer than two active rates exist, the card shows "Add at least two rates to combine them." and Add group is disabled.
- Inactive agencies, rates and groups are hidden until Show inactive is on; then they show with an "Inactive" badge, muted. An inactive agency's card lists its rates (all inactive or active) while shown. Show inactive is screen state in a Zustand store (`stores/taxes-store.ts`), not persisted.
- **Empty**: no agency at all. A writer sees "Which agencies do you collect sales tax for?" with the line "Add each state, county or city agency you file sales tax with. Then add the rates it charges." and a core Button **Add agency**. A read-only user sees "No sales tax is set up yet."
- **Loading**: `LoadingState` until the agencies, rates and access load. **Load error**: a `ListBanner` ("Sales tax could not be loaded.") with Retry through `recoverLiveQueries`.
- **Offline / writes unavailable**: the action buttons, row menus' write items and the default picker are disabled (`writesAvailability`), as other Books lists.
- A **row action refusal** (make inactive, delete, default) shows in a `ListBanner` with the server's message and a dismiss button, keyed by record id (`useRecordActions` shape).
- Wide and phone show the same structure. On a phone the cards fill the width (16 px gutter), the action row wraps under the title, row menus open as menu sheets, and dialogs open as bottom sheets. The New FAB stays on this page (it is not a record page).

### Agency dialog

- Title "Add agency" / "Edit agency". Fields: **Name** (required, trimmed, 1–200 characters, unique among agencies ignoring case: "An agency named “X” already exists."), **Liability account** (required).
- Liability account options: active accounts of type Other current liability, in chart order, indented by depth (`SelectOption.indent`), labelled "<number> <name>". When adding, the first active account with detail type Sales tax payable is preselected.
- When no active Other current liability account exists, the select is replaced by the note "Your chart has no sales tax liability account." and a button **Create Sales tax payable account**, which inserts one account (name "Sales tax payable", number "2200" when no account has that number, otherwise blank, type Other current liability, detail Sales tax payable) and selects it. A refusal shows in the dialog's error summary.
- Buttons: Cancel, Save (Add agency / Save changes). Save is one insert or update through `useMutation`; the dialog closes on success; a server refusal shows in the dialog's `FormErrorSummary` (root errors only; field errors inline).
- An edit dialog shows a stored account that has become inactive as the select's value and keeps it on save; the server checks the account only when it changes.

### Rate dialog

- Title "Add rate" / "Edit rate". Fields: **Name** (required, trimmed, 1–200, unique among all rates and groups ignoring case: "A tax rate or group named “X” already exists."), **Rate** (required, a percentage from 0 to 100 with at most four decimals, typed as text, e.g. "8.875"; a "%" suffix inside the input), **Agency** (required; active agencies in name order; preselected when opened from an agency card).
- A live line under Rate: "Tax on $100.00: $8.88" (computed with the shared tax helper; blank while the rate is invalid).
- Save, Cancel and refusals as the agency dialog.

### Group dialog

- Title "Add group" / "Edit group". Fields: **Name** (as rate), **Rates** (a `MultiSelectInput` of active rates, each labelled "<rate name> <percent> · <agency name>", in agency then name order; 2 to 10 must be checked: "Choose at least two rates." / "A group holds at most ten rates.").
- A live line: "Combined rate: 8.71% · Tax on $100.00: $8.71" (each rate rounded separately, then added; see Data, tax math).
- An edit dialog keeps a stored rate that has since become inactive checked and listed (with "inactive"), so saving does not drop it; the server checks only the rates added by the change.

### Row actions and their refusals (server-enforced; the page shows the message)

- Delete agency: refused while any rate names it: "This agency has N tax rates. Delete them or move them to another agency first." Otherwise a confirm dialog ("Delete agency “X”?").
- Make agency inactive: refused while an active rate names it: "Make its N active rates inactive first."
- Delete rate: refused while a group names it: "This rate is in the group “G”. Remove it from the group first." (one group named; "in N groups" when several). Refused while it is the default: "This is the default for new sales. Choose another default first." Customers whose default it is lose that default (PocketBase clears a non-required reference). Later units append their document tables to `taxRateReferences` so a rate on a document cannot be deleted.
- Make rate inactive: refused while an active group names it ("Remove it from the group “G” or make the group inactive first.") or while it is the default (same message as delete).
- Delete group: refused while it is the default. Make group inactive: refused while it is the default.
- Make default: only an active rate or group; the server clears the previous default in the same write. Remove default leaves no default.
- The delete confirm reuses `DeleteRecordDialog` (lines explain what the delete does; refusals show as returned by the server).

### Products (`books:product`)

- New built-in **Taxable** (`taxable`, toggle), after Income account, with help text "Charge sales tax on this item when it is sold." Hidden for bundles (`PRODUCT_HIDDEN_BUILTINS.bundle`); a bundle's lines take their taxability from each item.
- A new Non-inventory item starts taxable; a new Service starts not taxable (`lib/product-defaults.ts`). Changing the type in the new-product form does not flip a value the user already set.
- The server refuses `taxable = true` on a bundle ("A bundle has no tax setting of its own; each item in it has one.").

### Customers (`books:customer`)

- New built-ins, before Notes: **This customer is tax exempt** (`tax_exempt`, toggle); **Exemption reason** (`exemption_reason`, custom `ExemptionReasonField`, a select); **Exemption certificate number** (`exemption_number`, text, up to 100); **Default sales tax** (`default_tax_rate`, custom `TaxRateField`: "None" first, then active rates and groups as in the default picker; a stored inactive choice stays shown and is kept).
- Layout: reason and certificate number side by side (half width). Rule `hide_exemption`: when `tax_exempt` is false, hide reason and certificate number. Rule `hide_default_tax`: when `tax_exempt` is true, hide default sales tax.
- Server: an exempt customer must have a reason ("Choose an exemption reason."); a default tax rate must exist and be active when it changes. Values of hidden fields stay stored (Books refuses rather than restores); the invoice unit ignores the default of an exempt customer.
- Exemption reasons (`lib/exemption-reasons.ts`, drift-tested against the migration's select values): Resale, Federal government, State or local government, Tribal government, Nonprofit organization, Educational organization, Agricultural, Manufacturing, Direct pay permit, Other.

### Help

- New `help/sales-tax.md` ("To collect sales tax, …": add an agency, add its rates, combine rates in a group, set the default, mark products taxable, mark a customer exempt; what each refusal means). Update `help/products-services.md` (Taxable) and `help/customers.md` (exemption, default sales tax). Link from the page title row with core `HelpIcon topic="books:sales-tax"`.

## Data

### Migration `pb-migrations/2100000007_create_books_sales_tax.js` (new; Books is unreleased)

`books_tax_agencies` (rules READ for list/view, WRITE for create/update/delete, the constants of 2100000004):
- `name` text required max 200; `account` relation → `books_accounts`, required, no cascade; `inactive` bool; `name_key` text hidden (set by the guard, `nameKey`), `sort_key` text (set by the guard); autodates.
- Indexes: unique `name_key`; `sort_key, id`.

`books_tax_rates` (same rules), one collection for rates and groups:
- `type` select required `rate` | `group` (fixed after create).
- `name` text required max 200; `name_key` hidden, unique across both types; `sort_key`.
- `rate_ppm` number, onlyInt, 0–1 000 000: the rate in parts per million of the taxable amount (1% = 10 000; 8.875% = 88 750). 0 on a group.
- `agency` relation → `books_tax_agencies`, no cascade; required for a rate, empty on a group (guard).
- `components` relation → `books_tax_rates` (self), maxSelect 10, no cascade; 2–10 distinct `rate`-type ids on a group, empty on a rate (guard).
- `is_default` bool; partial unique index `WHERE is_default = 1` as the backstop of the guard's swap.
- `inactive` bool; autodates.

Added to existing collections in the same migration (a relation needs the target collection, which 2100000003 and 2100000005 predate):
- `books_products.taxable` bool.
- `books_customers.tax_exempt` bool, `exemption_reason` select (the ten keys above, maxSelect 1), `exemption_number` text max 100, `default_tax_rate` relation → `books_tax_rates`, no cascade.

Generated types (`pbSchema.ts`) pick the fields up on the next generate.

### Server guards (`books/server/sales_tax.go`, all through `bindSerializedGuard` / `serialized`)

- Agency: name trimmed and unique (`nameKey`); account exists, has type `other_current_liability`, and is active, checked when it changes; delete and inactive refusals above.
- Rate/group: type fixed; name unique across the collection; a rate needs an agency that exists and is active when it changes, and an empty `components`; a group needs `rate_ppm = 0`, no agency, and 2–10 distinct components that are rates (not groups), each active when the change adds it; `is_default` only on an active row, and setting it clears the previous default inside the same serialized write; inactive/delete refusals above; `taxRateReferences` (`{collection, field, message}`, like `productReferences`) starts with the groups' `components`.
- Accounts (`server/accounts.go`): an account an agency names cannot be deleted ("This account is the liability account of N tax agencies…"), made inactive while an active agency names it, or changed away from Other current liability while any agency names it.
- Products (`server/products.go`): a bundle's `taxable` stays false.
- Customers (`server/customers.go`): exempt needs a reason; `default_tax_rate` exists and is active when it changes.
- Registrations: both collections in `audit.RegisterCollection` (label from `name`, redact `sort_key`) and in the books OAuth scopes (`server/oauth_scopes.go`, read/write). Not in Books search.

### Tax math (the one shared helper, pure)

- `lib/sales-tax.ts`: `parseRatePercent(text) → ppm | null` (string arithmetic, no float multiply; at most four decimals; 0–100), `ratePercentText(ppm)`, `taxOn(taxableCents, ppm)` — integer cents, half away from zero, exact for any taxable amount up to 2^53−1 (split the amount into `q·1 000 000 + r` so no product exceeds 2^53), `groupTax(taxableCents, componentPpms) → cents[]` (each component rounded separately; the group's tax is their sum), `groupPpm(componentPpms)`.
- Rule for later units (contract): tax is computed per rate on the document's total taxable amount for that rate (not per line), each component of a group rounded separately, half away from zero.
- Go mirror `books/server/sales_tax_math.go` (`taxOn`, `groupTax`) for the invoice unit's server-side recompute; both sides run the same vectors from `books/server/testdata/sales_tax_vectors.json` (vitest reads it too).

### Client reads and writes

- Collections in `collections.ts`: `books_tax_agencies`, `books_tax_rates` (`onDemand`, `omitOnInsert: ['created','updated','name_key','sort_key']`, no relations).
- Page reads: one live query of agencies with each agency's rates materialized (subquery on `books_tax_rates` where `agency = agency.id`, ordered by `sort_key`), and one live query of groups with their component rates materialized; accounts for the account line through the same `books.form.accounts` query key that `forms/account-fields.tsx` uses (`useFormAccounts`). Every `useLiveQuery` passes an explicit `queryKey`. Tens of rows: the whole collections load.
- Writes (`useMutation` generators): agency insert/update/delete, rate/group insert/update/delete, `is_default` and `inactive` updates, the one-tap account insert. Row actions through `useRecordActions` (one write at a time, refusals keyed by id, `SERVER_UNREACHED`).
- Forms: `useForm` + `zodResolver`; schemas in `lib/tax-schemas.ts` (`agencySchema`, `rateSchema`, `groupSchema`). No hand-rolled validation. Server refusals through the Books refusal handlers (`record-refusals`, `rootErrorOnly`).
- Dialog state (which dialog, which record, the agency preselected for a new rate) in `stores/taxes-store.ts` with Show inactive; reset when the screen loses focus (lesson: screen-scoped open surfaces close on blur).

### Seed and fixture

- `lib/tax-rates-fixture.ts` (typed against the generated types): agencies "Colorado Department of Revenue" (→ 2200) and "City and County of Denver" (→ 2200), "Old county agency" (inactive, no rates); rates "Colorado state" 2.9%, "Denver city" 4.81%, "RTD transit" 1%, "Adams County" 0.75%, "Retired rate" (inactive), and a long name; groups "Denver combined" (state + city + RTD, default) and "Adams County combined". Edge rows: a 0% rate, a four-decimal rate (8.875%).
- `seed.ts` creates them, and `lib/seed-accounts.ts` gains `2200 Sales tax payable` (other_current_liability / sales_tax_payable); the plan greps every spec that counts seeded accounts or trial-balance rows first. Seeded products get `taxable` (non-inventory on, services off); one seeded customer is tax exempt (Resale) and one has default "Denver combined".

## Cut

- Filing and returns: the returns table, filing periods, due dates, overdue status, "View tax return", status and period filters (spec Scope: "No filing").
- Amount owed per agency and per period on this page: the sales tax liability report (p5-sales-tax-liability) owns it, from tax lines tagged per agency.
- A guided multi-step sales tax setup and the "outside your home state" question: the empty state's one question and the Add agency dialog cover first use.
- A built-in directory of agencies: agency names are typed; a directory needs upkeep per jurisdiction.
- Address-based (automatic) tax calculation and economic nexus: needs a jurisdiction rate service; not in the spec.
- Tax on purchases (bills, expenses) and use tax.
- Rate effective dates and rate history: posted documents keep their own amounts, and the invoice unit snapshots the rate (see Contracts).
- Search, sorting and batch actions on the Taxes page: tens of rows grouped by agency.
- Sub-customer inheritance of exemption; tax on shipping; a per-line tax code beyond taxable yes/no.
- A Lists hub card and a + New action for tax rates.
- The promotional banner (books-quickbooks-fixes: no payment-service upsells).

## Contracts for later units

- p2-invoice / p2-sales-receipt: the header's tax choice is one `books_tax_rates` relation (rate or group), defaulting to the customer's `default_tax_rate` (unless exempt), else the `is_default` row, else none; a line's taxable checkbox defaults to the product's `taxable` (a bundle line from its items); an exempt customer's lines start not taxable. Tax uses `taxOn` / `groupTax` per component; each component posts a credit to its agency's `account`. Each tax line stores the rate id, the agency id, and `rate_ppm` at posting (a snapshot), so a later edit of the rate never moves history. Append the line/document tables to `taxRateReferences`.
- p5-sales-tax-liability: groups the posted tax lines by their stored agency, then rate.
- p2-pdf: prints the rate or group name and its percentage.

## Platform notes

None. Every part runs on web and native: core `Dialog` (a bottom sheet on phones), `SelectInput`, `MultiSelectInput`, `Menu`, `Toggle`, `TextInput`.

## Sparks carried

- Agency as one block (expressible): the Books `SectionCard` pattern, title `text-base font-bold text-foreground`, account line `text-sm text-muted-foreground`, rows `border-b border-border`.
- Aligned percentages (expressible): right-aligned `tabular-nums` column.
- Plain-question first visit (expressible): an empty block with a core `Button`.

## Non-goals

Paying sales tax (a payment is an expense, check or journal entry against the agency's liability account in other units), tax reports, multi-currency rates, tax-inclusive prices, Canadian/VAT tax codes, importing rates from QuickBooks (the importer unit).
