import { useForm, zodResolver } from '@tinycld/core/ui/form'
import { useMemo, useState } from 'react'
import { type FieldErrors, type Resolver, useWatch } from 'react-hook-form'
import type { SelectBoxState } from '../lib/bank-import-view'
import {
    clearSelection,
    depositFigureText,
    depositTotals,
    type ItemSortColumn,
    isEveryItemTicked,
    type SortDirection,
    selectAll,
    sortItems,
    toggleItem,
} from '../lib/deposit'
import { type DepositRefusalForm, itemErrorsAfterTicks } from '../lib/deposit-refusals'
import { type DepositSchemaContext, depositSchema } from '../lib/deposit-schema'
import type { DepositFormValues } from '../lib/deposit-values'
import { moneyInputCents } from '../lib/money-input'
import type { UndepositedItem } from './useUndepositedItems'

interface DepositFormInput {
    initial: DepositFormValues
    // A refusal the new form handed to this draft's form, as its start errors; it keeps one
    // identity for the form's life, so the form applies it once.
    initialErrors?: FieldErrors<DepositFormValues>
    currency: string
    // What the schema reads besides the values: the Deposit to options, the listed items
    // by line and the chart (lib/deposit-schema.ts).
    context: DepositSchemaContext
    // The list as useUndepositedItems gives it.
    items: readonly UndepositedItem[]
}

type SortState = { column: ItemSortColumn; direction: SortDirection }

const DEFAULT_SORT: SortState = { column: 'date', direction: 'asc' }

// useForm always passes the context below; the resolver's type allows none.
const NO_CONTEXT: DepositSchemaContext = { bankOptions: [], items: {}, accounts: {} }

// The header box: clear with no tick, checked when every listed item is ticked.
function tickAllStateOf(tickedCount: number, isAll: boolean): SelectBoxState {
    if (tickedCount === 0) return 'empty'
    return isAll ? 'checked' : 'mixed'
}

/**
 * The deposit form (bank deposit spec §3.3 to §3.6, Do step 3): `useForm` under the one
 * schema for Save draft and Post, its context from this render (the list and the chart
 * change while the form is open). The ticked set is the form's `items` array, so the dirty
 * state, the leave guard and the totals follow it. The sort is local UI state; the totals
 * and the figure are computed during render.
 */
export function useDepositForm({
    initial,
    initialErrors,
    currency,
    context,
    items,
}: DepositFormInput) {
    const resolver = useMemo<Resolver<DepositFormValues, DepositSchemaContext>>(
        () => (values, schemaContext, options) =>
            zodResolver(depositSchema(currency, schemaContext ?? NO_CONTEXT))(
                values,
                schemaContext,
                options
            ),
        [currency]
    )
    const form = useForm<DepositFormValues, DepositSchemaContext>({
        defaultValues: initial,
        resolver,
        context,
        errors: initialErrors,
    })
    const values = useWatch({ control: form.control }) as DepositFormValues
    const [sort, setSort] = useState<SortState>(DEFAULT_SORT)

    const setTicked = (next: DepositFormValues['items']) => {
        const moved = itemErrorsAfterTicks(
            form.formState.errors.items,
            form.getValues('items'),
            next
        )
        form.setValue('items', next, { shouldDirty: true })
        // After a submit the schema runs again over the new ticks.
        if (form.formState.isSubmitted) {
            void form.trigger()
            return
        }
        // A refusal handed over from the new form (no submit here yet) keeps each row
        // error on its own row's line, not on its old index.
        if (moved === null) return
        const errorForm: DepositRefusalForm = form
        form.clearErrors('items')
        for (const { field, error } of moved) errorForm.setError(field, error)
    }
    const ticked = values.items
    const tickedLines = new Set(ticked.map(item => item.line))
    const errors = form.formState.errors
    const errorByLine = new Map(
        ticked.map((item, index) => [item.line, errors.items?.[index]?.root?.message ?? ''])
    )
    const rows = sortItems(items, sort.column, sort.direction).map(item => ({
        ...item,
        isTicked: tickedLines.has(item.line),
        error: errorByLine.get(item.line) || (item.staleText ?? ''),
    }))
    const tickedRows = items.filter(item => tickedLines.has(item.line))
    const lineCents = values.lines.map(line => moneyInputCents(line.amount, currency))
    const hasInvalidAmount = lineCents.some(cents => cents === null)
    const totals = depositTotals(
        tickedRows,
        lineCents.map(cents => ({ amount: cents ?? 0 }))
    )
    const isAll = isEveryItemTicked(ticked, items)

    return {
        form,
        values,
        rows,
        sort,
        totals,
        tickedCount: ticked.length,
        listedCount: items.length,
        tickAllState: tickAllStateOf(ticked.length, isAll),
        figure: depositFigureText(totals, hasInvalidAmount, currency),
        onSort: (column: ItemSortColumn) =>
            setSort(current => ({
                column,
                direction:
                    current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
            })),
        onToggle: (line: string) => setTicked(toggleItem(form.getValues('items'), line)),
        onTickAll: () => setTicked(selectAll(form.getValues('items'), items)),
        onClear: () => setTicked(clearSelection(form.getValues('items'))),
    }
}

export type DepositForm = ReturnType<typeof useDepositForm>
export type DepositRow = DepositForm['rows'][number]
