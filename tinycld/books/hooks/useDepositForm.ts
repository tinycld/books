import { useFieldArray, useForm, zodResolver } from '@tinycld/core/ui/form'
import { useMemo, useRef, useState } from 'react'
import { type FieldErrors, type Resolver, useWatch } from 'react-hook-form'
import { Platform } from 'react-native'
import type { SelectBoxState } from '../lib/bank-import-view'
import {
    canAddLine,
    clearSelection,
    depositFigureText,
    depositLineCents,
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
import { type DepositFormValues, newDepositLine } from '../lib/deposit-values'
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

// A line's Received from trigger, focused by script (web: the button element).
type FocusTarget = { focus: () => void }

function isFocusTarget(node: unknown): node is FocusTarget {
    return typeof node === 'object' && node !== null && 'focus' in node
}

// Add line is a core ShortcutButton, which takes no ref, so its wrapper's node is held and
// the button inside it is found on web. A phone has no focus ring to move.
function focusAddLine(node: unknown) {
    if (Platform.OS !== 'web') return
    if (typeof HTMLElement === 'undefined' || !(node instanceof HTMLElement)) return
    const button = node.querySelector<HTMLElement>('[tabindex="0"]') ?? node
    button.focus()
}

/**
 * The other funds lines' focus moves (bank deposit spec §3.5): a new line (Add line, ⌥↵,
 * Enter in the last Amount) takes the focus in its Received from once it mounts; Enter in
 * another Amount moves to the next line's Received from; Remove (the button or ⌘⌥⌫) moves
 * it to the line before, or the line after for the first, or Add line when no line is
 * left (web). The line that holds the focus is
 * a ref set by the line's own focus events (no render per Tab), read by ⌘⌥⌫'s `when`.
 */
function useLineFocus(
    fields: readonly { id: string }[],
    addLine: () => string | null,
    remove: (index: number) => void
) {
    const triggers = useRef(new Map<string, FocusTarget>())
    const refs = useRef(new Map<string, (node: unknown) => void>())
    const pending = useRef<string | null>(null)
    const focused = useRef<string | null>(null)
    const addLineNode = useRef<unknown>(null)
    const fieldsRef = useRef(fields)
    fieldsRef.current = fields

    const focusLine = (id: string | undefined) => {
        if (id === undefined) return
        const node = triggers.current.get(id)
        if (node) node.focus()
        else pending.current = id
    }
    // One stable ref callback per line, so a render does not detach and attach it.
    const partyRef = (id: string) => {
        const known = refs.current.get(id)
        if (known) return known
        const attach = (node: unknown) => {
            if (!isFocusTarget(node)) {
                triggers.current.delete(id)
                return
            }
            triggers.current.set(id, node)
            if (pending.current !== id) return
            pending.current = null
            node.focus()
        }
        refs.current.set(id, attach)
        return attach
    }
    const addFocused = () => focusLine(addLine() ?? undefined)
    const removeAt = (index: number) => {
        const lines = fieldsRef.current
        const line = lines[index]
        if (line === undefined) return
        const neighbour = lines[index - 1]?.id ?? lines[index + 1]?.id
        // The last line gone: the focus goes to Add line, so the keyboard keeps its place.
        if (neighbour === undefined) focusAddLine(addLineNode.current)
        else focusLine(neighbour)
        refs.current.delete(line.id)
        if (focused.current === line.id) focused.current = null
        remove(index)
    }
    return {
        partyRef,
        // The ref of the View that wraps Add line.
        addLineRef: (node: unknown) => {
            addLineNode.current = node
        },
        add: addFocused,
        removeAt,
        removeFocused: () => {
            const index = fieldsRef.current.findIndex(line => line.id === focused.current)
            if (index !== -1) removeAt(index)
        },
        // Enter in line `index`'s Amount.
        next: (index: number) => {
            const after = fieldsRef.current[index + 1]
            if (after) focusLine(after.id)
            else addFocused()
        },
        onFocus: (id: string) => {
            focused.current = id
        },
        onBlur: (id: string) => {
            if (focused.current === id) focused.current = null
        },
        isFocused: () => focused.current !== null,
    }
}

export type DepositLineFocus = ReturnType<typeof useLineFocus>

/**
 * The deposit form (bank deposit spec §3.3 to §3.6, Do step 3): `useForm` under the one
 * schema for Save draft and Post, its context from this render (the list and the chart
 * change while the form is open). The ticked set is the form's `items` array, so the dirty
 * state, the leave guard and the totals follow it. The other funds lines are the form's
 * `lines` field array (keyName 'key', so react-hook-form's row key stays off the line's
 * own `id`); `addLine` appends a blank line while canAddLine allows one and returns its
 * id, or null at the limit. The sort is local UI state; the totals and the figure are
 * computed during render.
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
    const lineArray = useFieldArray({ control: form.control, name: 'lines', keyName: 'key' })
    const addLine = (): string | null => {
        if (!canAddLine(form.getValues('lines').length)) return null
        const line = newDepositLine()
        lineArray.append(line, { shouldFocus: false })
        return line.id
    }
    const lineFocus = useLineFocus(lineArray.fields, addLine, lineArray.remove)

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
    const { amounts, hasInvalidAmount } = depositLineCents(values.lines, currency)
    const totals = depositTotals(
        tickedRows,
        amounts.map(amount => ({ amount }))
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
        lineFields: lineArray.fields,
        lineFocus,
    }
}

export type DepositForm = ReturnType<typeof useDepositForm>
export type DepositRow = DepositForm['rows'][number]
