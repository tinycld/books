import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRef } from 'react'
import { writeRefusalText } from '../lib/refusal'
import { useTaxAgencyFormStore, useTaxRateFormStore } from '../stores/taxes-store'
import type { BooksTaxAgencies, BooksTaxRates } from '../types'
import { type RecordRefusal, reportUnexpected, useRecordActions } from './useRecordActions'

type RecordActions<R extends { id: string }> = ReturnType<typeof useRecordActions<R>>

export type TaxActions = {
    agencies: RecordActions<BooksTaxAgencies>
    rates: RecordActions<BooksTaxRates>
    setDefault(id: string, currentDefaultId: string): Promise<boolean>
    pendingDefaultId: string | null
    isWorking: boolean
    refusal: RecordRefusal | null
    clearRefusal(id?: string): void
}

// `id` '' is Remove default, which writes `current`.
type DefaultVariables = { id: string; current: string }

const DEFAULT_LOG_CONTEXT = 'books.taxes.default'

function defaultRefusalOf(error: unknown, variables: DefaultVariables | undefined) {
    if (!error || !variables) return null
    return { id: variables.id || variables.current, message: writeRefusalText(error) }
}

/**
 * The Sales tax page's row actions: Make inactive, Make active and Delete of agencies,
 * rates and groups (a group is a books_tax_rates row), and the default for new sales.
 * One instance, owned by the page, so its banner and the delete dialog read the same
 * refusal. One write runs at a time across all of them.
 */
export function useTaxActions(): TaxActions {
    const [agenciesCollection, ratesCollection] = useStore('books_tax_agencies', 'books_tax_rates')
    // A ref, because two presses in one tick both see the same not-yet-pending state.
    const inFlight = useRef(false)

    const agencies = useRecordActions<BooksTaxAgencies>({
        setInactive: (id, inactive) =>
            agenciesCollection.update(id, draft => {
                draft.inactive = inactive
            }),
        remove: id => agenciesCollection.delete(id),
        get: id => agenciesCollection.get(id),
        store: useTaxAgencyFormStore,
        logContext: 'books.taxes.agencies',
    })

    const rates = useRecordActions<BooksTaxRates>({
        setInactive: (id, inactive) =>
            ratesCollection.update(id, draft => {
                draft.inactive = inactive
            }),
        remove: id => ratesCollection.delete(id),
        get: id => ratesCollection.get(id),
        store: useTaxRateFormStore,
        logContext: 'books.taxes.rates',
    })

    // One write on one row: the server clears the previous default in the same
    // serialized write, so the client never writes it.
    const defaultWrite = useMutation({
        mutationFn: function* ({ id, current }: DefaultVariables) {
            yield ratesCollection.update(id || current, draft => {
                draft.is_default = id !== ''
            })
        },
        // Fails at once offline instead of pausing, as the other row actions do.
        networkMode: 'always',
        onError: error => reportUnexpected(DEFAULT_LOG_CONTEXT, error),
    })

    const defaultRefusal = defaultRefusalOf(defaultWrite.error, defaultWrite.variables)
    const refusal = defaultRefusal ?? agencies.actionError ?? rates.actionError

    // Drops the refusal about `id`, or any refusal when no id is given. A mutation that
    // holds an error is not running, so the reset never drops a write in flight.
    const clearRefusal = (id?: string) => {
        if (defaultRefusal && (id === undefined || defaultRefusal.id === id)) {
            defaultWrite.reset()
        }
        agencies.clearActionError(id)
        rates.clearActionError(id)
    }

    // A new write replaces the last refusal, whichever kind it was about, so at most
    // one refusal is ever held.
    const runOne = async (write: () => Promise<boolean>) => {
        if (inFlight.current) return false
        inFlight.current = true
        clearRefusal()
        try {
            return await write()
        } finally {
            inFlight.current = false
        }
    }

    const setDefault = (id: string, current: string) =>
        runOne(async () => {
            try {
                await defaultWrite.mutateAsync({ id, current })
                return true
            } catch {
                // The mutation's error is the refusal.
                return false
            }
        })

    const oneAtATime = <R extends { id: string }>(actions: RecordActions<R>): RecordActions<R> => ({
        ...actions,
        setInactive: (id, inactive) => runOne(() => actions.setInactive(id, inactive)),
        deleteRecord: (id, onDeleted) => runOne(() => actions.deleteRecord(id, onDeleted)),
    })

    const pendingDefaultId = defaultWrite.isPending ? (defaultWrite.variables?.id ?? null) : null

    return {
        agencies: oneAtATime(agencies),
        rates: oneAtATime(rates),
        setDefault,
        pendingDefaultId,
        isWorking: agencies.isWorking || rates.isWorking || defaultWrite.isPending,
        refusal,
        clearRefusal,
    }
}
