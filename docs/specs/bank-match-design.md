# Match a bank transaction — design

Status: approved at the design gate, 2026-11-19 (auto-helix unit p4-match, feature `bank-match`). Spec source: `docs/superpowers/specs/2026-10-21-books-design.md` §Scope ("Banking: CSV/OFX import, For review / Reviewed / Excluded tabs, match / categorize / split / exclude"; "in-app help for every feature"). Builds on `books/docs/specs/for-review-design.md` (the queue, the drawer and its `children` slot, the Reviewed tab that waits for "Added as" and Undo). Built on branch `books/p4-match` (books @98491861, core @470a6f7).

Decisions of the gate: direction A of the artboards (match in the drawer); open questions 1–13 of the design packet as recommended, with question 4 answered A and question 11 reduced to its first half (the suggestion line replaces the memo line; no action cell, no width change); the row mark of §3 "The For review list" (the human's change); question 14 (the migration number) and question 15 (shared files) in §4.

## 1. Goal

A bookkeeper marks an imported bank transaction as the same money movement as one or more transactions already in Books, so the bank transaction is reviewed and nothing posts twice.

## 2. Where it lives

- The Banking page, inside the account panel's For review and Reviewed tabs (p4-for-review). No new route, no sidebar entry, no new tab.
- For review list: each row shows a mark for the match Books found. The row has no Match button. Pressing the row opens the drawer, as it does today.
- The transaction drawer (`BankTxnDrawer`): a **Match** section in the `children` slot, under the fields, for a For review transaction; a **Matched to** section for a Reviewed transaction that was matched. Every single match is made here.
- "Find other matches" is a mode of the same drawer section (the drawer does not stack a second surface).
- The selection bar of the For review tab: **Match** for the chosen rows.
- Reviewed list: an **In Books** column.

## 3. Behavior

### Words

- A **Books transaction** here is one posted journal line on the connection's account: the side of a deposit, payment, sales receipt, expense, bill payment, transfer, refund or journal entry that moved this bank or card account.
- A **match** says that one bank transaction and one or more Books transactions are the same money movement. A match posts nothing and changes no balance.
- A **suggestion** is a Books transaction that Books found for a bank transaction by the rule below.

### What can be matched

- A Books transaction can be matched to a bank transaction when all of these are true: its line is posted on the connection's account; its entry is posted, is not void and is not the reversal of a void; its side fits (money in, a positive bank amount, matches a debit; money out matches a credit; the same rule serves a credit card account); and no other bank transaction is matched to it.
- A match holds 1 to 50 Books transactions. The sum of their amounts must equal the bank amount exactly, in integer minor units. There is no "resolve the difference".
- Only a For review transaction can be matched. A date before the close date does not block a match, because nothing posts.

### Suggestions

- A suggestion is a Books transaction that can be matched, has exactly the bank amount, and is dated from 90 days before to 7 days after the bank date (`MATCH_DAYS_BEFORE`, `MATCH_DAYS_AFTER`).
- Suggestions are ordered by the number of days between the two dates, nearest first, then by entry number.
- A Books transaction can be a suggestion for two bank transactions of the same amount; the first match takes it and it leaves the other's suggestions.

### The For review list

- Wide table, a row with exactly one suggestion: the row's second line, under the description, is a green check icon (Lucide `Check`, 14, colour from `useThemeColor('success')`) and, beside it, the suggestion text "1 match · Transfer 1007 · Sep 3, 2026" (`text-xs text-primary`, one line, ellipsis). Test id `bank-review-suggestion-<id>` on the text.
- Wide table, a row with more than one suggestion: the second line is a chip (rounded-full, `border-warning`, `px-2`) that holds a yellow warning triangle (Lucide `AlertTriangle`, 12, colour from `useThemeColor('warning')`) and the text "3 matches" (`text-xs text-foreground`). Test id `bank-review-matches-<id>` on the chip text.
- The mark replaces the memo and check number line on that row (both stay in the drawer). A row with no suggestion keeps its memo line.
- The icons are decoration (hidden from accessibility); the text carries the meaning, so colour is never the only signal.
- The row has no Match button, no Review button and no action cell. The table's cells and widths stay as they are: Description keeps its minimum width of 240 and the table its minimum width of 720 (`REVIEW_CELLS`, `REVIEW_TABLE_MIN_WIDTH`). Row height stays 56.
- Phone cards (For review, height stays 72): the second line reads the day and then the same mark in place of "Check n": the check icon and "1 match · Transfer 1007" (one line, ellipsis), or the "3 matches" chip. A card with no suggestion keeps "day · Check n".
- Pressing a row or a card opens the drawer (p4-for-review); the match is made there.
- Readers see the same marks.

### Matching many rows

- With rows chosen, the selection bar gains **Match** (outline, test id `bank-review-match-chosen`) before Exclude. It matches each chosen row that has exactly one suggestion, 50 at a time in parallel (the batch runner of p4-for-review, outcome `{ done, failed }`).
- While the batch runs, the button shows "Matching…" with core `ButtonSpinner` and the other bar actions are disabled (the page's one batch).
- Chosen rows with no suggestion or with several are skipped and stay chosen. The result line reads "Matched 4 transactions." or "Matched 4 transactions. 2 need a choice: open them to match." (1 skipped: "1 needs a choice: open it to match.")
- The button is disabled, with the hint "None of the chosen transactions has exactly one match.", when no chosen row has exactly one suggestion.
- A refusal keeps the failed rows chosen and shows the server's message, or "2 of 6 transactions could not be matched. Try again." (the wording rules of `batchResultText`).

### The Match section of the drawer (For review, writers)

- Heading "Match" and, under it, "Books transactions that fit this bank transaction."
- Each suggestion is one row (test id `bank-match-option-<lineId>`): a Books `SelectBox`, the type and number as a link ("Transfer 1007", `text-primary`, opens the Books transaction through `entryHref`), the date, the name (customer or vendor of the entry, when it has one) and the amount (`tabular-nums`). On a narrow drawer the name goes to a second line.
- With one suggestion, its box starts checked. With several, none starts checked.
- A totals line under the rows: "Chosen $868.15 of $868.15" and, when they differ, "Difference $120.00" in `text-danger`.
- **Match** (`ShortcutButton`, key M, test id `bank-match-submit`) is enabled only when one or more rows are chosen and the difference is 0. While disabled it has the hint "Choose Books transactions that add up to $868.15."
- **Find other matches** (`ShortcutButton` outline, key F, test id `bank-match-find`) is at the end of the section.
- No suggestion: "Books found no transaction of $868.15 near Sep 3, 2026." and **Find other matches**.
- Loading: core `LoadingState` in the section; the fields above stay. Error: "Books could not load the matches." with Retry (`recoverLiveQueries` over the section's queries).
- While the match is sent, Match shows "Matching…" with core `ButtonSpinner` and the boxes are disabled. After a match from the drawer, the drawer closes (the row has left the tab), and the result line under the toolbar reads "Matched 1 transaction."
- A refusal keeps the drawer open and shows the server's message in `text-danger` under the totals line (`accessibilityRole="alert"`). A transport failure logs `log.warn('books.banking', …)` and shows "The match could not be sent. Check your connection and try again."
- While the server cannot take writes, the drawer's Match and the selection bar's Match are disabled (core `useServerActionState`, with its hint).
- A reader sees the suggestions as a list with links, with no boxes and no buttons.

### Find other matches

- Pressing it changes the section to the find mode; the drawer stays. A "Back to suggestions" link (44 high) returns.
- The find mode lists every Books transaction that can be matched on this account and side, whatever its amount, inside a date range.
  - **From** and **To**: two core `DateField`s (`@tinycld/core/ui/forms/fields/DateField`), bounded to the drawer's width (lesson 2). They start at 90 days before and 7 days after the bank date. A From after To shows "From must be on or before To." (zod, `useForm`).
  - **Search**: text field, placeholder "Search number, name, memo or amount", 250 ms delay (`SEARCH_DELAY_MS`); pieces match the entry number, the customer or vendor name and the line or entry memo; text that reads as an amount matches that amount (`parseSearchAmount`).
- Rows are the suggestion rows (box, type and number link, date, name, amount), newest first, loaded 50 at a time (`LIST_PAGE_SIZE`) as the list nears its end.
- Rows chosen in the suggestions stay chosen in the find mode and the reverse; a chosen row stays listed at the top when a new search hides it.
- The totals line, the difference and **Match** behave as in the suggestions. A choice of more than 50 rows disables Match with "A match holds at most 50 Books transactions."
- Empty: "No Books transaction on 1000 Business Checking from Jun 5 to Sep 10, 2026." or, under a search, "No Books transaction matches this search."
- The find mode resets (dates, search, choice) when the drawer shows another transaction or closes.

### Reviewed tab

- A new column **In Books** between Description and Spent (flex 1, minimum 180; on this tab Description has a minimum of 160): "Matched · Transfer 1007" as a link to the Books transaction (`entryHref`), or "Matched · 3 transactions" when the match holds several (pressing the row opens the drawer, which lists them). Phone cards show the same text as a third line (Reviewed cards are 96 high).
- The drawer of a matched transaction shows **Matched to**: the matched Books transactions as link rows (type and number, date, name, amount), "Matched Nov 18, 2026 by Ana Ruiz", and for writers **Undo match** (`ShortcutButton` outline, key Z, test id `bank-match-undo`).
- Undo match removes the match; the bank transaction returns to For review and the Books transactions can be matched again. The drawer closes and the result line reads "Match undone. The transaction is back in For review."
- A refusal of the undo keeps the drawer open and shows the server's message.

### When a matched Books transaction changes

- Voiding a matched Books transaction, or editing it (an edit voids the original and posts a correction), removes the match in the same server transaction, and the bank transaction returns to For review. The corrected transaction is then a suggestion when its amount still fits.
- Disconnecting the account removes its matches with its bank transactions, as it removes the bank transactions today.

### Keyboard (web and iOS hardware keyboard)

The keys act in the drawer. Each is registered only while its action is offered:

- M — Match: the drawer's choice, while the drawer is open on a For review transaction and its Match is enabled.
- F — Find other matches (drawer open on a For review transaction, writers).
- Z — Undo match (drawer open on a matched Reviewed transaction, writers).
- With the drawer closed and rows chosen, M presses the selection bar's Match (the bar's Exclude has E in the same way). While the drawer is open, M is only the drawer's: with its Match disabled, M does nothing.
- M does nothing on a focused row: a row has no match action.
- The three drawer buttons are `ShortcutButton`s, so each key works in the inline drawer (wide), in the overlay drawer (tablet) and in the sheet (phone, hardware keyboard), where core pushes a modal scope.
- In the drawer's lists, Tab moves through the boxes and Space toggles the focused box.
- The help topic lists the keys with Mac glyphs.

### Empty, loading, error and read-only states

- The list's own states are those of p4-for-review. The mark of a row appears when the suggestions have loaded; until then the row shows its memo line. A failed suggestions read leaves the rows without marks and adds its recovery to the page's Retry (`mergeRecoveries`).
- Read-only user: the row marks, the drawer's suggestion and Matched to lists with links; no boxes, no Match (drawer or bar), no Find other matches, no Undo match, no keys M, F, Z.

## 4. Data

### Schema (new migration `pb-migrations/2100000030_create_books_bank_matches.js`)

The number is fixed at the gate: 27 is p2-write-off, 28 is reserved for p5-ar-aging, 29 is the audit view after its rename.

- `books_bank_matches` — one row for each matched bank transaction; the client creates it to match and deletes it to undo.
  - `bank_transaction` (relation to `books_bank_transactions`, required, cascade delete, unique index), `lines` (relation to `books_journal_lines`, required, maxSelect 50), `connection` (relation, server-stamped), `created_by` (users, server-stamped), `created`, `updated`.
  - Rules: list and view `READ`; create `WRITE && unset('connection', 'created_by')`; update none; delete `WRITE`.
- `books_bank_match_lines` — server-written, one row for each matched journal line; it is what makes "matched once" an index and what the lists read.
  - `match` (relation, cascade delete), `bank_transaction`, `line` (relation to `books_journal_lines`, unique index), `entry` (relation to `books_journal_entries`, indexed), `amount` (integer minor units), autodates. Rules: list and view `READ`; no create, update or delete rule.
- `books_bank_match_suggestions` — a view collection (rules `READ`): one row for each (For review bank transaction, fitting journal line) pair under the suggestion rule. Columns: `id` (the two ids joined), `bank_transaction`, `connection`, `line`, `entry`, `date` (the line's), `days_apart`. One `SELECT` with joins, `NOT EXISTS` over `books_bank_match_lines`, and no `UNION ALL` (memory p5-change-signal). Registered with `changesignal.RegisterView(view, "books_bank_transactions", "books_journal_lines", "books_journal_entries", "books_bank_match_lines", "books_bank_connections")`; the client keeps it live with core `liveViewOptions`.
- An index on `books_journal_lines (account, debit, date)` and `(account, credit, date)` where `posted = TRUE`, added by the new migration, serves the view's join.
- `books_bank_transactions` gets no new field and no rule change: only Go moves a row to and from `reviewed`.

### Server (`server/bank_match.go`, registered from `Register`)

- Create of `books_bank_matches`, inside `serialized`: stamp `connection` and `created_by`; refuse unless the bank transaction is For review ("This transaction is already reviewed." / "This transaction is excluded. Move it to For review first."); refuse each line that cannot be matched, with its own text ("Transfer 1007 is void.", "Transfer 1007 is already matched to another bank transaction.", "Transfer 1007 is not on 1000 Business Checking.", "Transfer 1007 is money out; this bank transaction is money in."); refuse a sum that differs ("The chosen Books transactions total $748.15. The bank transaction is $868.15."); then write the `books_bank_match_lines` rows and set the bank transaction to `reviewed`.
- Delete of `books_bank_matches`, inside `serialized`: the cascade removes its lines; set the bank transaction to `for_review`.
- When a journal entry moves to void (`books_journal_entries` update, in the void's transaction): delete every match that holds one of its lines (`unmatchEntry(tx, entryID)`), which returns each bank transaction to For review.
- Exported for later units: `isLineMatched(tx, lineID)` and `unmatchEntry(tx, entryID)` (p4-reconcile reads matched lines; p4-categorize-split reuses the reviewed/undo move).
- Audit: `books_bank_matches` joins the audited collections (`server/audit.go`), label "<bank date> <bank description>", so a match and an undo show in the audit log. `TestRegister_BindsEachPartOnce` gains the new part.

### Reads (`useLiveQuery` with `{ query, queryKey }`)

- **Suggestions of the list** (key `books.match.suggestions`): `books_bank_match_suggestions` where `connection = id`. The For review tab groups them by `bank_transaction` in one pass (`suggestionsByTxn`), and each row with exactly one reads its entry through `materialize()` in the same query (entry number, doc type, date) for the row text.
- **Drawer suggestions** (key `books.match.options`): the same view where `bank_transaction = id`, with `materialize()` of the line (debit, credit, memo, customer, vendor), the entry and the customer and vendor rows — one query; ordered by `days_apart`, entry number.
- **Find mode** (key `books.match.find`): `useLiveInfiniteQuery` over `books_journal_lines` where `account`, `posted = true`, the side (`gt(debit, 0)` or `gt(credit, 0)`), the date range and the search clauses, ordered by `date` then `id` (lexical); `materialize()` of the entry, the customer, the vendor and the line's `books_bank_match_lines` row. Rows whose entry is void or a void reversal, or that are already matched, are dropped in JS after the query (`matchableLines`), as `useMailboxes` drops parents with a missing related row.
- **Reviewed list**: the existing paged query gains `materialize()` of the row's `books_bank_match_lines` (and their entries) for the In Books column. **Drawer, Reviewed**: the match row by `bank_transaction` with its lines, entries, and `created_by` name.
- Where clauses and the side rule come from pure helpers in `lib/bank-match.ts`.

### Writes

- Match: one pbtsdb `insert` into `books_bank_matches` (`{ id: newRecordId(), bank_transaction, lines }`) through `useMutation`. It is one row, so there is no multi-row order to keep. The bank transaction's status is not written by the client: it leaves For review when the server's update arrives by realtime, so the drawer's Match shows "Matching…" until the insert settles (memory p4-for-review: no list assertion while a write is held).
- Batch match: one insert for each chosen row with exactly one suggestion, 50 in parallel per step, outcome `{ done, failed }` (`useReviewBatch` gains the kind `match`).
- Undo: one pbtsdb `delete` of the match row.

### Client modules

- `lib/bank-match.ts`: `MATCH_DAYS_BEFORE`, `MATCH_DAYS_AFTER`, `MATCH_MAX_LINES`, `matchSide(amount)`, `lineAmount(line)`, `matchTotals(bankAmount, chosenLines)` (chosen, difference), `suggestionsByTxn(rows)`, `suggestionText(count, entry)`, `inBooksText(lines)`, `matchableLines(rows)`, `findWhere(filters)`, `matchResultText(outcome, skipped)`, `findRangeSchema` (zod).
- `hooks/useBankMatch.ts` (the drawer section: suggestions, find mode, choice, totals, match and undo mutations), `hooks/useMatchSuggestions.ts` (the list's suggestions by transaction).
- `stores/banking-ui-store.ts` gains `matchMode` ('suggestions' | 'find'), `matchChosen` (line ids), `matchFind` (from, to, search) and their setters; `openTxn`, `closeTxn` and `closeAll` reset them.
- `lib/review-shortcuts.ts` gains the batch key M (`match`, offered to a writer on For review with rows chosen and the drawer closed, while no batch runs and the server takes writes). The drawer's M, F and Z come from its `ShortcutButton`s.
- Components in `components/banking/match/`: `MatchSection`, `MatchOptionRow`, `MatchTotals`, `MatchFind`, `MatchedTo`, `SuggestionMark` (the row and card mark: the check and text, or the chip). `BankingScreenView` passes the section to `BankTxnDrawer` as `children`; `ReviewRow` and `ReviewCard` take the row's suggestions and draw `SuggestionMark` in place of the memo line; `ReviewTable` gains the Reviewed In Books cell (shared cell constants in `REVIEW_CELLS`). The For review table gains no cell.

### Shared files (gate question 15)

`server/register.go`, `server/registrations_test.go`, `tinycld/books/seed.ts`, `server/audit.go` and `tinycld/books/collections.ts` are also edited by units of other lanes (p5-ar-aging, p2-write-off). This unit merges last: at the merge it keeps both sides of each of these files, and its own edits there are additions only (one registration, one test entry, one audited collection, the new collections, the seed lines).

### Fixture and seed

- `lib/bank-match-fixture.ts` (scratch route data, typed with `satisfies` against the generated record types once the migration exists; accounts named by `seed.ts` ACCOUNTS numbers, lesson 17): on 1000 Business Checking, For review rows with one suggestion, with three suggestions of one amount, with none, and one whose match is three Books transactions; Reviewed rows matched to one and to three; a 70-character description; a Books transaction with a long vendor name.
- `seed.ts`: the seeded review statement (`REVIEW_SEED_STATEMENT`) gains two lines whose amount and date equal Books transactions the seed already posts on the same account, so the e2e book and the help screenshots show suggestions without a new ledger entry; the seed then matches one of them as superuser through a `books_bank_matches` create (the same Go hook), so the Reviewed tab has a matched row. The plan checks every spec that counts the seeded For review rows before it changes the statement (lesson 1).

### Help

- New topic `help/bank-match.md` ("Match a bank transaction", tags banking, match, review): what a match is and that nothing posts, the suggestion rule, the check and the "matches" chip on a row, Match in the drawer, choosing several Books transactions, Find other matches, Match for chosen rows, Undo match, what a void does to a match, who can do what, the keys. `bank-review.md` and `banking.md` link to it. Images through `help/screenshots.ts`. `tests/help-bank-match.test.ts` as the other help tests.

### Tests the plan must carry

- Vitest: `matchSide`, `matchTotals` (equal, short, over), `suggestionsByTxn`, `suggestionText`, `inBooksText`, `matchableLines`, `findWhere`, `matchResultText`, the key map additions, the fixture.
- Go: the create hook (each refusal above, the reviewed move, the stamped fields, a reader refused by the rule, two concurrent matches of one line: one wins), the delete hook, void and edit of a matched entry, the view (window edges at 90 and 7 days, side, void and void-reversal entries left out, a matched line left out, a credit card account), disconnect removes matches, the audit registration.
- E2E `tests/e2e/bank-match.spec.ts`, titles prefixed `bank-match:`; each test posts its own Books transaction through the UI (a transfer or an expense on the checking account, with a per-run amount and memo, dated mid-2026 or later) and imports its own small OFX file through the UI:
  - A row shows the check and "1 match · …" in place of its memo; the row has no Match button; open it, Match in the drawer; the row is on Reviewed with In Books.
  - Drawer: suggestion checked, totals, Match; the link opens the Books transaction.
  - Two Books transactions of one amount: the row shows the "2 matches" chip; open it, none checked, choose one, Match.
  - Find other matches: date range, search, choose two transactions that add up; a difference keeps Match disabled.
  - Batch Match of three chosen rows from the selection bar, one skipped and still chosen.
  - Undo match returns the row to For review with its mark.
  - Void the matched Books transaction: the bank transaction is back in For review.
  - A refusal (`route.fulfill({ status: 400 })` on the create) keeps the drawer open with the message.
  - Read-only user: marks, text and links, no buttons.
  - Keys M, F, Z in the drawer; M for the chosen rows with the drawer closed.
  - Phone (390×844, navigate wide then resize): the card's second line with the mark, the drawer sheet with Match and the find mode.

## 5. Cut

- A Match or Review button on a For review row or card, and the trailing action cell (direction B) — the human picked direction A: a single match is made in the drawer.
- Key M on a focused row — a row has no match action.
- Matching an open invoice or bill by creating its payment from the bank transaction — record the payment first (Receive payment, Pay bills), then match it.
- "Resolve the difference" (adding a fee or adjustment line inside the match) — a match is exact; a bank fee is its own bank transaction, or p4-categorize-split categorizes it.
- One Books transaction matched to several bank transactions.
- Categorize, split, a payee, Record as transfer, and the switch between the three ways — p4-categorize-split.
- Bank rules and automatic matching at import — v1.1 ("bank rules").
- A "matched" mark in the account register and cleared marks — p4-reconcile.
- Matching by check number — a Books document number is not a check number.
- Batch undo on Reviewed.
- A suggestion window setting — the constants are fixed.

## 6. Platform notes

- None new. Keys M, F, Z run on web and with an iOS hardware keyboard, and every action has a visible button (standing approval, 2026-11-11). The list, cards, drawer, date fields and mutations run on web and native.

## 7. Sparks carried

- A found match is one compact line: the type and number as a `text-primary` link (`entryHref`), the date (`formatDay`), the name, the amount (`formatMoney`, `tabular-nums text-foreground`), behind a Books `SelectBox`.
- The wider search is a quiet secondary button: "Find other matches" in the outline variant; the primary action is "Match".
- Human's row mark (gate, 2026-11-19): a green check for one suggestion (`success` token), a "<n> matches" chip with a yellow triangle for several (`warning` token). Semantic tokens only, no raw colour.
- No core design-system extension.

## 8. Non-goals

- No posting, no journal entry, no balance or report change.
- No change to the import, the parser or the dedupe rules.
- No new endpoint: the match is a collection row with a Go hook, as an import is.
- No change to the `books_bank_transactions` update rule: a client still cannot set `reviewed`.
- No match across accounts: a bank transaction matches only lines of its own connection's account.
- No change to the For review table's columns or widths.

## 9. Core change on the same branch (not for the screen)

One small core PR on branch `books/p4-match` of the `tinycld` repo, a check approved from a retro: for a member with e2e specs, `tinycld-pkg check` (in `tinycld/package-scripts`) also runs `playwright test --list` and fails when a spec does not load. It is the plan's checkpoint 0. The screen needs nothing from core.

## Engine reach (self-review 5)

- Shortcut buttons: core `ShortcutButton` (`@tinycld/core/ui/shortcut-button`; it has `variant`, `serverAction` and `shortcut: { keys, scope }`). Its shortcut scope follows the drawer's placement (`lib/drawer-placement.ts`): scope `list` with the page's owner (the `ScopeProvider` of `BankingScreenView`, read from context by core `useScopeOwner`) for the inline drawer; scope `modal` with the layer's owner for the overlay drawer and the sheet (the scope p4-for-review found there, see the comment in `lib/review-shortcuts.ts`). The plan reads how `BankTxnDrawer`'s layer publishes its owner before it writes the task. The batch key through core `useRegisterShortcuts` in the review key map (`lib/review-shortcuts.ts`).
- Row mark: Lucide `Check` and `AlertTriangle` (`lucide-react-native`) coloured with core `useThemeColor('success')` / `useThemeColor('warning')` (`@tinycld/core/lib/use-app-theme`); chip border `border-warning` (the class Books `StatusBadge` uses). `StatusBadge` itself takes no icon, so the chip is its own small component (`SuggestionMark`).
- Date range validation: `useForm` + `zodResolver` (`@tinycld/core/ui/form`) with `findRangeSchema`; core `DateField` (`@tinycld/core/ui/forms/fields/DateField`), wrapped as `components/transfers/TransferDateField.tsx` wraps it.
- Write of the match: one pbtsdb insert of one row; every other row is written by Go in the hook's transaction.
- Live view: `changesignal.RegisterView` in Go and core `liveViewOptions('<view>')` (`@tinycld/core/lib/change-signal`) in `collections.ts`, as `books_party_balances` (`server/party_balances.go`, `collections.ts`).
- Paged find list: `useLiveInfiniteQuery`, as the Reviewed tab.
