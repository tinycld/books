import { eq, type InitialQueryBuilder } from '@tanstack/db'
import { useLiveInfiniteQuery, useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useDebouncedValue } from '@tinycld/core/lib/use-debounced-value'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { useController, useForm, zodResolver } from '@tinycld/core/ui/form'
import { materialize } from 'pbtsdb'
import { useEffect, useRef, useState } from 'react'
import {
    chosenWhere,
    defaultFindRange,
    entryLabel,
    type FindColumns,
    type FindRange,
    type FindWhereInput,
    findEmptyText,
    findRangeSchema,
    findViewState,
    findWhere,
    lineAmount,
    MATCH_TRANSPORT_TEXT,
    type MatchSide,
    matchableLines,
    matchEmptyText,
    matchSendingFor,
    matchSide,
    matchSubmitState,
    matchTotals,
} from '../lib/bank-match'
import type { BatchOutcome } from '../lib/bank-review'
import { entryHref } from '../lib/entry-route'
import { linePartyName } from '../lib/line-party-options'
import { ID_ORDER, LIST_PAGE_SIZE, SEARCH_DELAY_MS, searchPieces } from '../lib/list-search'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { formatDay } from '../lib/register-range'
import { useBankingUIStore } from '../stores/banking-ui-store'
import type { BooksJournalEntries } from '../types'
import type { ReviewBatch } from './useReviewBatch'
import type { ReviewDrawerModel } from './useReviewDrawer'

// The suggestions of one bank transaction, each with its journal line, the line's entry
// and the customer or vendor names of the entry's lines, in one query over the view
// books_bank_match_suggestions. Disabled while no For review transaction is open.
function useMatchOptionsQuery(txnId: string | null) {
    const [suggestions, lines, entries, customers, vendors] = useStore(
        'books_bank_match_suggestions',
        'books_journal_lines',
        'books_journal_entries',
        'books_customers',
        'books_vendors'
    )
    const query = useLiveQuery({
        query: q => {
            if (!txnId) return null
            return q
                .from({ s: suggestions })
                .where(({ s }) => eq(s.bank_transaction, txnId))
                .select(({ s }) => ({
                    id: s.id,
                    lineId: s.line,
                    date: s.date,
                    daysApart: s.days_apart,
                    line: materialize(
                        q
                            .from({ l: lines })
                            .where(({ l }) => eq(l.id, s.line))
                            .select(({ l }) => ({ debit: l.debit, credit: l.credit }))
                            .findOne()
                    ),
                    entry: materialize(
                        q
                            .from({ e: entries })
                            .where(({ e }) => eq(e.id, s.entry))
                            .select(({ e }) => ({
                                id: e.id,
                                number: e.number,
                                doc_type: e.doc_type,
                                origin: e.origin,
                                date: e.date,
                                document: e.document,
                                status: e.status,
                            }))
                            .findOne()
                    ),
                    parties: materialize(
                        q
                            .from({ l: lines })
                            .where(({ l }) => eq(l.entry, s.entry))
                            .select(({ l }) => ({
                                id: l.id,
                                position: l.position,
                                customerRow: materialize(
                                    q
                                        .from({ c: customers })
                                        .where(({ c }) => eq(c.id, l.customer))
                                        .select(({ c }) => ({ display_name: c.display_name }))
                                        .findOne()
                                ),
                                vendorRow: materialize(
                                    q
                                        .from({ v: vendors })
                                        .where(({ v }) => eq(v.id, l.vendor))
                                        .select(({ v }) => ({ display_name: v.display_name }))
                                        .findOne()
                                ),
                            }))
                    ),
                }))
        },
        queryKey: ['books.match.options', txnId],
    })
    return { query, sources: [suggestions, lines, entries, customers, vendors] }
}

type OptionRow = NonNullable<ReturnType<typeof useMatchOptionsQuery>['query']['data']>[number]
type EntryParty = NonNullable<OptionRow['parties']>[number]

