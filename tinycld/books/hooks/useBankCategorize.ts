import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { type ScopeOwner, type Shortcut, useRegisterShortcuts } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { isFormSubmittable, useForm, zodResolver } from '@tinycld/core/ui/form'
import { newRecordId } from 'pbtsdb/core'
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { useSearchPicker } from '../components/SearchPicker'
import {
    type BankTransferFormValues,
    bankTransferRefusalField,
    bankTransferSchema,
    type CategorizationLine,
    type CategorizeFormValues,
    CHOOSE_ACCOUNT_TEXT,
    CHOOSE_OTHER_ACCOUNT_TEXT,
    categorizeAccountOptions,
    categorizeLines,
    categorizeRefusalField,
    categorizeSchema,
    categorizeSubmitState,
    defaultWay,
    nextTxnId,
    pickerStateOf,
    SEND_FAILED_TEXT,
    type TxnWay,
    transferLine,
    transferPickerOptions,
    transferSummaryText,
    wayViewOf,
} from '../lib/bank-categorize'
import { batchFailure } from '../lib/bank-review'
import { parsePartyOptionId } from '../lib/line-party-options'
import { mergeRecoveries } from '../lib/live-recovery'
import { useBankingUIStore } from '../stores/banking-ui-store'
import type { BooksBankCategorizations } from '../types'
import type { BankMatchModel } from './useBankMatch'
import { useLinePartyOptions } from './useLinePartyOptions'
import type { ReviewBatch } from './useReviewBatch'
import type { ReviewDrawerModel } from './useReviewDrawer'

// The accounts of the book, for the Categorize and Transfer pickers. Every account is read,
// inactive ones too, because a sub-account's depth comes from the whole chart; the pure
// helpers offer the active ones only. The read runs only while the way switch shows for a
// writer (`isEnabled`): a reader sees no form, and a Banking visit with no open For review
// transaction needs no chart.
function useCategorizeAccounts(isEnabled: boolean) {
    const [accountsCollection] = useStore('books_accounts')
    const query = useLiveQuery({
        query: q => {
            if (!isEnabled) return null
            return q.from({ account: accountsCollection }).select(({ account }) => ({
                id: account.id,
                name: account.name,
                number: account.number,
                type: account.type,
                parent: account.parent,
                inactive: account.inactive,
            }))
        },
        queryKey: ['books.categorize.accounts', isEnabled],
    })
    const retryLoad = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([{ queries: [query.collection], sources: [accountsCollection] }]),
            onError: err => log.error('books.banking', err),
        })
    }
    return {
        accounts: query.data ?? [],
        isReady: query.isReady,
        isError: query.isError,
        retryLoad,
    }
}

type CategorizePayload = Pick<BooksBankCategorizations, 'kind' | 'customer' | 'vendor' | 'memo'> & {
    lines: CategorizationLine[]
}

// How a failed write reaches the form: the server's message, or the transport text.
type Refusal = { message: string; isTransport: boolean }

type FixedWay = { txnId: string; way: TxnWay }

// The default way of the open transaction, fixed the first time its switch shows, so a
// suggestion that arrives by realtime while the user fills Categorize does not flip the
// way to Match and drop the typed values. The value belongs to this render's open
// transaction, and the switch first shows during a render (no event marks it), so it is
// React state adjusted during render (the "store information from previous renders"
// pattern): no effect copies it, and no ref is written in render. A close forgets it, so
// opening the same row again decides afresh.
function useFixedDefaultWay(openTxnId: string | null, isShown: boolean, liveWay: TxnWay) {
    const [fixed, setFixed] = useState<FixedWay | null>(null)
    if (openTxnId === null) {
        if (fixed !== null) setFixed(null)
        return liveWay
    }
    if (fixed?.txnId === openTxnId) return fixed.way
    if (isShown) setFixed({ txnId: openTxnId, way: liveWay })
    return liveWay
}

type BankCategorizeInput = {
    drawer: ReviewDrawerModel
    // The drawer's Match section: its suggestion count and load state decide the default way.
    match: BankMatchModel
    // The connection's ledger account, which neither picker offers.
    connectionAccountId: string
    currency: string
    canWrite: boolean
    batch: ReviewBatch
    // The For review tab's shown row ids, in list order (ReviewTabBody sets them).
    shownRowIds: RefObject<readonly string[]>
}

