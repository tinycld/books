import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { FormErrorSummary, NumberInput, useController } from '@tinycld/core/ui/form'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { useFocusEffect } from 'expo-router'
import { type RefObject, useCallback, useRef } from 'react'
import { Platform, Text, type TextInputInstance, View, type ViewStyle } from 'react-native'
import {
    type CopyToBillModel,
    useCopyToBillDialog,
    useCopyToBillForm,
} from '../../hooks/useCopyToBill'
import { useFocusOnOpen } from '../../hooks/useFocusOnOpen'
import { COPY_TO_BILL_HEADINGS, type CopyToBillRow } from '../../lib/copy-to-bill'
import { PURCHASE_ORDER_MESSAGES } from '../../lib/document-texts'
import { useCopyToBillStore } from '../../stores/copy-to-bill-store'
import { MoneyTextField } from '../MoneyTextField'
import { SelectBox } from '../SelectBox'
import { DialogLoadError } from '../taxes/DialogLoadError'
import { DocumentInlineNotice } from './DocumentInlineNotice'

const IS_WEB = Platform.OS === 'web'

const TICK_CELL = { width: 44 } satisfies ViewStyle
const NAME_CELL = { flex: 1, minWidth: 180, minHeight: 44 } satisfies ViewStyle
const OPEN_CELL = { width: 104, minHeight: 44 } satisfies ViewStyle
const TAP = { minHeight: 44 } satisfies ViewStyle
// Qty to bill and Amount to bill are both 104 px wide (spec §3.7 row: input 104).
const INPUT_WIDTH = 104
const ROW_GAP = 12
// Tick 44 + name 180 + Open 104 + the input 104 and three gaps: a narrower dialog (a
// phone's Sheet) stacks each row in two lines.
const ROW_MIN = 44 + 180 + 104 + INPUT_WIDTH + 3 * ROW_GAP
const WIDE_ROW = { gap: ROW_GAP } satisfies ViewStyle
const SKELETON_ROW = { height: 44 } satisfies ViewStyle
// NumberInput's own wrapper at the input's width and without its bottom margin (`mb-3`):
// the hint sits directly under it.
const NUMBER_WRAPPER = { className: 'gap-1', style: { width: INPUT_WIDTH } }

type FormModel = ReturnType<typeof useCopyToBillForm>

// On web the focus selects the typed value, so typing replaces it.
function selectAllOf(node: TextInputInstance | null) {
    if (!IS_WEB) return
    const field: unknown = node
    if (typeof HTMLInputElement !== 'undefined' && field instanceof HTMLInputElement) {
        field.select()
    }
}

function Hint({ text, testID }: { text: string | null; testID: string }) {
    if (!text) return null
    return (
        <Text testID={testID} className="text-xs text-warning">
            {text}
        </Text>
    )
}

function FieldMessage({ text }: { text: string }) {
    if (text === '') return null
    return <Text className="text-xs text-danger">{text}</Text>
}

interface RowInputProps {
    row: CopyToBillRow
    index: number
    formModel: FormModel
    isTicked: boolean
    // The dialog's first input takes the focus at open (useFocusOnOpen).
    focusRef: RefObject<TextInputInstance | null> | null
}

// Qty to bill: core NumberInput with no steppers, so Tab goes from row input to row input
// (at least 0; copyToBillSchema refuses more than 2 decimals), its value selected on focus.
function QuantityInput({ row, index, formModel, isTicked, focusRef }: RowInputProps) {
    const ownRef = useRef<TextInputInstance | null>(null)
    const setRef = (node: TextInputInstance | null) => {
        ownRef.current = node
        if (focusRef) focusRef.current = node
    }
    const onFocus = () => selectAllOf(ownRef.current)
    return (
        <NumberInput
            name={`rows.${index}.quantity`}
            control={formModel.form.control}
            allowDecimal
            min={0}
            isCompact
            hideSteppers
            disabled={!isTicked}
            testID={`copy-to-bill-input-${row.lineId}`}
            accessibilityLabel={`Qty to bill, ${row.name}`}
            wrapperProps={NUMBER_WRAPPER}
            inputRef={setRef}
            onFocus={onFocus}
        />
    )
}