// The name of the entry's customer or vendor: the line's own first, else the first line
// (by position) that names one; '' when none does.
function entryPartyName(lineId: string, parties: readonly EntryParty[] | undefined): string {
    const all = parties ?? []
    const own = all.find(party => party.id === lineId)
    const ownName = own ? linePartyName(own) : ''
    if (ownName) return ownName
    const named = [...all]
        .sort((a, b) => a.position - b.position)
        .map(party => linePartyName(party))
        .find(name => name !== '')
    return named ?? ''
}

function compareNumbers(a: string, b: string): number {
    return a.localeCompare(b, 'en', { numeric: true })
}

type OptionEntry = Pick<BooksJournalEntries, 'id' | 'number' | 'doc_type' | 'origin' | 'document'>

// One Books transaction as a row of the Match section shows it, from the suggestions or
// from the find mode.
function optionOf(input: {
    lineId: string
    line: { debit: number; credit: number }
    entry: OptionEntry
    date: string
    name: string
}) {
    return {
        lineId: input.lineId,
        label: entryLabel(input.entry),
        href: entryHref(input.entry),
        dateText: formatDay(input.date),
        name: input.name,
        amount: lineAmount(input.line),
        debit: input.line.debit,
        credit: input.line.credit,
    }
}

export type MatchOption = ReturnType<typeof optionOf>

// The suggestions as the drawer's rows, nearest day first, then by entry number. A row
// whose line or entry has not arrived is left out until it does (materialize keeps the
// suggestion row; useMailboxes drops a parent the same way).
function toOptions(rows: readonly OptionRow[]): MatchOption[] {
    return rows
        .flatMap(row => {
            const { line, entry } = row
            if (!line || !entry) return []
            return [{ row, line, entry }]
        })
        .sort(
            (a, b) =>
                a.row.daysApart - b.row.daysApart || compareNumbers(a.entry.number, b.entry.number)
        )
        .map(({ row, line, entry }) =>
            optionOf({
                lineId: row.lineId,
                line,
                entry,
                date: row.date,
                name: entryPartyName(row.lineId, row.parties),
            })
        )
}

const NO_OPTIONS: readonly OptionRow[] = []
const NO_PAGE = () => {}

function useLineCollections() {
    const [lines, entries, customers, vendors, matchLines] = useStore(
        'books_journal_lines',
        'books_journal_entries',
        'books_customers',
        'books_vendors',
        'books_bank_match_lines'
    )
    return { lines, entries, customers, vendors, matchLines }
}

type LineCollections = ReturnType<typeof useLineCollections>

function lineSources(c: LineCollections) {
    return [c.lines, c.entries, c.customers, c.vendors, c.matchLines]
}

type LineWhere = (
    columns: FindColumns,
    lineId: Parameters<typeof chosenWhere>[1]
) => ReturnType<typeof findWhere>

