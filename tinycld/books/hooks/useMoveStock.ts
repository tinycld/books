import { handleMutationErrorsWithForm } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useForm, zodResolver } from '@tinycld/core/ui/form'
import { newRecordId } from 'pbtsdb/core'
import { useMemo } from 'react'
import { binLabel } from '../lib/adjustment-read'
import { NO_BIN } from '../lib/inventory-adjust-fixture'
import { type MoveStockValues, moveStockSchema } from '../lib/move-stock-schema'
import { quantityText } from '../lib/stock-display'
import { type ItemBinStockRow, useItemBinStock } from './useItemBins'

export type MoveStockState = 'loading' | 'load-error' | 'nothing' | 'form'

// The bin a move starts from: the default bin while it holds some of the item, else the
// first bin that does.
function firstFrom(held: readonly ItemBinStockRow[], defaultBin: string): string {
    const inDefault = held.find(row => row.bin === defaultBin)
    return (inDefault ?? held[0])?.bin ?? NO_BIN
}

function stateOf(isError: boolean, isReady: boolean, heldCount: number): MoveStockState {
    if (isError) return 'load-error'
    if (!isReady) return 'loading'
    return heldCount === 0 ? 'nothing' : 'form'
}

interface MoveStockItem {
    id: string
    default_bin: string
}

/**
 * The Move stock dialog (inventory-adjust spec §3.8): From offers the item's bins that hold
 * a quantity above 0 ("<bin> · <quantity>", an inactive bin with "(inactive)"); To never
 * holds the From bin (the start values and `changeFrom`); the form
 * over `moveStockSchema`, whose rules are the server's transfer guard; one insert into
 * `books_bin_transfers`, which the server dates and stamps. A server refusal of Quantity
 * lands on it; any other shows in the form's summary (handleMutationErrorsWithForm).
 * `state` is what MoveStockDialog draws: the rows loading, their load error with Retry,
 * `nothing` while no bin holds the item, or the form.
 */
export function useMoveStock(item: MoveStockItem, onClose: () => void) {
    const [transfersCollection] = useStore('books_bin_transfers')
    const stock = useItemBinStock(item.id)
    const held = useMemo(() => stock.rows.filter(row => row.quantity > 0), [stock.rows])
    const fromOptions = held.map(row => ({
        value: row.bin,
        label: `${binLabel(row.binRow)} · ${quantityText(row.quantity)}`,
    }))
    const schema = useMemo(() => {
        const heldIn = (bin: string) => held.find(row => row.bin === bin)?.quantity ?? 0
        const nameOf = (bin: string) => binLabel(held.find(row => row.bin === bin)?.binRow)
        return moveStockSchema(heldIn, nameOf)
    }, [held])
    const state = stateOf(stock.isError, stock.isReady, held.length)

    // The rows can load after the dialog opens: From takes its first bin when they arrive.
    // To never holds the From bin: it starts at No bin, or with no choice when From is No
    // bin.
    const from = firstFrom(held, item.default_bin)
    const values: MoveStockValues = {
        from,
        to: from === NO_BIN ? null : NO_BIN,
        quantity: 0,
        memo: '',
    }
    const form = useForm<MoveStockValues>({
        resolver: zodResolver(schema),
        defaultValues: values,
        values,
        resetOptions: { keepDirtyValues: true, keepErrors: true, keepIsSubmitted: true },
    })

    // A From that becomes the To bin clears To, so To never holds the From bin.
    const changeFrom = (next: string) => {
        // Dirty, so a later load of the rows (keepDirtyValues) does not put a bin back.
        if (form.getValues('to') === next) form.setValue('to', null, { shouldDirty: true })
    }

    const move = useMutation({
        mutationFn: function* (moved: MoveStockValues & { to: string }) {
            yield transfersCollection.insert({
                id: newRecordId(),
                product: item.id,
                from_bin: moved.from,
                to_bin: moved.to,
                quantity: moved.quantity,
                memo: moved.memo,
            })
        },
        onSuccess: () => onClose(),
        onError: handleMutationErrorsWithForm({
            setError: form.setError,
            getValues: form.getValues,
            rootMessage: true,
        }),
    })

    const canSubmit = state === 'form' && !move.isPending
    const submit = () => {
        if (!canSubmit) return
        // The schema refuses a null To, so a submitted move always names its To side.
        void form.handleSubmit(moved => {
            if (moved.to !== null) move.mutate({ ...moved, to: moved.to })
        })()
    }
    const retryLoad = () => {
        void recoverLiveQueries({
            ...stock.recovery,
            onError: err => log.error('books.item.move-stock', err),
        })
    }

    return {
        state,
        form,
        fromOptions,
        changeFrom,
        submit,
        canSubmit,
        isSaving: move.isPending,
        summaryEnabled: form.formState.isSubmitted,
        retryLoad,
    }
}

export type MoveStockModel = ReturnType<typeof useMoveStock>