// Amount to bill: Books' MoneyTextField, its value selected on focus; its rule's message
// under it.
function AmountInput({ row, index, formModel, isTicked, focusRef }: RowInputProps) {
    const { field, fieldState } = useController({
        control: formModel.form.control,
        name: `rows.${index}.amount`,
    })
    const message = fieldState.error?.message ?? ''
    const setRef = (node: TextInputInstance | null) => {
        if (focusRef) focusRef.current = node
    }
    return (
        <View className="gap-1">
            <MoneyTextField
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={message}
                testID={`copy-to-bill-input-${row.lineId}`}
                accessibilityLabel={`Amount to bill, ${row.name}`}
                width={INPUT_WIDTH}
                currency={formModel.currency}
                editable={isTicked}
                selectsOnFocus
                inputRef={setRef}
            />
            <FieldMessage text={message} />
        </View>
    )
}

function RowInputField(props: RowInputProps) {
    if (props.row.kind === 'item') return <QuantityInput {...props} />
    return <AmountInput {...props} />
}

// The row's input under its label, with the hint under it.
function RowInput(props: RowInputProps & { hint: string | null }) {
    const { row, hint } = props
    const label = row.kind === 'item' ? 'Qty to bill' : 'Amount to bill'
    return (
        <View className="gap-1 items-end">
            <Text className="text-xs text-muted-foreground">{label}</Text>
            <RowInputField {...props} />
            <Hint text={hint} testID={`copy-to-bill-hint-${row.lineId}`} />
        </View>
    )
}

function SecondLine({ text }: { text: string }) {
    if (text === '') return null
    return (
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {text}
        </Text>
    )
}

// The line's name, its Vendor part no. (a product row) and its description.
function NameBlock({ row }: { row: CopyToBillRow }) {
    return (
        <View className="min-w-0 justify-center" style={NAME_CELL}>
            <Text className="text-sm text-foreground" numberOfLines={1}>
                {row.name}
            </Text>
            <SecondLine text={row.partNo} />
            <SecondLine text={row.description} />
        </View>
    )
}

function Tick({ row, index, formModel }: Omit<RowInputProps, 'focusRef' | 'isTicked'>) {
    const { field } = useController({
        control: formModel.form.control,
        name: `rows.${index}.isTicked`,
    })
    const state = field.value ? 'checked' : 'empty'
    const toggle = () => field.onChange(!field.value)
    return (
        <View style={TICK_CELL}>
            <SelectBox
                state={state}
                label={`Copy ${row.name}`}
                testID={`copy-to-bill-tick-${row.lineId}`}
                onPress={toggle}
            />
        </View>
    )
}

interface RowProps {
    row: CopyToBillRow
    index: number
    formModel: FormModel
    isStacked: boolean
    focusRef: RefObject<TextInputInstance | null> | null
}

// One row tree for both layouts, so the input stays mounted (and keeps the focus) when the
// first layout pass picks the stacked rows: only the classes and styles change.
const WIDE_LAYOUT = {
    row: 'flex-row items-start border-b border-border px-2 py-1',
    rowStyle: WIDE_ROW,
    // Tick + gap + the name's minimum.
    headStyle: { flex: 1, minWidth: 44 + ROW_GAP + 180 } satisfies ViewStyle,
    tail: 'flex-row items-start gap-3',
    open: 'items-end justify-center',
    openStyle: OPEN_CELL,
}
const STACKED_LAYOUT = {
    row: 'gap-1 border-b border-border py-2',
    rowStyle: undefined,
    headStyle: undefined,
    tail: 'flex-row items-end justify-between gap-3',
    open: 'justify-center',
    openStyle: TAP,
}

// One open line: its tick box, its name, "Open <n>" and its Qty or Amount to bill. On a
// narrow dialog, two lines: the tick box and the name; then Open and the input.
function CopyRow({ row, index, formModel, isStacked, focusRef }: RowProps) {
    const isTicked = formModel.watched[index]?.isTicked === true
    const hint = formModel.hints[index] ?? null
    const testID = `copy-to-bill-row-${row.lineId}`
    const input = (
        <RowInput
            row={row}
            index={index}
            formModel={formModel}
            isTicked={isTicked}
            focusRef={focusRef}
            hint={hint}
        />
    )
    const layout = isStacked ? STACKED_LAYOUT : WIDE_LAYOUT
    return (
        <View testID={testID} className={layout.row} style={layout.rowStyle}>
            <View className="flex-row items-start gap-3" style={layout.headStyle}>
                <Tick row={row} index={index} formModel={formModel} />
                <NameBlock row={row} />
            </View>
            <View className={layout.tail}>
                <View className={layout.open} style={layout.openStyle}>
                    <Text className="text-sm tabular-nums text-foreground">{row.openText}</Text>
                </View>
                {input}
            </View>
        </View>
    )
}