// Journal lines as the find mode and the chosen lines read them, newest first. The entry,
// the customer, the vendor and the line's books_bank_match_lines row are left joins,
// because the `where` filters by them (the number, the names and the memo of the search;
// the entry's status and origin and the match line of canMatchLine) and a `where` cannot
// read a materialize() value. The name shown is the entry's party (any line of the entry,
// as a suggestion shows it), so the entry's lines are materialized.
function lineRows(q: InitialQueryBuilder, c: LineCollections, whereOf: LineWhere) {
    return q
        .from({ line: c.lines })
        .leftJoin({ entry: c.entries }, ({ line, entry }) => eq(line.entry, entry.id))
        .leftJoin({ customer: c.customers }, ({ line, customer }) => eq(line.customer, customer.id))
        .leftJoin({ vendor: c.vendors }, ({ line, vendor }) => eq(line.vendor, vendor.id))
        .leftJoin({ matchLine: c.matchLines }, ({ line, matchLine }) => eq(line.id, matchLine.line))
        .where(({ line, entry, customer, vendor, matchLine }) =>
            whereOf(
                {
                    account: line.account,
                    posted: line.posted,
                    debit: line.debit,
                    credit: line.credit,
                    date: line.date,
                    number: entry.number,
                    entryStatus: entry.status,
                    entryOrigin: entry.origin,
                    matchLineId: matchLine.id,
                    customerName: customer.display_name,
                    vendorName: vendor.display_name,
                    lineMemo: line.memo,
                    entryMemo: entry.memo,
                },
                line.id
            )
        )
        .orderBy(({ line }) => line.date, { direction: 'desc', stringSort: 'lexical' })
        .orderBy(({ line }) => line.id, ID_ORDER)
        .select(({ line, entry, matchLine }) => ({
            id: line.id,
            debit: line.debit,
            credit: line.credit,
            date: line.date,
            entryId: entry.id,
            number: entry.number,
            docType: entry.doc_type,
            origin: entry.origin,
            status: entry.status,
            document: entry.document,
            matchLine: matchLine.id,
            parties: materialize(
                q
                    .from({ l: c.lines })
                    .where(({ l }) => eq(l.entry, line.entry))
                    .select(({ l }) => ({
                        id: l.id,
                        position: l.position,
                        customerRow: materialize(
                            q
                                .from({ cu: c.customers })
                                .where(({ cu }) => eq(cu.id, l.customer))
                                .select(({ cu }) => ({ display_name: cu.display_name }))
                                .findOne()
                        ),
                        vendorRow: materialize(
                            q
                                .from({ v: c.vendors })
                                .where(({ v }) => eq(v.id, l.vendor))
                                .select(({ v }) => ({ display_name: v.display_name }))
                                .findOne()
                        ),
                    }))
            ),
        }))
}

type LineRow = NonNullable<ReturnType<typeof useChosenLinesQuery>['query']['data']>[number]

// A line row with its entry as one value: undefined until the entry has arrived (a left
// join with no entry row yet), so matchableLines leaves the row out.
function withEntry(row: LineRow) {
    const { entryId, number, docType, origin, status, document } = row
    const isFiled = entryId && number !== undefined && docType && origin && status
    const entry = isFiled
        ? { id: entryId, number, doc_type: docType, origin, status, document: document ?? '' }
        : undefined
    return { ...row, entry }
}

// Line rows that can be matched (matchableLines guards the query's clauses), as options.
function lineOptions(rows: readonly LineRow[]): MatchOption[] {
    return matchableLines(rows.map(withEntry)).flatMap(row => {
        if (!row.entry) return []
        return [
            optionOf({
                lineId: row.id,
                line: row,
                entry: row.entry,
                date: row.date,
                name: entryPartyName(row.id, row.parties),
            }),
        ]
    })
}

const NO_IDS: readonly string[] = []

// The chosen lines that are not suggestions (chosen in the find mode), read from the
// server with the find mode's reads and the rules of canMatchLine, so a line that is
// voided, moved or matched elsewhere leaves the result and so the choice. Disabled while
// there is none.
function useChosenLinesQuery(input: { account: string; side: MatchSide; ids: readonly string[] }) {
    const c = useLineCollections()
    const { account, side, ids } = input
    const query = useLiveQuery({
        query: q => {
            if (ids.length === 0) return null
            return lineRows(q, c, (columns, lineId) =>
                chosenWhere(columns, lineId, { account, side, ids })
            )
        },
        queryKey: ['books.match.chosen', account, side, ...ids],
    })
    return { query, sources: lineSources(c) }
}

type BankMatchInput = {
    drawer: ReviewDrawerModel
    canWrite: boolean
    batch: ReviewBatch
    currency: string
    // The list's row marks read the same view; a failed read of it is recovered by the
    // section's Retry too, so the marks come back with the options.
    suggestionsRecovery: LiveRecovery
    // The connection's ledger account and its label: the find mode lists its lines. The
    // drawer closes on an account change, so the open transaction is always of it.
    accountId: string
    accountLabel: string
}

