import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { newRecordId } from 'pbtsdb/core'
import { useEffect, useMemo, useState } from 'react'
import type { DocumentKind } from '../components/documents/document-kinds'
import { documentScreenState } from '../lib/document-screen-state'
import { defaultMessageFor } from '../lib/document-values'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { todayIso } from '../lib/register-range'
import { DOCUMENT_PARTIES, type DocumentPartyKey } from '../lib/sales-document-kinds'
import { useDocumentSaveStore } from '../stores/document-save-store'
import { type DocumentScreenInput, documentPartyIdOf } from './document-data'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'
import { useTaxRateOptions } from './useTaxRateOptions'

export type { DocumentScreenInput } from './document-data'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// The party a new form starts with: a copy's source party, the estimate's customer on an
// invoice made from one, else the route's party param (`?customer`, or `?vendor` on a
// kind whose party is a vendor).
function newPartyIdOf(
    input: DocumentScreenInput,
    partyField: DocumentPartyKey,
    sourceParty: string | undefined,
    estimateCustomer: string | undefined
): string | undefined {
    if (input.copy) return sourceParty
    if (input.estimate) return estimateCustomer
    return input[partyField]
}

// A new route's form key: each start mounts its own form.
function newFormKey(input: DocumentScreenInput): string {
    const { fresh, replaces, copy, estimate } = input
    return `new:${fresh ?? ''}:${replaces ?? ''}:${copy ?? ''}:${estimate ?? ''}`
}

// A key of its own per screen mount (useId is not: it repeats for a remount at the same
// place in the tree). The draft its form writes is filed under it, and forgotten when
// the mount goes.
function useScreenWriter(): string {
    const [writer] = useState(newRecordId)
    useEffect(() => () => useDocumentSaveStore.getState().forget(writer), [writer])
    return writer
}

/**
 * A sales document route's data: access, the Books currency, the kind's reads (the
 * document with the people who posted and voided it, its lines in order with their
 * products, the document a correction replaces or a copy starts from with its lines on a
 * new form, the estimate a new invoice is made from with its lines, the posted tax lines
 * of the read view), the form's party (through the kind's data source) and the tax
 * rates; the screen state they add up to, and one Retry that recovers exactly the reads
 * that failed.
 */