function isHtmlElement(value: unknown): value is HTMLElement {
    return typeof HTMLElement !== 'undefined' && value instanceof HTMLElement
}

// The drawer's way switch and its Categorize and Transfer ways: which way shows, the
// accounts both pickers offer, and the one insert into books_bank_categorizations. The
// forms themselves live in the sections (useCategorizeForm, useBankTransferForm), which
// the drawer keys by the transaction, so another transaction starts with fresh forms.
export function useBankCategorize({
    drawer,
    match,
    connectionAccountId,
    currency,
    canWrite,
    batch,
    shownRowIds,
}: BankCategorizeInput) {
    const { detail, wayFormNode } = drawer
    const [categorizations] = useStore('books_bank_categorizations')
    const writes = useServerActionState()
    const openTxnId = useBankingUIStore(s => s.openTxnId)
    const txnWay = useBankingUIStore(s => s.txnWay)
    const isAdding = useBankingUIStore(s => s.isAdding)
    const addingTxnId = useBankingUIStore(s => s.addingTxnId)
    const setTxnWay = useBankingUIStore(s => s.setTxnWay)
    const startAdding = useBankingUIStore(s => s.startAdding)
    const finishAdding = useBankingUIStore(s => s.finishAdding)
    const setAddedNote = useBankingUIStore(s => s.setAddedNote)
    const setFailedNote = useBankingUIStore(s => s.setFailedNote)
    const openNextTxn = useBankingUIStore(s => s.openNextTxn)

    // The write in flight is of the shown transaction: its form stays up, disabled, through
    // the write (the row may turn Reviewed by realtime before the insert settles). A write
    // of a row the drawer moved on from only disables the submit here (isAdding).
    const isSending = isAdding && detail !== null && addingTxnId === detail.id
    const status = isSending ? 'for_review' : (detail?.status ?? '')
    const view = detail
        ? wayViewOf({ canWrite, status, suggestionsReady: isSending || !match.isLoading })
        : 'none'

    const accounts = useCategorizeAccounts(canWrite && view === 'switch')
    const categorizeOptions = categorizeAccountOptions(accounts.accounts, connectionAccountId)
    const transferOptions = transferPickerOptions(accounts.accounts, connectionAccountId)
    const pickerRead = {
        isLoading: !accounts.isReady,
        isError: accounts.isError,
    }
    const categorizePicker = pickerStateOf({ ...pickerRead, options: categorizeOptions })
    const transferPicker = pickerStateOf({ ...pickerRead, options: transferOptions })

    // A failed read of the suggestions opens on Match, whose section shows the error and
    // its Retry; else the suggestions decide (match.suggestionCount counts every one).
    const { suggestionCount } = match
    const liveWay: TxnWay = match.isError ? 'match' : defaultWay(suggestionCount)
    const ownWay = useFixedDefaultWay(openTxnId, view === 'switch', liveWay)
    const way = txnWay ?? ownWay

    const send = useMutation({
        mutationFn: function* (row: CategorizePayload & { id: string; bank_transaction: string }) {
            yield categorizations.insert(row)
        },
        // The caller of mutateAsync shows every failure, in its form or the result line.
        onError: () => {},
    })

    // Next is read at the press: the row leaves the list by realtime before the write
    // settles. The write flag holds until this write settles, wherever the drawer or the
    // screen goes; the categorization id is the write's id, so the settle clears only its
    // own flag. A drawer that moved on (Esc, another row, even back to this row, whose form
    // is then a new one) is left where it is: a success shows its "Added …" line. A failure
    // goes to the form that sent it while that form is mounted (`refuse` returns false
    // when it is not: the screen left, the section unmounted), else to the failed note in
    // the result place under the toolbar.
    const submit = (payload: CategorizePayload, refuse: (refusal: Refusal) => boolean) => {
        const state = useBankingUIStore.getState()
        if (!detail || state.isAdding || batch.isPending || writes.isDisabled) return
        const txnId = detail.id
        const description = detail.description
        const next = nextTxnId(shownRowIds.current, txnId)
        const id = newRecordId()
        setTxnWay(way)
        startAdding(txnId, id)
        batch.clearResult()
        setFailedNote(null)
        let hasMovedOn = false
        const stopWatching = useBankingUIStore.subscribe(s => {
            if (s.openTxnId !== txnId) hasMovedOn = true
        })
        send.mutateAsync({ id, bank_transaction: txnId, ...payload })
            .then(() => {
                stopWatching()
                setAddedNote({ id })
                if (!hasMovedOn) openNextTxn(next, true)
                finishAdding(id)
            })
            .catch((err: unknown) => {
                stopWatching()
                finishAdding(id)
                const failure = batchFailure(txnId, err)
                if (failure.isTransport) {
                    log.warn('books.banking', 'bank categorization not sent', {
                        kind: payload.kind,
                    })
                }
                const refusal = { message: failure.message, isTransport: failure.isTransport }
                if (!hasMovedOn && refuse(refusal)) return
                const text = failure.isTransport ? SEND_FAILED_TEXT : failure.message
                setFailedNote({ txnId, description, text })
            })
    }

    // The switch takes no change while the shown row's write is sent. The keys C and T
    // also ask for the focus in the way's account field. Stable: it reads the store when
    // called, so the way keys need not re-register on a render.
    const onWay = useCallback((next: TxnWay, takeFocus = false) => {
        const current = useBankingUIStore.getState()
        if (current.isAdding && current.addingTxnId === current.openTxnId) return
        current.setTxnWay(next)
        if (takeFocus) current.setFocusForm(true)
    }, [])

    // The shown section registers its wrapper node here, for Esc (leaveWayField).
    const attachWayForm = useCallback(
        (instance: unknown) => {
            wayFormNode.current = isHtmlElement(instance) ? instance : null
        },
        [wayFormNode]
    )

    const amount = detail?.amount ?? 0
    return {
        view,
        way,
        suggestionCount,
        // Any Categorize or Record transfer is sent: no second send starts.
        isAdding,
        // The shown transaction's own write is sent: its fields, its switch and its
        // button show it.
        isSending,
        onWay,
        wayFormNode,
        attachWayForm,
        formKey: detail?.id ?? '',
        bankAmount: amount,
        isSpent: amount < 0,
        description: detail?.description ?? '',
        currency,
        transferSummary: transferSummaryText(amount, detail?.accountLabel ?? '', currency),
        categorizeOptions,
        transferOptions,
        categorizePicker,
        transferPicker,
        retryLoad: accounts.retryLoad,
        isBatchPending: batch.isPending,
        writesDisabled: writes.isDisabled,
        writesHint: writes.accessibilityHint,
        submit,
    }
}