// The drawer's Match section: the suggestions of the open For review transaction, the
// find mode's range and search, the choice, the totals and the match itself, run through
// the page's one batch. Hidden for an Excluded transaction and for a Reviewed one.
export function useBankMatch({
    drawer,
    canWrite,
    batch,
    currency,
    suggestionsRecovery,
    accountId,
    accountLabel,
}: BankMatchInput) {
    const { detail } = drawer
    const txnId = detail?.status === 'for_review' ? detail.id : null
    const side = matchSide(detail?.amount ?? 0)
    const { query, sources } = useMatchOptionsQuery(txnId)
    const writes = useServerActionState()
    const storedChosen = useBankingUIStore(s => s.matchChosen)
    const seededFor = useBankingUIStore(s => s.matchSeededFor)
    const takeMatchChoice = useBankingUIStore(s => s.takeMatchChoice)
    const refusal = useBankingUIStore(s => s.matchRefusal)
    const setMatchRefusal = useBankingUIStore(s => s.setMatchRefusal)
    const mode = useBankingUIStore(s => s.matchMode)
    const setMatchMode = useBankingUIStore(s => s.setMatchMode)
    const storedRange = useBankingUIStore(s => s.matchFindRange)
    const setMatchFindRange = useBankingUIStore(s => s.setMatchFindRange)
    const findSearch = useBankingUIStore(s => s.matchFindSearch)
    const setMatchFindSearch = useBankingUIStore(s => s.setMatchFindSearch)
    // The find mode's list pages on the drawer's own scroll, which the page draws; the
    // mounted find list hands its next-page call in here while it is mounted (useMatchFind).
    const findPager = useRef<() => void>(NO_PAGE)

    const isActive = txnId !== null
    const options = toOptions(isActive && query.isReady ? (query.data ?? NO_OPTIONS) : NO_OPTIONS)

    // One suggestion starts chosen; several start with none. Until the user changes the
    // choice of this transaction, it is derived here from the options as they stand; the
    // first change stores it (takeMatchChoice), so an uncheck stays.
    const [onlyOption] = options
    const isSeeded = seededFor === txnId
    const startChoice = options.length === 1 && onlyOption ? [onlyOption.lineId] : []
    const choiceIds = isSeeded ? storedChosen : startChoice
    const optionById = new Map(options.map(option => [option.lineId, option]))
    const foundIds = isActive ? choiceIds.filter(id => !optionById.has(id)) : NO_IDS
    const chosenLines = useChosenLinesQuery({ account: accountId, side, ids: foundIds })
    const hasFound = foundIds.length > 0
    const foundOptions = hasFound ? lineOptions(chosenLines.query.data ?? []) : []
    const foundById = new Map(foundOptions.map(option => [option.lineId, option]))

    const isError = isActive && (query.isError || (hasFound && chosenLines.query.isError))
    const isLoading = isActive && !query.isReady && !isError
    // A chosen line counts while the section can read it as matchable: a suggestion that
    // left the view (another bank transaction took it) and a found line that was voided,
    // moved or matched elsewhere are no longer chosen.
    const chosenOptions = choiceIds.flatMap(id => {
        const option = optionById.get(id) ?? foundById.get(id)
        return option ? [option] : []
    })
    const chosenIds = chosenOptions.map(option => option.lineId)
    // A found line just chosen counts once its read has its row; until both reads are
    // ready an id they do not hold yet stays in the choice, so a quick second toggle does
    // not drop it.
    const isSettled = query.isReady && (!hasFound || chosenLines.query.isReady)
    const heldIds = isSettled ? chosenIds : choiceIds
    // The chosen lines that are not suggestions, listed under the suggestions so the
    // choice made in the find mode shows there too.
    const foundChosen = chosenOptions.filter(option => !optionById.has(option.lineId))

    const totals = matchTotals(detail?.amount ?? 0, chosenOptions)
    // Only the drawer of the transaction being matched shows Match as sending; another
    // transaction's boxes stay disabled through batch.isPending.
    const isSending = txnId !== null && matchSendingFor(batch.pending, txnId)
    const submit = matchSubmitState({
        chosenCount: chosenIds.length,
        difference: totals.difference,
        target: totals.target,
        currency,
        isPending: batch.isPending,
        writesDisabled: writes.isDisabled,
        writesHint: writes.accessibilityHint,
    })

    // A new choice drops the refusal of the last one: the server's message was about it.
    const onToggle = (option: MatchOption) => {
        if (!txnId || !canWrite || batch.isPending) return
        const isChosen = heldIds.includes(option.lineId)
        const next = isChosen
            ? heldIds.filter(id => id !== option.lineId)
            : [...heldIds, option.lineId]
        takeMatchChoice(txnId, next)
        setMatchRefusal(null)
    }

    // The server moves a matched transaction to Reviewed, so the row leaves the tab and the
    // drawer closes. A failure keeps the drawer open with its text under the totals: the
    // server's message, or the transport text (the batch has logged it). The drawer may
    // show another transaction (or be closed) by the time the run ends; the outcome then
    // touches nothing here, and the batch's result line shows a failure (useReviewBatch).
    const settle = (id: string, outcome: BatchOutcome) => {
        if (useBankingUIStore.getState().openTxnId !== id) return
        if (outcome.done.includes(id)) {
            drawer.onClose()
            return
        }
        const failure = outcome.failed.find(f => f.id === id)
        if (!failure) return
        setMatchRefusal(failure.isTransport ? MATCH_TRANSPORT_TEXT : failure.message)
    }
    const onMatch = () => {
        if (!txnId || !canWrite || submit.isDisabled) return
        setMatchRefusal(null)
        void batch
            .run({
                kind: 'match',
                ids: [txnId],
                summary: '',
                origin: 'drawer',
                matchLines: { [txnId]: chosenIds },
            })
            .then(outcome => settle(txnId, outcome))
            .catch(err => log.error('books.banking', err))
    }

    const chosenRecovery: LiveRecovery[] =
        hasFound && chosenLines.query.collection
            ? [{ queries: [chosenLines.query.collection], sources: chosenLines.sources }]
            : []
    const optionsRecovery: LiveRecovery = mergeRecoveries([
        ...(query.collection ? [{ queries: [query.collection], sources }] : []),
        ...chosenRecovery,
        suggestionsRecovery,
    ])
    const onRetry = () => {
        void recoverLiveQueries({
            ...optionsRecovery,
            onError: err => log.error('books.banking', err),
        })
    }

    // The find mode's last valid range (or the suggestion window around the bank date) and
    // its search after the field's delay. Both reset with the rest of the section
    // (banking-ui-store).
    const bankDate = detail?.date ?? ''
    const findRange: FindRange = storedRange ?? defaultFindRange(bankDate)

    const kind: 'hidden' | 'match' | 'matched' = isActive ? 'match' : 'hidden'
    return {
        kind,
        txnId,
        canWrite,
        options,
        chosenIds: heldIds,
        chosenOptions,
        foundChosen,
        onToggle,
        totals,
        submit,
        onMatch,
        isSending,
        // The boxes take no change while any batch run is in flight.
        isChoiceDisabled: batch.isPending,
        refusal,
        emptyText: detail ? matchEmptyText(detail.amount, detail.date, currency) : '',
        isLoading,
        isError,
        onRetry,
        optionsRecovery,
        mode,
        // A reader has no find mode (no button, no key F).
        onFind: () => {
            if (canWrite) setMatchMode('find')
        },
        onBack: () => setMatchMode('suggestions'),
        find: {
            accountId,
            accountLabel,
            side,
            range: findRange,
            search: findSearch,
            currency,
            setRange: setMatchFindRange,
            setSearch: setMatchFindSearch,
            pager: findPager,
        },
        // The drawer's scroll neared its end: the find list loads its next page.
        onNearEnd: () => {
            if (mode === 'find') findPager.current()
        },
    }
}