interface GroupProps {
    title: string
    rows: readonly CopyToBillRow[]
    formModel: FormModel
    isStacked: boolean
    focusRef: RefObject<TextInputInstance | null>
}

// The rows of one table under its heading; each row keeps its index in the form. The
// form's first row takes the focus ref.
function CopyGroup({ title, rows, formModel, isStacked, focusRef }: GroupProps) {
    const own = formModel.rows.flatMap((row, index) => {
        if (!rows.includes(row)) return []
        const ref = index === 0 ? focusRef : null
        return [
            <CopyRow
                key={row.lineId}
                row={row}
                index={index}
                formModel={formModel}
                isStacked={isStacked}
                focusRef={ref}
            />,
        ]
    })
    if (own.length === 0) return null
    return (
        <View className="gap-1">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {title}
            </Text>
            {own}
        </View>
    )
}

// The rows, the count, the total and Create bill: mounted once every read has landed, so
// the form starts from the rows' values.
function CopyToBillRowsPart({
    model,
    focusRef,
}: {
    model: CopyToBillModel
    focusRef: RefObject<TextInputInstance | null>
}) {
    const formModel = useCopyToBillForm(model)
    const { width, onLayout } = useContainerWidth()
    const isStacked = width > 0 && width < ROW_MIN
    const items = model.rows.filter(row => row.kind === 'item')
    const accounts = model.rows.filter(row => row.kind === 'account')
    const submit = () => void formModel.submit()
    return (
        <>
            <Dialog.Body>
                <View className="gap-3" onLayout={onLayout}>
                    <Text testID="copy-to-bill-summary" className="text-sm text-muted-foreground">
                        {model.summary}
                    </Text>
                    <View className="flex-row items-center gap-3 border-b border-border py-1">
                        <View style={TICK_CELL}>
                            <SelectBox
                                state={formModel.allState}
                                label="Copy every line"
                                testID="copy-to-bill-all"
                                onPress={formModel.setAll}
                            />
                        </View>
                        <Text
                            testID="copy-to-bill-count"
                            className="text-sm font-semibold text-foreground"
                        >
                            {formModel.count}
                        </Text>
                    </View>
                    <CopyGroup
                        title={COPY_TO_BILL_HEADINGS.item}
                        rows={items}
                        formModel={formModel}
                        isStacked={isStacked}
                        focusRef={focusRef}
                    />
                    <CopyGroup
                        title={COPY_TO_BILL_HEADINGS.account}
                        rows={accounts}
                        formModel={formModel}
                        isStacked={isStacked}
                        focusRef={focusRef}
                    />
                    <Text
                        testID="copy-to-bill-total"
                        className="text-right text-sm font-semibold tabular-nums text-foreground"
                    >
                        {formModel.totalText}
                    </Text>
                    <FormErrorSummary
                        errors={formModel.summaryErrors}
                        isEnabled={formModel.isSummaryEnabled}
                        title={null}
                        showFieldNames={false}
                        testID="copy-to-bill-error"
                    />
                </View>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={model.close} testID="copy-to-bill-cancel" />
                <Dialog.ActionButton
                    label="Create bill"
                    onPress={submit}
                    shortcut={DIALOG_SUBMIT_SHORTCUT}
                    requiresServer={false}
                    testID="copy-to-bill-submit"
                />
            </Dialog.Footer>
        </>
    )
}

function RowsSlot({
    model,
    focusRef,
}: {
    model: CopyToBillModel
    focusRef: RefObject<TextInputInstance | null>
}) {
    if (model.body !== 'rows') return null
    return <CopyToBillRowsPart model={model} focusRef={focusRef} />
}

function Loading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="copy-to-bill-loading" className="gap-2">
            <View className="rounded-md bg-surface-secondary" style={SKELETON_ROW} />
            <View className="rounded-md bg-surface-secondary" style={SKELETON_ROW} />
        </View>
    )
}