export type BankCategorizeModel = ReturnType<typeof useBankCategorize>

// The refusal of a one-line form that names the line's amount has no amount field to sit
// under (the amount is the bank's), so it goes on the form root.
function categorizeRefusalPath(message: string, lineCount: number) {
    const field = categorizeRefusalField(message)
    if (field === null) return null
    if (field.endsWith('.amount') && lineCount === 1) return null
    return field
}

// The submit state both forms share (categorizeSubmitState).
function submitStateOf(
    model: BankCategorizeModel,
    input: { isValid: boolean; invalidHint: string; payeeLoadFailed: boolean }
) {
    const picker = model.way === 'transfer' ? model.transferPicker : model.categorizePicker
    return categorizeSubmitState({
        ...input,
        loadFailed: picker.loadFailed,
        isAdding: model.isAdding,
        isBatchPending: model.isBatchPending,
        writesDisabled: model.writesDisabled,
        writesHint: model.writesHint,
    })
}

// Whether the form is still mounted when its write settles: a refusal set on an unmounted
// form is lost, so `refuse` reports false and submit puts the text in the failed note.
function useIsMounted() {
    const isMounted = useRef(false)
    useEffect(() => {
        isMounted.current = true
        return () => {
            isMounted.current = false
        }
    }, [])
    return isMounted
}

