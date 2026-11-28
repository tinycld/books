import { useStore } from '@tinycld/core/lib/pocketbase'
import { useFieldArray, useForm, zodResolver } from '@tinycld/core/ui/form'
import { newRecordId } from 'pbtsdb/core'
import { type FieldErrors, useWatch } from 'react-hook-form'
import { adjustmentSchema } from '../lib/adjustment-schema'
import {
    type AdjustmentLineValues,
    type AdjustmentValues,
    canAddAdjustmentLine,
    changeFromNew,
    emptyAdjustmentLine,
    newFromChange,
    quantityOfText,
    quantityText,
    valueMode,
} from '../lib/adjustment-values'
import { useAdjustmentLineStock } from './useAdjustmentLineStock'
import { useLineFocus } from './useLineFocus'

interface AdjustmentFormInput {
    initial: AdjustmentValues
    // A refusal the form shows from its mount (a new adjustment's refused save handed off
    // to this draft's form).
    initialErrors?: FieldErrors<AdjustmentValues>
    hasBins: boolean
    // An item's default bin is taken on a pick only while that bin is active.
    isActiveBin: (id: string) => boolean
}

type LineText = 'newQuantity' | 'change' | 'value'

// The paths a line's rules write (lib/adjustment-schema.ts): its inputs and its own root.
const LINE_PATHS = ['product', 'bin', 'newQuantity', 'change', 'value', 'root'] as const

// The form's trigger by path text: a line's own error (`lines.<n>.root`) is no field path of
// the values' type. Method syntax, so react-hook-form's trigger fits.
type LineTrigger = { trigger(names?: string | readonly string[]): Promise<boolean> }

// The Change of a text that holds a number; null for an empty text or one that is not.
function changeOf(text: string): number | null {
    if (text.trim() === '') return null
    return quantityOfText(text)?.quantity ?? null
}

/**
 * The inventory adjustment form (inventory-adjust spec §3.2, §3.3, Do step 2): `useForm`
 * under the one schema, the lines a `useFieldArray` (keyName 'key', so the line keeps its
 * own `id`), and the stock of the lines' items (useAdjustmentLineStock). New quantity and
 * Change are linked in each input's change handler with `setValue` (Change = New quantity −
 * On hand, New quantity = On hand + Change); New quantity is computed only while the item's
 * On hand is known; a Change typed before the stock arrived keeps New quantity empty, and
 * the line view (adjustmentLineView) shows On hand + Change once it arrives. A Change below 0 takes its value at cost, so its Value change text is
 * cleared. Picking an item sets the line's Bin to the item's default bin while that bin is
 * active, else No bin; the item row is the picker's, read once in the handler. After a
 * submit, each edit validates its line again (the line's rules span its fields). Enter in
 * the last line's Value change, or in its Change while Value change shows "At cost", adds a
 * line and moves the focus to its Item; Enter in another line adds none.
 */