// The notice of an order that went away, closed or has nothing open while the dialog is
// open.
function noticeOf(body: CopyToBillModel['body']): string {
    if (body === 'gone') return PURCHASE_ORDER_MESSAGES.notFound
    if (body === 'nothing-open') return PURCHASE_ORDER_MESSAGES.nothingLeft
    return ''
}

function Notice({ message }: { message: string }) {
    if (message === '') return null
    return <DocumentInlineNotice testID="copy-to-bill-notice" message={message} />
}

// Create bill while the rows are not drawn: disabled. Not drawn at all in the load-error
// state, whose way on is the error row's Retry.
function WaitingCreateBill({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    const noop = () => undefined
    return (
        <Dialog.ActionButton
            label="Create bill"
            onPress={noop}
            isDisabled
            shortcut={DIALOG_SUBMIT_SHORTCUT}
            requiresServer={false}
            testID="copy-to-bill-submit"
        />
    )
}

// Before the rows: the skeleton, the load error with Retry, or the notice; Create bill is
// disabled, and gone while the load error shows.
function CopyToBillWaiting({ model, isVisible }: { model: CopyToBillModel; isVisible: boolean }) {
    if (!isVisible) return null
    const notice = noticeOf(model.body)
    const isLoading = model.body === 'loading'
    const isLoadError = model.body === 'load-error'
    return (
        <>
            <Dialog.Body>
                <View className="gap-3">
                    <Text testID="copy-to-bill-summary" className="text-sm text-muted-foreground">
                        {model.summary}
                    </Text>
                    <Loading isVisible={isLoading} />
                    <DialogLoadError
                        isVisible={isLoadError}
                        testIdPrefix="copy-to-bill-load"
                        testID="copy-to-bill-load-error"
                        message={PURCHASE_ORDER_MESSAGES.loadFailed}
                        onRetry={model.retry}
                    />
                    <Notice message={notice} />
                </View>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={model.close} testID="copy-to-bill-cancel" />
                <WaitingCreateBill isVisible={!isLoadError} />
            </Dialog.Footer>
        </>
    )
}

function OpenCopyToBillDialog({ owner, currency }: { owner: string; currency: string }) {
    const model = useCopyToBillDialog(owner, currency)
    const hasRows = model.body === 'rows'
    // The first row's input takes the focus when the rows first draw (web only: a native
    // keyboard would cover the Sheet).
    const focus = useFocusOnOpen(IS_WEB && hasRows)
    return (
        <Dialog
            isOpen
            onClose={model.close}
            title="Copy to bill"
            size="xl"
            testID="copy-to-bill-dialog"
            hasCloseButton={false}
            initialFocusRef={focus.ref}
        >
            <CopyToBillWaiting model={model} isVisible={!hasRows} />
            <RowsSlot model={model} focusRef={focus.ref} />
        </Dialog>
    )
}

// The store outlives the screen: close this owner's dialog when its screen loses focus or
// unmounts.
function useCloseOnBlur(owner: string) {
    useFocusEffect(
        useCallback(
            () => () => {
                const store = useCopyToBillStore.getState()
                if (store.openFor?.owner !== owner) return
                store.close()
            },
            [owner]
        )
    )
}

/**
 * The Copy to bill dialog (purchase order spec §3.7): a core Dialog of size xl (a Sheet on
 * a phone) titled "Copy to bill", with "Choose what this bill covers. Purchase order <n> ·
 * <vendor>", the all-rows tick box with the count ("2 of 3 lines"), the open lines under
 * "Products and services" and "Accounts" (each with its tick box, name, Vendor part no.,
 * description, "Open <n>", its Qty or Amount to bill and the hint above the open value),
 * "Bill total <money>", and Cancel (Esc) and Create bill (⌘↵). Two skeleton rows while a
 * read loads, the load error with Retry when one fails, and a notice when the order goes
 * away, closes or has nothing open; Create bill is disabled then, and not drawn beside the
 * load error. Each screen that can
 * open it mounts one with its own `owner`; it draws only while useCopyToBillStore names an
 * order for that owner, and closes when the screen loses focus. `currency` is the Books
 * currency.
 */
export function CopyToBillDialog({ owner, currency }: { owner: string; currency: string }) {
    const openFor = useCopyToBillStore(state => state.openFor)
    useCloseOnBlur(owner)
    if (openFor?.owner !== owner) return null
    return <OpenCopyToBillDialog owner={owner} currency={currency} />
}