export type BankMatchModel = ReturnType<typeof useBankMatch>

// The find mode's From and To: a zod form (findRangeSchema). A valid pair becomes the
// query's range; an invalid one shows its error and the query keeps the last valid range.
// The form starts from the section's range and is keyed by the transaction (MatchSection),
// so another transaction starts afresh.
export function useFindRangeForm(model: BankMatchModel) {
    const form = useForm<FindRange>({
        resolver: zodResolver(findRangeSchema),
        defaultValues: model.find.range,
        mode: 'onChange',
    })
    const from = useController({ control: form.control, name: 'from' })
    const to = useController({ control: form.control, name: 'to' })
    // Core DateField reports a cleared field as null; the schema reads it as '' and shows
    // the date message. Both fields are checked again, as From after To is a rule of both.
    const change = (name: keyof FindRange, next: string | null) => {
        form.setValue(name, next ?? '', { shouldDirty: true })
        void form.trigger()
        const parsed = findRangeSchema.safeParse(form.getValues())
        if (parsed.success) model.find.setRange(parsed.data)
    }
    const errors = form.formState.errors
    return {
        from: from.field.value,
        to: to.field.value,
        onFrom: (next: string | null) => change('from', next),
        onTo: (next: string | null) => change('to', next),
        error: errors.from?.message ?? errors.to?.message ?? null,
    }
}