export function useAdjustmentForm({
    initial,
    initialErrors,
    hasBins,
    isActiveBin,
}: AdjustmentFormInput) {
    const [productsCollection] = useStore('books_products')
    const form = useForm<AdjustmentValues>({
        defaultValues: initial,
        resolver: zodResolver(adjustmentSchema),
        errors: initialErrors,
    })
    // A watch by field names is typed by the form's paths (a whole-form watch is partial).
    const [date, account, memo, lines] = useWatch({
        control: form.control,
        name: ['date', 'account', 'memo', 'lines'],
    })
    const values: AdjustmentValues = { date, account, memo, lines }
    const lineArray = useFieldArray({ control: form.control, name: 'lines', keyName: 'key' })
    const stock = useAdjustmentLineStock(
        values.lines.map(line => line.product),
        hasBins
    )
    const addLine = (): string | null => {
        if (!canAddAdjustmentLine(form.getValues('lines').length)) return null
        const line = emptyAdjustmentLine()
        lineArray.append(line, { shouldFocus: false })
        return line.id
    }
    const lineFocus = useLineFocus(lineArray.fields, addLine, lineArray.remove)

    const lineAt = (index: number): AdjustmentLineValues | undefined =>
        form.getValues('lines')[index]
    const setText = (index: number, field: LineText | 'product' | 'bin', text: string) =>
        form.setValue(`lines.${index}.${field}`, text, { shouldDirty: true })
    // Each path of the line by name: react-hook-form keeps an error object at `lines.<n>`
    // only when fields are registered under it, and these inputs are controlled (no
    // register), so a trigger of `lines.<n>` would drop every error of the line.
    const revalidate = (index: number) => {
        if (!form.formState.isSubmitted) return
        const lineTrigger: LineTrigger = form
        void lineTrigger.trigger(LINE_PATHS.map(path => `lines.${index}.${path}`))
    }
    // New quantity from the line's Change: '' while Change is empty or the On hand is not
    // known; the text as it is while Change is not a number (its error shows).
    const followChange = (index: number, line: AdjustmentLineValues) => {
        if (line.change.trim() === '' || !stock.isKnown(line.product)) {
            setText(index, 'newQuantity', '')
            return
        }
        const change = changeOf(line.change)
        if (change === null) return
        const onHand = stock.onHandOf(line.product, line.bin).quantity
        setText(index, 'newQuantity', quantityText(newFromChange(onHand, change)))
    }
    // A decrease is valued at cost: no typed Value change stays behind "At cost".
    const dropValueOnDecrease = (index: number, change: number | null) => {
        if (change !== null && valueMode(change) === 'at-cost') setText(index, 'value', '')
    }

    const setItem = (index: number, id: string) => {
        const line = lineAt(index)
        if (!line) return
        const defaultBin = productsCollection.get(id)?.default_bin ?? ''
        const bin = hasBins && defaultBin !== '' && isActiveBin(defaultBin) ? defaultBin : ''
        setText(index, 'product', id)
        setText(index, 'bin', bin)
        followChange(index, { ...line, product: id, bin })
        revalidate(index)
    }
    const setBin = (index: number, id: string) => {
        const line = lineAt(index)
        if (!line) return
        setText(index, 'bin', id)
        followChange(index, { ...line, bin: id })
        revalidate(index)
    }
    const setNewQuantity = (index: number, text: string) => {
        const line = lineAt(index)
        if (!line) return
        setText(index, 'newQuantity', text)
        if (text.trim() === '') {
            setText(index, 'change', '')
        } else {
            const next = changeOf(text)
            if (next !== null) {
                const onHand = stock.onHandOf(line.product, line.bin).quantity
                const change = changeFromNew(onHand, next)
                setText(index, 'change', quantityText(change))
                dropValueOnDecrease(index, change)
            }
        }
        revalidate(index)
    }
    const setChange = (index: number, text: string) => {
        const line = lineAt(index)
        if (!line) return
        setText(index, 'change', text)
        followChange(index, { ...line, change: text })
        dropValueOnDecrease(index, changeOf(text))
        revalidate(index)
    }
    const setValueText = (index: number, text: string) => {
        // A blur that formats the text to what it is (MoneyTextField) is no edit.
        if (lineAt(index)?.value === text) return
        setText(index, 'value', text)
        revalidate(index)
    }
    const isLast = (index: number) => index === form.getValues('lines').length - 1
    const submitChange = (index: number) => {
        const change = changeOf(lineAt(index)?.change ?? '')
        if (change !== null && valueMode(change) === 'at-cost' && isLast(index)) lineFocus.add()
    }
    const submitValue = (index: number) => {
        if (isLast(index)) lineFocus.add()
    }
    const duplicate = (index: number) => {
        const line = lineAt(index)
        if (!line || !canAddAdjustmentLine(form.getValues('lines').length)) return
        const copy = { ...line, id: newRecordId() }
        lineArray.insert(index + 1, copy, { shouldFocus: false })
        lineFocus.focusLine(copy.id)
    }

    return {
        form,
        values,
        stock,
        lineFields: lineArray.fields,
        lineFocus,
        line: {
            setItem,
            setBin,
            setNewQuantity,
            setChange,
            setValue: setValueText,
            submitChange,
            submitValue,
            duplicate,
            remove: lineFocus.removeAt,
        },
    }
}

export type AdjustmentForm = ReturnType<typeof useAdjustmentForm>
export type AdjustmentLineActions = AdjustmentForm['line']
