import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRecord } from '@tinycld/core/lib/use-record'
import { type FieldErrors, useForm, useWatch, zodResolver } from '@tinycld/core/ui/form'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { TextInput, View } from 'react-native'
import {
    amountsFromLines,
    buildOpening,
    centsFromAmounts,
    dayLabel,
    effectiveMemo,
    memoFor,
    type OpeningBand,
    type OpeningGroup,
    type OpeningRow,
    presetDate,
    previewFor,
} from '../lib/opening-balances'
import {
    lineRefusalMessage,
    problemMessage,
    refusalMessage,
    refusalNamesFormFields,
} from '../lib/opening-balances-messages'
import {
    type OpeningFormValues,
    type OpeningPreset,
    openingFormSchema,
} from '../lib/opening-balances-schema'
import { todayIso } from '../lib/register-range'
import { useOpeningPostStore } from '../stores/opening-post-store'
import { useBackToChart } from './useBackToChart'
import type { OpeningScreen } from './useOpeningBalancesScreen'
import { LineWriteError, useOpeningDraftWrites } from './useOpeningDraftWrites'

// The date picker's preset that produces this date today, else a custom date.
function presetOf(date: string, fiscalStartMonth: number): OpeningPreset {
    const today = todayIso()
    if (date === presetDate('last-fiscal-year', today, fiscalStartMonth)) return 'last-fiscal-year'
    if (date === presetDate('last-month', today, fiscalStartMonth)) return 'last-month'
    return 'custom'
}

function defaultValues(screen: OpeningScreen, fiscalStartMonth: number): OpeningFormValues {
    // A replace seeds from the posted entry exactly as a draft seeds from itself.
    if (screen.state.kind === 'draft' || screen.state.kind === 'replace') {
        const { date, memo } = screen.state.entry
        const amounts = amountsFromLines(
            screen.accounts,
            screen.savedLines,
            screen.equityAccount?.id ?? ''
        )
        // A blank memo is stored as the date's default text; seeding it blank again
        // keeps the memo following the date.
        return {
            preset: presetOf(date, fiscalStartMonth),
            date,
            memo: memo === memoFor(date) ? '' : memo,
            amounts,
        }
    }
    const date = presetDate('last-fiscal-year', todayIso(), fiscalStartMonth)
    return { preset: 'last-fiscal-year', date, memo: '', amounts: {} }
}

export type GridItem =
    | { kind: 'band'; band: OpeningBand; subtotal: number }
    | { kind: 'row'; row: OpeningRow; group: OpeningGroup }

export function gridItems(
    bands: readonly OpeningBand[],
    totals: Record<OpeningGroup, number>
): GridItem[] {
    return bands.flatMap((band): GridItem[] => [
        { kind: 'band', band, subtotal: totals[band.group] },
        ...band.rows.map((row): GridItem => ({ kind: 'row', row, group: band.group })),
    ])
}

// Before the first save the posted entry is replaced under its own number; once a
// draft exists the posted balances stay until it is posted.
function noticeText(postedNumber: string, draftReplacesNumber: string) {
    if (postedNumber !== '') {
        return `Posting this replaces ${postedNumber} under the same number. The original is voided.`
    }
    if (draftReplacesNumber !== '') {
        return `Posting this replaces ${draftReplacesNumber}. The posted balances stay until you post.`
    }
    return ''
}

