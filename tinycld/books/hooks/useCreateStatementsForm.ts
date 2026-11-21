import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { useForm, useWatch, zodResolver } from '@tinycld/core/ui/form'
import { router } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type FieldErrors, get, type Resolver } from 'react-hook-form'
import type { ListScrollHandle } from '../components/ListTable'
import { mergeRecoveries } from '../lib/live-recovery'
import { writeRefusalText } from '../lib/refusal'
import { isIsoDay, todayIso } from '../lib/register-range'
import {
    filterRecipients,
    mergeRecipients,
    type RecipientRow,
    recipientTotal,
    sortRecipients,
    tickState,
} from '../lib/statement-recipients'
import {
    type CreateStatementsValues,
    createStatementsSchema,
    defaultStatementOptions,
    previewStatementsSchema,
    STATEMENT_MESSAGES,
    type StatementRecipientValue,
} from '../lib/statement-schema'
import {
    type StatementBalanceFilter,
    savedNotSentText,
    savedToast,
    sentToast,
    statementBarState,
} from '../lib/statement-texts'
import {
    type SavedStatement,
    type StatementRunOutcome,
    useStatementsStore,
} from '../stores/statements-store'
import { useBooksSettings } from './useBooksSettings'
import { type StatementRun, useCreateStatements } from './useCreateStatements'
import { useEmailStatus } from './useEmailStatus'
import { useFormLeaveGuard } from './useFormLeaveGuard'
import { useStatementPreview } from './useStatementPreview'
import { useStatementRecipients } from './useStatementRecipients'

const TOAST_MS = 4000

// The user's choices, keyed by customer id: an entry exists only for a customer whose tick
// or address the user set. A customer with no entry takes the default (mergeRecipients).
type StatementChoices = Record<string, StatementRecipientValue>

// `check` names the rules of the pressed button, set before its submit: `run` for Save and
// Save and send (createStatementsSchema), `preview` for Preview (previewStatementsSchema).
export type CreateStatementsFormValues = Omit<CreateStatementsValues, 'recipients'> & {
    choices: StatementChoices
    check: 'run' | 'preview'
}

const choiceEmailPath = (customer: string) => `choices.${customer}.email` as const

// The customers Customer balance lists, in the list's order.
function listedOf(rows: readonly RecipientRow[], filter: StatementBalanceFilter): RecipientRow[] {
    return sortRecipients(filterRecipients(rows, filter))
}

// One entry per listed customer: the user's choice, else the default.
function recipientsOf(
    choices: StatementChoices,
    listed: readonly RecipientRow[],
    only: string | undefined
): StatementRecipientValue[] {
    return mergeRecipients(Object.values(choices), listed, only)
}

// The run as `createStatementsSchema` and useCreateStatements.save see it: the options and
// the recipients array of the customers listed now, built from the choices.
function runValuesOf(
    values: CreateStatementsFormValues,
    rows: readonly RecipientRow[],
    only: string | undefined
): CreateStatementsValues {
    const { choices, check: _check, ...runOptions } = values
    const listed = listedOf(rows, runOptions.balanceFilter)
    return { ...runOptions, recipients: recipientsOf(choices, listed, only) }
}

// The danger line of each customer whose saved statement the last run failed to send, keyed
// by customer id (spec §3.4): the statement's number and the server's message. A customer
// with no saved entry left (its send succeeded later) has none.
function notSentLinesOf(
    outcome: StatementRunOutcome | null,
    saved: Record<string, SavedStatement>
): Map<string, string> {
    const lines = new Map<string, string>()
    for (const failure of outcome?.failed ?? []) {
        const entry = saved[failure.customer]
        if (failure.saved === null || entry === undefined) continue
        lines.set(failure.customer, savedNotSentText(entry.number, failure.message))
    }
    return lines
}

/**
 * Validates the run (runValuesOf) with the schema `check` names: `createStatementsSchema`,
 * or `previewStatementsSchema` for Preview. An address issue at `recipients.<i>.email` is
 * given to that row's own field, `choices.<id>.email`. The schemas have no transform, so on
 * success the form submits its own values, and the press builds the run from them with the
 * same runValuesOf.
 */
function statementsResolver(
    rows: readonly RecipientRow[],
    only: string | undefined
): Resolver<CreateStatementsFormValues> {
    const checkRun = zodResolver(createStatementsSchema)
    const checkPreview = zodResolver(previewStatementsSchema)
    return async (values, context, options) => {
        const run = runValuesOf(values, rows, only)
        const check = values.check === 'preview' ? checkPreview : checkRun
        const result = await check(run, context, {
            criteriaMode: options.criteriaMode,
            fields: {},
            shouldUseNativeValidation: false,
        })
        if (Object.keys(result.errors).length === 0) return { values, errors: {} }
        const listed = listedOf(rows, values.balanceFilter)
        const { recipients: _recipients, ...others } = result.errors
        const choiceErrors: Record<string, { email: unknown }> = {}
        listed.forEach((row, index) => {
            // From the errors object: react-hook-form's `get` reads nothing from an array.
            const email = get(result.errors, `recipients.${index}.email`)
            if (email !== undefined) choiceErrors[row.customer] = { email }
        })
        const errors = { ...others, choices: choiceErrors }
        return { values: {}, errors: errors as FieldErrors<CreateStatementsFormValues> }
    }
}