// The Payee picker's read (useLinePartyOptions) lives in the form, so its failure keeps
// Categorize disabled. The read starts at the picker's first open and then runs for the
// rest of the form's life, so a failed read stays known after the picker closes; the
// first open is seen during a render (React state adjusted in render, no effect).
function usePayeeRead() {
    const picker = useSearchPicker()
    const [hasOpened, setHasOpened] = useState(false)
    if (picker.isOpen && !hasOpened) setHasOpened(true)
    const parties = useLinePartyOptions(picker.debouncedTerm, picker.isOpen || hasOpened)
    return { picker, parties }
}

export type PayeeRead = ReturnType<typeof usePayeeRead>

// The Categorize form of one transaction: Payee, Account, Memo (it starts as the bank
// description). A server refusal goes under the field it names, else on the form root.
export function useCategorizeForm(model: BankCategorizeModel) {
    const { bankAmount, currency } = model
    const schema = useMemo(() => categorizeSchema(bankAmount, currency), [bankAmount, currency])
    const form = useForm<CategorizeFormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            payee: '',
            memo: model.description,
            lines: [{ account: '', amount: '', memo: '' }],
        },
        mode: 'onChange',
    })
    const payee = usePayeeRead()
    const submitState = submitStateOf(model, {
        isValid: isFormSubmittable(form.formState),
        invalidHint: CHOOSE_ACCOUNT_TEXT,
        payeeLoadFailed: payee.parties.loadFailed,
    })
    const isMounted = useIsMounted()
    const refuse = (refusal: Refusal) => {
        if (!isMounted.current) return false
        if (refusal.isTransport) {
            form.setError('root.server', { message: SEND_FAILED_TEXT })
            return true
        }
        const path = categorizeRefusalPath(refusal.message, form.getValues('lines').length)
        if (path) form.setError(path, { message: refusal.message })
        else form.setError('root.server', { message: refusal.message })
        return true
    }
    const send = (values: CategorizeFormValues) => {
        const party = parsePartyOptionId(values.payee)
        model.submit(
            {
                kind: 'categorize',
                customer: party?.kind === 'customer' ? party.id : '',
                vendor: party?.kind === 'vendor' ? party.id : '',
                memo: values.memo,
                lines: categorizeLines(values, bankAmount),
            },
            refuse
        )
    }
    const onSubmit = () => {
        if (submitState.isDisabled) return
        void form.handleSubmit(send)()
    }
    return {
        control: form.control,
        payee,
        submitState,
        refusal: form.formState.errors.root?.server?.message ?? null,
        onSubmit,
    }
}

export type CategorizeFormModel = ReturnType<typeof useCategorizeForm>

// The Transfer form of one transaction: the other account and Memo. Every "Line n:"
// refusal names the one account field (bankTransferRefusalField).
export function useBankTransferForm(model: BankCategorizeModel) {
    const form = useForm<BankTransferFormValues>({
        resolver: zodResolver(bankTransferSchema),
        defaultValues: { account: '', memo: model.description },
        mode: 'onChange',
    })
    const submitState = submitStateOf(model, {
        isValid: isFormSubmittable(form.formState),
        invalidHint: CHOOSE_OTHER_ACCOUNT_TEXT,
        payeeLoadFailed: false,
    })
    const isMounted = useIsMounted()
    const refuse = (refusal: Refusal) => {
        if (!isMounted.current) return false
        if (refusal.isTransport) {
            form.setError('root.server', { message: SEND_FAILED_TEXT })
            return true
        }
        const field = bankTransferRefusalField(refusal.message)
        if (field) form.setError(field, { message: refusal.message })
        else form.setError('root.server', { message: refusal.message })
        return true
    }
    const send = (values: BankTransferFormValues) => {
        model.submit(
            {
                kind: 'transfer',
                customer: '',
                vendor: '',
                memo: values.memo,
                lines: transferLine(model.bankAmount, values.account),
            },
            refuse
        )
    }
    const onSubmit = () => {
        if (submitState.isDisabled) return
        void form.handleSubmit(send)()
    }
    return {
        control: form.control,
        submitState,
        refusal: form.formState.errors.root?.server?.message ?? null,
        onSubmit,
    }
}

