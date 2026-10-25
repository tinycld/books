# Journal Entry screens

## Goal
List, create, post, edit, reverse, and void manual journal entries, with an optional auto-reverse date, on web and native.

## Where it lives
`books/tinycld/books/`:
- `screens/entries/index.tsx` (`/a/books/entries`), `screens/entries/new.tsx` (`/a/books/entries/new`, optional `?replaces=<entryId>`), `screens/entries/[id].tsx`. The static `new` wins over `[id]`.
- `components/entries/` (EntriesScreenView, EntryToolbar, EntryTable, EntryRow, EntryCard, EntryStatusBadge, EntryEmptyState, EntryForm, EntryHeaderFields, EntryLineTable, EntryLineRow, EntryLineCard, EntryTotals, EntryActionBar, EntryReadOnlyView, ReverseDialog, VoidDialog, DeleteDraftDialog), `hooks/` (useEntriesScreen, useEntriesQuery, useEntryForm, useEntrySave, useEntryActions, useEntryDetail), `lib/entry-schema.ts` (zod), `lib/entry-lines.ts` (pure line math over integer cents), `lib/entry-messages.ts`, `stores/entries-ui-store.ts` (list filter and status chip).
- `lib/shell-nav.ts`: `SIDEBAR_ENTRIES` entry `entries` and `NEW_ACTIONS` entry `journal-entry` flip to `available: true`.
- `components/register/EntryDrawer.tsx`: an "Open entry" link to `books/entries/<id>`, for any access level.
- `help/journal-entries.md` (topic) plus links from `help/account-register.md`, `help/navigating-books.md`.
- Package files import each other relatively, never `~/tinycld/books/...`.

## Behavior
List (`entries/index`)
- Header (outside the scroll area): title "Journal entries", the "New journal entry" button (writers only), a search box (number or memo), and status chips All, Draft, Posted, Void.
- Wide: a table with columns Date, No., Type, Memo, Status, Total. Memo takes free space; Total never shrinks and is right aligned; the header is inside the scroller and sticky (shared cell style constants). Phone: a card per entry, Total under the memo on the right. Rows are 44pt minimum; a press (or Enter/Space on web) opens `entries/[id]`.
- Order: entry date newest first, then created time. Drafts without a number show "Draft" in No.; a voided entry shows "Void" in Status and keeps its number.
- Type is Journal entry, Reversal, Void reversal or Auto reversal; a reversal shows "Reverses JE-1046".
- Row menu (writers): Open, Edit (posted only), Reverse (posted, not already reversed), Void (posted), Delete (draft). Menu presses stop propagation to the row.
- Empty (no entries at all): "No journal entries yet" with "New journal entry" for writers, a one-line explanation for read-only users. Empty (filter or search matched none): "No entries match" with a "Clear filters" button.
- Loading: `LoadingState`. Error: alert "Could not load journal entries" with Retry (reloads the collections).
- A list with more than the row window shows rows through `useRowWindow`; the list never loads more than the filter asks for (status, search, and an entry-date range default "This fiscal year" via the register range presets).