export function useOpeningBalancesForm(screen: OpeningScreen) {
    const closeDate = screen.settings?.closeDate ?? ''
    const fiscalStartMonth = screen.settings?.fiscalStartMonth ?? 1
    const form = useForm<OpeningFormValues>({
        mode: 'onChange',
        resolver: zodResolver(openingFormSchema(closeDate)),
        defaultValues: defaultValues(screen, fiscalStartMonth),
    })
    const { setError, getValues, handleSubmit, reset, clearErrors } = form
    const { isDirty, errors } = form.formState
    // Amount errors show beside their input in the grid; the summary carries the rest.
    const { amounts: _amounts, ...rest } = errors
    const summaryErrors: FieldErrors<OpeningFormValues> = rest
    const [date, memo] = useWatch({ control: form.control, name: ['date', 'memo'] })
    const label = dayLabel(date)

    // SelectInput runs this after the form value changed, and the form value is
    // already typed OpeningPreset, so no string needs narrowing.
    const onPresetChange = () => {
        const preset: OpeningPreset = form.getValues('preset')
        if (preset === 'custom') return
        form.setValue('date', presetDate(preset, todayIso(), fiscalStartMonth), {
            shouldValidate: true,
        })
    }
    const onDateChange = () => form.setValue('preset', 'custom', { shouldDirty: true })

    // No React compiler in this repo, so the derived grid data is memoized by hand:
    // a keystroke in one amount must not rebuild the whole item list.
    const amounts = useWatch({ control: form.control, name: 'amounts' })
    const cents = useMemo(() => centsFromAmounts(amounts), [amounts])
    const build = useMemo(() => buildOpening(screen.accounts, cents), [screen.accounts, cents])
    const preview = useMemo(() => previewFor(screen.accounts, cents), [screen.accounts, cents])
    const isBlocked = build.problem !== null
    const blockMessage = problemMessage(build.problem)
    const items = useMemo(
        () =>
            gridItems(screen.bands, {
                asset: build.totals.assets,
                liability: build.totals.liabilities,
                equity: build.totals.equity,
            }),
        [screen.bands, build]
    )

    const inputs = useRef(new Map<string, TextInput>())
    const refCallbacks = useRef(new Map<string, (node: TextInput | null) => void>())
    const registerInput = useCallback((accountId: string, node: TextInput | null) => {
        if (node) inputs.current.set(accountId, node)
        else inputs.current.delete(accountId)
    }, [])
    // One callback per account for the life of the form, so React does not detach and
    // re-attach every input ref on each render.
    const inputRefFor = useCallback(
        (accountId: string) => {
            const known = refCallbacks.current.get(accountId)
            if (known) return known
            const callback = (node: TextInput | null) => registerInput(accountId, node)
            refCallbacks.current.set(accountId, callback)
            return callback
        },
        [registerInput]
    )
    const rowIds = useMemo(
        () => screen.bands.flatMap(band => band.rows.map(row => row.account.id)),
        [screen.bands]
    )
    const focusNext = (accountId: string) => {
        const nextId = rowIds[rowIds.indexOf(accountId) + 1]
        const next = nextId === undefined ? undefined : inputs.current.get(nextId)
        if (next) next.focus()
        else inputs.current.get(accountId)?.blur()
    }

    const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false)
    const [isDiscardOpen, setIsDiscardOpen] = useState(false)
    const goBack = useBackToChart()
    const writes = useOpeningDraftWrites(screen)
    const setPostPending = useOpeningPostStore(s => s.setPostPending)
    const [entriesCollection] = useStore('books_journal_entries')
    const draft = screen.state.kind === 'draft' ? screen.state.entry : null
    const replacing = screen.state.kind === 'replace' ? screen.state.entry : null
    const { record: replaced } = useRecord(entriesCollection, draft?.replaces)
    // A press during a write returns before React has re-rendered the buttons as
    // disabled, so only a ref can drop the second of two presses in one tick.
    const isWriting = useRef(false)

    // Set when the form leaves the tree, so a finished discard does not navigate on.
    const isMounted = useRef(true)
    const rootRef = useCallback((node: View | null) => {
        isMounted.current = node !== null
    }, [])

    const routeFieldErrors = handleMutationErrorsWithForm({ setError, getValues })
    const onWriteError = (error: unknown) => {
        if (error instanceof LineWriteError) {
            const message = lineRefusalMessage(error.cause)
            if (message) {
                setError(`amounts.${error.accountId}`, { type: 'server', message })
                return
            }
            onWriteError(error.cause)
            return
        }
        const message = refusalMessage(error)
        const formFields = Object.keys(getValues())
        // A refusal that names the form's own fields goes to those fields; any other
        // refusal is a root message, and a failure with no message (the network) is a toast.
        if (message === null || refusalNamesFormFields(error, formFields)) routeFieldErrors(error)
        else setError('root', { type: 'server', message })
    }
    const saveMutation = useMutation({
        mutationFn: writes.saveDraft,
        onError: onWriteError,
    })
    const postMutation = useMutation({
        mutationFn: writes.postEntry,
        onError: onWriteError,
    })
    const discardMutation = useMutation({
        mutationFn: writes.discardDraft,
        onError: onWriteError,
    })

    // Resolves to whether the write completed; a refusal has already been put on the form.
    const guarded = async (run: () => Promise<boolean>) => {
        if (isWriting.current) return false
        isWriting.current = true
        try {
            return await run()
        } catch (error) {
            // onWriteError shows every error that carries a server message (a refusal,
            // with or without field errors); only the rest (a network failure, an
            // unexpected throw) reaches the toast with no message, so only those are logged.
            const cause = error instanceof LineWriteError ? error.cause : error
            if (lineRefusalMessage(cause) === null) log.error('books.opening-balances', error)
            return false
        } finally {
            isWriting.current = false
        }
    }
    // While a query is failed or reloading, the saved lines are not trustworthy and a
    // save would diff against them.
    const isStale = screen.hasLateError || screen.isRefreshing
    // Resolves to the saved entry's id, or null when nothing was saved. Runs inside a
    // guarded write: Save and Post share it so each holds the one write guard.
    const saveAndReturnId = async () => {
        // The spec disables Save draft and Post on a too-large figure ("blocks Save
        // draft and Post"), so the button state and this guard both read isBlocked,
        // although CLAUDE.md bans a canSubmit derived from field values. Post calls
        // this directly and must not slip past the disabled button.
        if (isStale || isBlocked) return null
        let savedId = null as string | null
        await handleSubmit(async values => {
            savedId = await saveMutation.mutateAsync(values)
            // A save that turns a new form into a draft keeps formKey, so the form is
            // not re-seeded. The submitted values become the clean baseline and the
            // current ones stay, so a figure typed during the save is still dirty.
            reset(values, { keepValues: true })
        })()
        return savedId
    }
    const save = () => guarded(async () => (await saveAndReturnId()) !== null)
    const post = () =>
        guarded(async () => {
            clearErrors('root')
            const entryId = await saveAndReturnId()
            if (entryId === null) return false
            // Back unmounted the form during the save: the user left, so post nothing.
            if (!isMounted.current) return false
            setPostPending(true)
            try {
                await postMutation.mutateAsync(entryId)
                // Leaving edit mode while the post hold is still up: otherwise the
                // posted replacement would show the replace form again for a render.
                screen.backToPosted()
            } catch (error) {
                // A refusal after the user left the screen has no form to show it on.
                const cause = error instanceof LineWriteError ? error.cause : error
                const message = lineRefusalMessage(cause) ?? refusalMessage(cause)
                if (!isMounted.current && message !== null) {
                    log.warn('books.opening-balances', message)
                }
                throw error
            } finally {
                setPostPending(false)
            }
            return true
        })
    const discard = () =>
        guarded(async () => {
            clearErrors('root')
            try {
                await discardMutation.mutateAsync()
            } finally {
                // On a refusal the error shows in the summary, which the open dialog hides.
                setIsDiscardOpen(false)
            }
            if (isMounted.current) goBack()
            return true
        })
    const cancel = () => {
        if (isDirty) setIsCancelConfirmOpen(true)
        else goBack()
    }
    const confirmCancel = () => {
        setIsCancelConfirmOpen(false)
        goBack()
    }

    return {
        form,
        cents,
        build,
        date,
        preview,
        hasAmounts: build.lines.length > 0,
        isBlocked,
        blockMessage,
        items,
        focusNext,
        registerInput,
        inputRefFor,
        dateHelper: label ? `Balances at end of day ${label}` : '',
        effectiveMemoText: effectiveMemo(memo, date),
        closeDate,
        onPresetChange,
        onDateChange,
        save,
        post,
        isPosting: postMutation.isPending,
        discard,
        cancel,
        isSaving: saveMutation.isPending,
        isDiscarding: discardMutation.isPending,
        isDirty,
        isCancelConfirmOpen,
        closeCancelConfirm: () => setIsCancelConfirmOpen(false),
        confirmCancel,
        isDiscardOpen,
        openDiscard: () => setIsDiscardOpen(true),
        closeDiscard: () => setIsDiscardOpen(false),
        summaryErrors,
        hasSummaryErrors: Object.keys(summaryErrors).length > 0,
        rootRef,
        hasDraft: draft !== null,
        noticeText: noticeText(replacing?.number ?? '', replaced?.number ?? ''),
        isReplacing: replacing !== null,
        backToPosted: screen.backToPosted,
    }
}

export type OpeningForm = ReturnType<typeof useOpeningBalancesForm>