export type BankTransferFormModel = ReturnType<typeof useBankTransferForm>

// The focused element when it is inside the shown Categorize or Transfer form (a picker
// trigger, Memo), on web: the section registers its wrapper node (attachWayForm), and the
// check is `contains`. Null elsewhere and on native.
function focusedWayField(formNode: RefObject<HTMLElement | null>): HTMLElement | null {
    if (typeof document === 'undefined') return null
    const node = formNode.current
    const active = document.activeElement
    if (!node || !isHtmlElement(active) || !node.contains(active)) return null
    return active
}

function isWayTextFieldFocused(formNode: RefObject<HTMLElement | null>): boolean {
    return focusedWayField(formNode)?.matches('input, textarea') ?? false
}

// Esc in a field of the Categorize or Transfer form: the field gives up the focus, so the
// focus returns to the page and the list keys work again. True when a field was left.
export function leaveWayField(formNode: RefObject<HTMLElement | null>): boolean {
    const field = focusedWayField(formNode)
    if (!field) return false
    field.blur()
    return true
}

const WAY_GROUP = 'Banking'

// The drawer's way keys, in the page's `list` scope (the drawer renders outside the
// page's ScopeProvider, so the page's owner comes in as a prop): C Categorize and T
// Transfer, each with the focus in its account field, and ⇧M Match (M alone is the Match
// button). Registered only while the switch shows (a writer, a For review transaction)
// and the shown row's write is not sent. They are not `allowInInputs`, so in a text field
// they are text. Esc in Memo is a key typed in a text field, which only an
// `allowInInputs` shortcut sees (core dispatch.ts), so it has its own, which leaves the
// field; Esc on a picker trigger is the list's Esc (useReviewShortcuts), which leaves it
// too.
export function useWayShortcuts(model: BankCategorizeModel, scopeOwner: ScopeOwner) {
    const isOffered = model.view === 'switch' && !model.isSending
    const { onWay, wayFormNode } = model
    const shortcuts = useMemo((): Shortcut[] => {
        if (!isOffered) return []
        return [
            {
                id: 'books.banking.way.categorize',
                keys: 'c',
                scope: 'list',
                description: 'Categorize the transaction',
                group: WAY_GROUP,
                run: () => onWay('categorize', true),
            },
            {
                id: 'books.banking.way.transfer',
                keys: 't',
                scope: 'list',
                description: 'Record the transaction as a transfer',
                group: WAY_GROUP,
                run: () => onWay('transfer', true),
            },
            {
                id: 'books.banking.way.match',
                keys: 'Shift+M',
                scope: 'list',
                description: 'Show the Match way',
                group: WAY_GROUP,
                run: () => onWay('match'),
            },
            {
                id: 'books.banking.way.leave-field',
                keys: 'Escape',
                scope: 'list',
                description: 'Leave the form field',
                group: WAY_GROUP,
                allowInInputs: true,
                when: () => isWayTextFieldFocused(wayFormNode),
                run: () => {
                    leaveWayField(wayFormNode)
                },
            },
        ]
    }, [isOffered, onWay, wayFormNode])
    useRegisterShortcuts(shortcuts, scopeOwner)
}

// The focus the store asks for once (`focusForm`: an open by a writer, the keys C and T,
// the next row after a Categorize or a Record transfer), on web: `focus` (a stable
// callback of the caller) receives the node of the element the shown way puts it on, and
// the request is cleared, so a later click elsewhere is not undone. Native has no focus
// to move (no soft keyboard on open).
export function useAskedFocus(isTaker: boolean, focus: (node: HTMLElement) => void) {
    const node = useRef<HTMLElement | null>(null)
    const focusForm = useBankingUIStore(s => s.focusForm)
    const setFocusForm = useBankingUIStore(s => s.setFocusForm)
    useEffect(() => {
        if (!focusForm || !isTaker || Platform.OS !== 'web') return
        if (node.current) focus(node.current)
        setFocusForm(false)
    }, [focusForm, isTaker, setFocusForm, focus])
    const attach = useCallback((instance: unknown) => {
        node.current = isHtmlElement(instance) ? instance : null
    }, [])
    return attach
}