Entry screen (`entries/new` and `entries/[id]` of a draft)
- Header outside the scroll area: back link "Journal entries", title "New journal entry" or "Journal entry" (draft) with a Draft badge, and the big total (the larger of debits and credits) at top right.
- Fields: Date (required, default today), Journal no. (read-only text "Assigned when posted"), Memo (multi-line), Auto-reverse on (optional date; helper "Posts a reversing entry on this date").
- Line table (wide): columns #, Account, Debit, Credit, Memo, and a trailing 44pt line menu (Move up, Move down, Delete line). Phone: each line is a card with Account, then Debit and Credit side by side, then Memo and the menu. New entries start with two blank lines; "Add line" appends one; a draft line count above 200 is refused by the server and shown.
- Amount cells are text inputs that accept "1,234.50" or "$1,234.5" (via `parseMoney`), show the formatted amount on blur, and hold one side: typing a value in Debit clears Credit and the reverse (by the field's `onValueChange`, never `watch`/effect).
- Totals strip (outside the scroll area, above the action bar): Debits, Credits, and "In balance" (success) or "Out of balance by $x" (destructive). Sums are integer cents in `lib/entry-lines.ts`; a sum above `maxStoredAmount` shows "Too large" and blocks Save and Post.
- Action bar (sticky, outside scroll): Cancel, Save draft, Post, Post & new (wide shows all; phone shows Cancel, Save draft, Post, with "Post & new" in an overflow menu). Cancel with unsaved changes asks to discard.
- Validation is zod with `zodResolver`. Save-draft schema: valid date, at most 200 lines, each line has an account (blank lines are dropped on save), amounts parse, one side per line, auto-reverse date (if set) after the entry date. Post schema adds: at least two lines with an amount, debits equal credits. Server refusals (closed books, inactive account, amount too large, the close-date message) go through `handleMutationErrorsWithForm` into `FormErrorSummary`, with line errors under the line ("Line 3: ...").
- Save draft: creates the entry (status `draft`, origin `manual`) then its lines in order (position = index) in one `useMutation` generator; on an existing draft it inserts new lines, updates changed lines, deletes removed lines. After save a new entry moves to `entries/[id]`. Post: save, then set `status: posted`; on success the screen shows the read-only view with the assigned number. A failed post leaves the saved draft and shows the server message.
- Post & new: after a successful post, opens a fresh `entries/new`.
- Editing a draft: the same screen at `entries/[id]`; "Delete draft" in the header More menu (confirm dialog), writers only.

Entry screen (`entries/[id]` of a posted or void entry), read-only
- Header: back link, title "Journal entry JE-1046", a status badge (Posted / Void), the total.
- Details: Date, Memo, Auto-reverse on (with "Reversed on <date> by JE-1051" when settled, or "Will reverse on <date>"), posted by and when, voided by and when (when void), a link "Reverses JE-1046" when it is a reversal, a link "Reversed by JE-1051" when it has been reversed, a link "Replaces JE-1046" when it is a correction.
- Lines: read-only table or cards with the same columns, plus the totals strip (always "In balance").
- Actions (writers): Edit, Reverse, Void, in the action bar on wide and the More menu plus Edit on phone. Read-only users see none.
- Edit opens `entries/new?replaces=<id>`: a prefilled draft form headed "Edit JE-1046" with a note "Posting this replaces JE-1046 under the same number. The original is voided." Nothing is written until Save draft or Post. Saved with `replaces`; posting it voids the original and takes its number (server). Deleting that draft leaves the original untouched.
- Reverse: a dialog "Reverse JE-1046" with a Reversal date (zod: not before the entry date), default the first day of the month after the entry (or today when later), and a Memo prefilled "Reversal of JE-1046". Confirm creates the reversal draft (origin `reversal`, `reverses` set, no lines) and posts it; the server writes the mirrored lines. If the post is refused, the draft reversal is deleted and the message shows in the dialog. Success opens the new entry.
- Void: a confirm dialog "Void JE-1046?" stating "A reversing entry is posted in the original period. The number is kept." Confirm sets `status: void`. Refusals show in the dialog (closed period, already reversed by JE-n).
- Void reversal entries cannot be reversed, voided or edited; the screen shows them read-only with no actions (matches the server).
- A draft entry's lines never appear in the register; a posted entry's lines appear on post (realtime), a void entry's lines stay with their reversal.

States and access
- Level none sees nothing from Books (shell). Read-only: list and read-only entry views, no New button or action bar actions; `entries/new` for a read-only user shows "You need bookkeeper access to create entries" with the back link. Bookkeeper and admin: everything above. Close-date overrides are not exposed here (a refusal shows the server message that names the admin step).
- Entry not found (bad id): "This entry does not exist" with the back link.
- Draft opened by someone else: allowed for any writer (draft rules are not owner-scoped).

## Data
- Reads (on-demand, filtered): `books_journal_entries` for the list (where `status` / `date` range; `or(like(number), like(memo))` for search; `.orderBy(date desc)`, `.limit`), `useRecord(books_journal_entries, id)` for an entry, `books_journal_lines` where `entry = id` ordered by `position` (relation `entry` exists on the lines collection since p1-account-register). Account names come from one accounts query held by the screen (active accounts for the picker, all for display of old lines). Linked entries ("Reversed by", "Replaces") read through a second small `useLiveQuery` on `books_journal_entries` where `reverses = id` or `replaces = id`, never the whole table. `books_settings` for currency and fiscal start. `books_doc_sequences` is not read: the next number is unknown until posting.
- Writes (all `useMutation` generators from `@tinycld/core/lib/mutations`): insert/update/delete on `books_journal_entries` and `books_journal_lines` (draft saves); update `status` on the entry for post and void; insert of a reversal draft then post for Reverse. No custom endpoint, no new collection, no migration, no Go change.
- Money: integer cents; display through `lib/money.ts`; input through `parseMoney`; totals through `lib/entry-lines.ts` (integer sums, guard above `maxStoredAmount`). No arithmetic on dollars.
- Row types derive from the queries; no hand-declared row shapes.
- Realtime: a post by another session updates the list row and status; a screen on a draft that was posted elsewhere switches to the read-only view (derived from `status` during render).

## Cut
- Make recurring: v1.1 (recurring transactions).
- Attachments: no attachment field on journal entries.
- Name column on lines (customer/vendor): no parties until phase 2; the line `memo` stays.
- Editable journal number: the server assigns numbers per document type (settings own the prefix).
- Save and new split-button menu with many modes, Clear all lines: Post & new and Cancel cover them.
- Drag handle reordering: replaced by Move up / Move down in the line menu ([platform] item, signed-off alternative).
- Batch actions on the list, export and print of the list or one entry: reports unit.
- Edit or delete of a posted entry in place: the server refuses; Edit makes a replacement.
- Audit history tab on the entry: the audit-log report unit.
- Custom date range on the list beyond the presets: same cut as the register.
- Close-date override request from the form: admin settings.

## Platform notes
None as single-platform. Drag-to-reorder and Tab-across-cells keyboard navigation are web conventions; both platforms get Move up/Move down and Add line, and web additionally gets natural Tab order (a [platform] item at the design gate).

## Sparks carried
Debit and credit totals with the out-of-balance difference stay visible (footer strip, tokens `text-foreground` / `text-success` / `text-destructive`); fixed right-aligned Debit and Credit columns (shared cell style constants, non-shrinking); one reach to the primary action (sticky `bg-surface border-t` action bar outside the scroll area). No core extension.

## Non-goals
Opening-balance entry (`p1-opening-balances`); recurring entries; editing the close date; entries in a currency other than the books currency; invoice, bill and payment forms; the forms-engine repeating-row field (this unit uses React Hook Form's `useFieldArray` with zod; the core table field stays for the invoice phase); an audit trail view; bulk import of entries; partial reversal.

## Decisions at the design gate
Direction A (separate list and entry screens, one ledger grid; cards on phones). Open questions answered as recommended:
- Edit of a posted entry prefills `entries/new?replaces=<id>` and writes on first save.
- Reverse default date: first day of the month after the entry date, or today when later; editable, not before the entry date.
- A refused Reverse post deletes the reversal draft and shows the server message in the dialog.
- Date input: core `DateField` if it takes and returns `YYYY-MM-DD` text and meets 44pt on both platforms; otherwise a `TextInput` with a zod `YYYY-MM-DD` rule. No core change.
- Account picker: core `SelectInput` without search ("number name", sub-accounts indented, active accounts, chart order). No core change.
- Void is included, with a confirm dialog.
- Draft save is not atomic (entry, then lines); the form reloads from the saved rows after a save.
- List default range: This fiscal year, with an "All dates" chip action.
- The register drawer "Open entry" link shows at every access level.
- Lines use `useFieldArray` with zod.
- Signed off [platform] items: Move up / Move down in the line menu on both platforms (no drag); natural Tab order and Enter-to-add-line on web, Add line button and keyboard Next key on native.