export function useDocumentScreen(documentKind: DocumentKind, input: DocumentScreenInput) {
    const [accessCollection] = useStore('books_access')
    const access = useBooksAccess()
    const settings = useBooksSettings()
    const taxOptions = useTaxRateOptions()
    const id = input.id ?? ''
    const isNew = input.id === null
    const heldId = useDocumentSaveStore(s => s.heldId)
    // A new form's save holds the id it inserts, which the route does not name yet: any
    // hold is this form's (one document form is mounted at a time).
    const isHeld = heldId !== null && (isNew || heldId === id)
    const writer = useScreenWriter()
    const writtenId = useDocumentSaveStore(s => s.written[writer])
    const reads = documentKind.data.useScreenReads({ ...input, isHeld })
    const record = reads.record.data
    const source = reads.source.data
    // The estimate a new invoice is made from (`?estimate`), or the one a correction's
    // posted invoice was made from (its number names it); undefined otherwise.
    const estimateSource = reads.estimateSource.data
    const isFromEstimate = isNew && Boolean(input.estimate)
    // The form's party (DOCUMENT_PARTIES): the draft's own, the route's party param on a
    // new form, a copy's source party (a copy fills the header from its current record),
    // or the estimate's customer on an invoice made from one. Read through the kind's data
    // source, whose live query shows a refused read as an error with Retry.
    const partyField = DOCUMENT_PARTIES[documentKind.doc.party].field
    const sourcePartyId = source ? documentPartyIdOf(source) : undefined
    const newPartyId = newPartyIdOf(input, partyField, sourcePartyId, estimateSource?.customer)
    const partyId = (isNew ? newPartyId : record && documentPartyIdOf(record)) ?? ''
    const party = documentKind.data.useParty(partyId)
    const kindReads = [
        reads.record,
        reads.lines,
        reads.source,
        reads.sourceLines,
        reads.estimateSource,
        reads.estimateSourceLines,
        reads.taxLines,
        reads.formStart,
    ]
    const isReady =
        access.isReady &&
        settings.isReady &&
        taxOptions.isReady &&
        kindReads.every(read => read.isReady) &&
        party.isReady
    const isError =
        access.isError ||
        settings.hasLoadError ||
        taxOptions.isError ||
        kindReads.some(read => read.isError) ||
        party.isError
    const status = record?.status ?? null
    const sourceStatus = source?.status ?? null
    const copyParty = party.data
    // A copy whose party cannot be read has no values to start from: not found. A source
    // saved without one (a walk-in sales receipt) is copied without one.
    const hasCopyParty = !sourcePartyId || copyParty !== undefined
    const copyStatus = hasCopyParty ? sourceStatus : null
    // An estimate that does not exist, or whose customer cannot be read, has no values
    // to start an invoice from: not found.
    const estimateStatus = estimateSource && copyParty !== undefined ? estimateSource.status : null
    // This mount's own form wrote its draft and its post was refused: that draft closed
    // the estimate, which now names it. The form stays, as through a hold, with the
    // refusal on it; its next save updates that draft. Another mount of the route (Back,
    // then Forward) wrote nothing, so it shows the cannot-convert notice.
    const ownsEstimate =
        isFromEstimate && writtenId !== undefined && estimateSource?.invoice === writtenId
    const state = documentScreenState({
        lifecycle: documentKind.doc.lifecycle,
        isReady,
        isError,
        canWrite: access.canWrite,
        isNew,
        status,
        isHeld: isHeld || ownsEstimate,
        replacesStatus: isNew && input.replaces ? sourceStatus : undefined,
        copyStatus: isNew && input.copy ? copyStatus : undefined,
        estimateStatus: isFromEstimate ? estimateStatus : undefined,
    })
    const sourceLines = reads.sourceLines.data
    const estimateLines = reads.estimateSourceLines.data
    const { values } = documentKind
    // What a new form or a copy starts from besides the document, and the kind's schema
    // rule for its Deposit to (none for an invoice).
    const { start, deposit } = reads.formStart.data
    // A new form's values when it corrects or copies a document, or is made from an
    // estimate. Memoised on the reads, so the line ids stay the same between renders (the
    // form seeds from them once).
    const startValues = useMemo(() => {
        if (!isNew) return undefined
        if (isFromEstimate) {
            if (!estimateSource || !copyParty || !values.fromEstimate) return undefined
            const today = todayIso()
            const { message } = estimateSource
            return values.fromEstimate(estimateSource, estimateLines, today, copyParty, message)
        }
        if (!source || !reads.sourceLines.isReady) return undefined
        if (input.replaces) return values.correction(source, sourceLines)
        if (input.copy && hasCopyParty) {
            return values.copy(source, sourceLines, todayIso(), copyParty ?? null, start)
        }
        return undefined
    }, [
        isNew,
        isFromEstimate,
        estimateSource,
        estimateLines,
        source,
        sourceLines,
        reads.sourceLines.isReady,
        input.replaces,
        input.copy,
        hasCopyParty,
        copyParty,
        values,
        start,
    ])
    // The text of the error state: the form start's own when only it failed.
    const otherReadFailed =
        access.isError ||
        settings.hasLoadError ||
        taxOptions.isError ||
        party.isError ||
        kindReads.some(read => read !== reads.formStart && read.isError)
    const { loadFailed } = documentKind.doc.messages
    const errorText =
        reads.formStart.isError && !otherReadFailed
            ? (reads.formStart.errorText ?? loadFailed)
            : loadFailed
    const isCorrection = Boolean(isNew ? input.replaces : record?.replaces)
    const replacesNumber = isCorrection ? (source?.number ?? '') : ''

    // Each part is non-empty only when its own query failed, so one call recovers
    // exactly the failed reads and never empties a collection another screen shows.
    const accessRecovery: LiveRecovery = access.isError
        ? { queries: [access.collection], sources: [accessCollection] }
        : NO_RECOVERY
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([
                ...kindReads.map(read => read.recovery),
                party.recovery,
                accessRecovery,
                settings.recovery,
            ]),
            onError: err => log.error(`books.${documentKind.doc.key}`, err),
        })
        if (taxOptions.isError) taxOptions.retry()
    }

    return {
        state,
        record,
        lines: reads.lines.data,
        // The party's row (a sales kind's customer), read through the kind's data source.
        party: party.data,
        startValues,
        start,
        deposit,
        errorText,
        replacesNumber,
        taxLines: reads.taxLines.data,
        estimateSource,
        retry,
        canWrite: access.canWrite,
        currency: settings.settings?.currency ?? 'USD',
        // A new blank form's message (new, Post & new, `?customer`). The form reads it once
        // at mount, so a changed setting never touches an open form.
        defaultMessage: defaultMessageFor(settings.settings),
        formKey: id || newFormKey(input),
        // This screen mount's key: its form files the draft it writes under it.
        writer,
        taxOptions,
    }
}

export type DocumentScreenData = ReturnType<typeof useDocumentScreen>