/**
 * The state and handlers of Create statements (statements spec §3.2-§3.4, §3.10).
 *
 * As usePayBillsForm, the form holds the user's choices keyed by customer id, and the
 * listed entries are derived during render from the live rows and those choices
 * (mergeRecipients): a tick or a typed address stays while its customer leaves the list
 * and comes back, and a live change needs no copy into the form. With `?customer`, only
 * that customer is ticked by default, also one that joins the list later.
 *
 * The leave guard reads the form's own dirty state: an option changed or a choice made.
 */
export function useCreateStatementsForm({
    customer,
    canWrite,
}: {
    customer: string | undefined
    canWrite: boolean
}) {
    const orgHref = useOrgHref()
    const settings = useBooksSettings()
    const writes = useWritesAvailable()
    const isHeld = useStatementsStore(state => state.isHeld)
    const outcome = useStatementsStore(state => state.outcome)
    const saved = useStatementsStore(state => state.saved)
    const createStatements = useCreateStatements()
    const emailStatus = useEmailStatus()
    const preview = useStatementPreview()
    // The last run's notice and the saved, unsent statements belong to this screen: they go
    // when the screen does.
    useEffect(() => () => useStatementsStore.getState().reset(), [])
    // The defaults are read once, when the form mounts.
    const [initial] = useState<CreateStatementsFormValues>(() => ({
        ...defaultStatementOptions(todayIso()),
        balanceFilter: customer ? 'all' : 'open',
        intent: 'save',
        check: 'run',
        choices: {},
    }))
    // The last real day of Statement date, the overdue query's key: a day being typed key
    // by key passes through texts that are no day, and those do not re-key the query.
    const [overdueDay, setOverdueDay] = useState(initial.statementDate)
    // Set by End date's own change and never reset (lesson 25): End date follows Statement
    // date only while the user has not typed in it, also when the typed day is the default.
    const isEndDateTyped = useRef(false)
    const [isDiscardOpen, setIsDiscardOpen] = useState(false)
    // Keeps the guard off from the Save press to the move it makes.
    const [isLeaving, setIsLeaving] = useState(false)
    // The list's imperative scroll: each refused Save and send scrolls its first row with a
    // missing address into view (spec §3.4), also the same row again; a live change does not.
    const listScroll = useRef<ListScrollHandle>(null)

    const list = useStatementRecipients({ overdueDay })
    const resolver = useMemo(() => statementsResolver(list.rows, customer), [list.rows, customer])
    const form = useForm<CreateStatementsFormValues>({
        resolver,
        defaultValues: initial,
    })
    const { control, getValues, setValue, handleSubmit, setError, trigger } = form
    // Read in render: the form state proxy updates these only once read here.
    const { isSubmitted, isDirty, errors } = form.formState
    const [type, balanceFilter, choices, runIntent] = useWatch({
        control,
        name: ['type', 'balanceFilter', 'choices', 'intent'],
    })

    const listed = listedOf(list.rows, balanceFilter)
    const recipients = recipientsOf(choices, listed, customer)
    const notSentLines = notSentLinesOf(outcome, saved)
    const entries = listed.map((row, index) => ({
        row,
        isTicked: recipients[index].ticked,
        email: recipients[index].email,
        error: get(errors, `${choiceEmailPath(row.customer)}.message`) ?? '',
        notSent: notSentLines.get(row.customer) ?? '',
    }))
    const tickedCount = recipients.filter(recipient => recipient.ticked).length
    const total = recipientTotal(list.rows, recipients)
    const tickAll = tickState(recipients)

    const isLoadError = list.isError || settings.hasLoadError
    const isListLoading = !isLoadError && (list.isLoading || !settings.isReady)
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([list.recovery, settings.recovery]),
            onError: err => log.error('books.statements', err),
        })
    }

    const leave = () => {
        if (router.canGoBack()) {
            router.back()
            return
        }
        const fallback = customer ? `books/customers/${customer}` : 'books/customers'
        router.replace(orgHref(fallback))
    }
    const leaveGuard = useFormLeaveGuard({
        isDirty,
        isWriting: isHeld || isLeaving,
        cancel: () => (isDirty ? setIsDiscardOpen(true) : leave()),
        leave,
        question: {
            isOpen: isDiscardOpen,
            discard: () => {
                setIsDiscardOpen(false)
                leave()
            },
            keepEditing: () => setIsDiscardOpen(false),
        },
    })

    // The listed entries now, from the form's current values (a handler may run before
    // the next render).
    const currentRecipients = () => runValuesOf(getValues(), list.rows, customer).recipients

    // Stores the changed entries as the user's choices. After a submit, the touched rows'
    // addresses are checked again by their leaf paths.
    const choose = (changed: readonly StatementRecipientValue[]) => {
        const next = { ...getValues('choices') }
        for (const recipient of changed) next[recipient.customer] = recipient
        setValue('choices', next, { shouldDirty: true })
        if (isSubmitted) void trigger(changed.map(recipient => choiceEmailPath(recipient.customer)))
    }

    const onToggle = (id: string) => {
        const recipient = currentRecipients().find(entry => entry.customer === id)
        if (recipient === undefined) return
        choose([{ ...recipient, ticked: !recipient.ticked }])
    }
    // The heading tick box: every row ticked unticks all, else it ticks all.
    const onToggleAll = () => {
        const current = currentRecipients()
        const isAll = tickState(current) === 'all'
        choose(current.map(recipient => ({ ...recipient, ticked: !isAll })))
    }
    const onEmailChange = (id: string, email: string) => {
        const recipient = currentRecipients().find(entry => entry.customer === id)
        if (recipient === undefined) return
        choose([{ ...recipient, email }])
    }

    const onStatementDateChange = (value: string) => {
        if (isIsoDay(value)) setOverdueDay(value)
        if (isEndDateTyped.current) return
        setValue('endDate', value, { shouldValidate: isSubmitted })
    }
    const onEndDateChange = () => {
        isEndDateTyped.current = true
    }

    // A run (Save or Save and send, by the form's `intent`). A full success leaves with its
    // toast. When a part failed, the run notice (the store's outcome) tells which, and the
    // customers that went through lose their tick, so a second press repeats only the
    // failed rows (spec §3.4).
    const submit = handleSubmit(
        async values => {
            const run = runValuesOf(values, list.rows, customer)
            const start =
                values.intent === 'send' ? createStatements.saveAndSend : createStatements.save
            let ran: StatementRun
            try {
                ran = await start(run)
            } catch (error) {
                setIsLeaving(false)
                setError('root', { type: 'server', message: writeRefusalText(error) })
                return
            }
            if (ran.outcome.failed.length === 0) {
                const toast = values.intent === 'send' ? sentToast : savedToast
                useToastStore.getState().addToast({
                    title: toast(ran.outcome.done),
                    variant: 'success',
                    duration: TOAST_MS,
                })
                leave()
                return
            }
            setIsLeaving(false)
            const succeeded = new Set(ran.succeeded)
            const unticked = currentRecipients()
                .filter(recipient => succeeded.has(recipient.customer))
                .map(recipient => ({ ...recipient, ticked: false }))
            if (unticked.length > 0) choose(unticked)
        },
        invalid => {
            setIsLeaving(false)
            // The listed order: currentRecipients lists the rows as the list draws them.
            const index = currentRecipients().findIndex(
                recipient =>
                    get(invalid, `${choiceEmailPath(recipient.customer)}.message`) ===
                    STATEMENT_MESSAGES.missingAddress
            )
            if (index >= 0) listScroll.current?.scrollToIndex(index)
        }
    )
    // The pressed button sets `intent` before the check, so the schema's send-only rule
    // reads it. The guard goes off before the write starts: the move after a full success
    // is the run's own. A failed run or a validation error turns it back on.
    const startRun = (intent: CreateStatementsValues['intent']) => {
        setValue('check', 'run')
        setValue('intent', intent)
        setIsLeaving(true)
        void submit()
    }
    const onSave = () => startRun('save')
    const onSaveAndSend = () => startRun('send')

    // Preview checks the options and the tick count (previewStatementsSchema: the PDF holds
    // no address), then asks for the PDF; it stores nothing and does not leave.
    const previewSubmit = handleSubmit(values => {
        preview.open(runValuesOf(values, list.rows, customer))
    })
    const onPreview = () => {
        setValue('check', 'preview')
        void previewSubmit()
    }

    const bar = statementBarState({
        canWrite,
        writesAvailable: writes.available,
        tickedCount,
        isLoading: isListLoading,
        hasLoadError: isLoadError,
        isHeld,
        intent: runIntent,
        canSend: emailStatus.canSend,
        emailStatusLoading: emailStatus.isLoading,
        isPreparing: preview.isPreparing,
    })

    return {
        control,
        hasPeriod: type === 'balance_forward',
        balanceFilter,
        errors,
        currency: settings.settings?.currency ?? 'USD',
        isHeld,
        listState: listStateOf({ isListLoading, isLoadError, count: entries.length }),
        entries,
        scrollToIndex: scrollIndexOf(entries, customer),
        listScroll,
        tickedCount,
        total,
        tickAll,
        bar,
        leaveGuard,
        retry,
        onToggle,
        onToggleAll,
        onEmailChange,
        onStatementDateChange,
        onEndDateChange,
        onSave,
        onSaveAndSend,
        onPreview,
        preview,
    }
}

function listStateOf(input: { isListLoading: boolean; isLoadError: boolean; count: number }) {
    if (input.isLoadError) return 'error' as const
    if (input.isListLoading) return 'loading' as const
    return input.count === 0 ? ('empty' as const) : ('list' as const)
}

// With `?customer`, that customer's row: where the list starts.
function scrollIndexOf(
    entries: readonly { row: RecipientRow }[],
    customer: string | undefined
): number | undefined {
    if (customer === undefined) return undefined
    const index = entries.findIndex(entry => entry.row.customer === customer)
    return index < 0 ? undefined : index
}