// The find mode's search field: the draft as typed stays in the field's component (keyed
// by the transaction, so it starts afresh for another), and only the text after a pause in
// typing (SEARCH_DELAY_MS) goes to the store the query reads, so a key press renders the
// field alone, not the Banking screen.
export function useFindSearch(model: BankMatchModel) {
    const { search, setSearch } = model.find
    const [draft, setDraft] = useState(search)
    const applied = useDebouncedValue(draft, SEARCH_DELAY_MS)
    useEffect(() => {
        if (applied !== search) setSearch(applied)
    }, [applied, search, setSearch])
    return { query: draft, setQuery: setDraft }
}

// Every matchable line of the account on the bank amount's side inside the range, under
// the search, newest first, a page at a time (findWhere).
function useFindQuery(input: FindWhereInput) {
    const c = useLineCollections()
    const queryKey = [
        'books.match.find',
        input.account,
        input.side,
        input.from,
        input.to,
        input.search,
        input.currency,
    ]
    const query = useLiveInfiniteQuery(q => lineRows(q, c, columns => findWhere(columns, input)), {
        queryKey,
        pageSize: LIST_PAGE_SIZE,
    })
    return { query, sources: lineSources(c) }
}

// The find mode's list: the chosen lines the query does not list (a search or the range
// hides them) first, in the order they were chosen, then the query's matchable rows. Its
// states: loading, the load error with Retry over the find query and the section's reads,
// empty (findEmptyText), and the next page loading at the list's end. Called by the find
// mode only, so its query runs only while the find mode shows (useLiveInfiniteQuery
// cannot be disabled).
export function useMatchFind(model: BankMatchModel) {
    const { find } = model
    const { query, sources } = useFindQuery({
        account: find.accountId,
        side: find.side,
        from: find.range.from,
        to: find.range.to,
        search: find.search,
        currency: find.currency,
    })
    const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
    const found = lineOptions(query.data)
    // The drawer's scroll asks for the next page through the pager while this list is
    // mounted; an unmounted list leaves the no-op behind, never a closure of a gone query.
    const { pager } = find
    useEffect(() => {
        pager.current = () => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
        }
        return () => {
            pager.current = NO_PAGE
        }
    }, [pager, hasNextPage, isFetchingNextPage, fetchNextPage])
    // A page the guard after the query thinned (matchableLines) may leave the list too
    // short to scroll, so the next page is asked for without one while later pages exist.
    const needsMore =
        query.isReady && hasNextPage && !isFetchingNextPage && found.length < LIST_PAGE_SIZE
    useEffect(() => {
        if (needsMore) void fetchNextPage()
    }, [needsMore, fetchNextPage])
    const foundIds = new Set(found.map(option => option.lineId))
    const hidden = model.chosenOptions.filter(option => !foundIds.has(option.lineId))
    const state = findViewState(query.isError, query.isReady, found.length, hasNextPage)
    const hasSearch = searchPieces(find.search).length > 0
    const onRetry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([{ queries: [query.collection], sources }, model.optionsRecovery]),
            onError: err => log.error('books.banking', err),
        })
    }
    return {
        rows: [...hidden, ...found],
        state,
        emptyText: findEmptyText(find.accountLabel, find.range.from, find.range.to, hasSearch),
        isFetchingNextPage,
        onRetry,
    }
}

export type MatchFindModel = ReturnType<typeof useMatchFind>
