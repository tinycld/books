import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { type Shortcut, useRegisterShortcuts } from '@tinycld/core/lib/shortcuts'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { FormErrorSummary } from '@tinycld/core/ui/form'
import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { router } from 'expo-router'
import { useId, useMemo, useRef } from 'react'
import { get, useController } from 'react-hook-form'
import { Text, View } from 'react-native'
import {
    type ApplyCreditState,
    type ApplyCreditTarget,
    useApplyCredit,
} from '../../hooks/useApplyCredit'
import { APPLY_CREDIT_MESSAGES } from '../../lib/apply-credit-schema'
import type { LiveRecovery } from '../../lib/live-recovery'
import { formatMoney } from '../../lib/money'
import { CREDIT_OUTSTANDING } from '../../lib/outstanding-documents'
import { PAYMENT_FORM_KEYS } from '../../lib/payment-shortcuts'
import { todayIso } from '../../lib/register-range'
import { rootErrorOnly } from '../../lib/root-errors'
import { useApplyCreditStore } from '../../stores/apply-credit-store'
import { ClearLink } from '../payments/ClearPaymentsLink'
import { OutstandingCards } from '../payments/OutstandingCards'
import {
    OutstandingGrid,
    type OutstandingGridProps,
    tickAllState,
} from '../payments/OutstandingGrid'
import { FieldError } from '../payments/PaymentMoneyField'
import { DialogLoadError } from '../taxes/DialogLoadError'

const TEST_ID_PREFIX = 'apply-credit'
const TAP = { minHeight: 44 }
const SKELETON_ROW = { height: 44 }
const DATE_WIDTH = { maxWidth: 240 }

function ignore() {}

function errorText(errors: unknown, path: string): string {
    const message: unknown = get(errors, path)?.message
    return typeof message === 'string' ? message : ''
}

// ⌥↵ in a Credit to apply cell toggles its row (the dialog's modal scope, typed in the
// cells too); registered only while rows are listed and no write runs.
function ToggleRowKey({ isEnabled, onToggle }: { isEnabled: boolean; onToggle: () => void }) {
    const instance = useId()
    const runRef = useRef(onToggle)
    runRef.current = onToggle
    const shortcuts = useMemo<Shortcut[]>(() => {
        if (!isEnabled) return []
        return [
            {
                id: `books.applyCredit.${instance}.toggleRow`,
                keys: PAYMENT_FORM_KEYS.toggleRow,
                scope: 'modal',
                description: 'Apply the credit to this bill, or clear it',
                group: 'Apply vendor credit',
                allowInInputs: true,
                run: () => runRef.current(),
            },
        ]
    }, [instance, isEnabled])
    useRegisterShortcuts(shortcuts)
    return null
}

// Apply date: core DateField (its "Open calendar" button follows it), its error under it.
function ApplyDateField({ apply }: { apply: ApplyCreditState }) {
    const { control, formState } = apply.form
    const { field } = useController({ control, name: 'date' })
    const handleChange = (next: string | null) => field.onChange(next ?? '')
    const error = errorText(formState.errors, 'date')
    return (
        <View className="gap-1" style={DATE_WIDTH}>
            <Text className="text-sm font-semibold text-foreground">Apply date *</Text>
            <DateField
                value={field.value}
                onChange={handleChange}
                withTime={false}
                disabled={apply.isSaving}
                accessibilityLabel="Apply date"
                testID={`${TEST_ID_PREFIX}-date`}
            />
            <FieldError message={error} testID={`${TEST_ID_PREFIX}-date-error`} />
        </View>
    )
}

function SkeletonRows() {
    return (
        <View testID={`${TEST_ID_PREFIX}-loading`} className="gap-2">
            <View className="rounded-md bg-surface-secondary" style={SKELETON_ROW} />
            <View className="rounded-md bg-surface-secondary" style={SKELETON_ROW} />
            <View className="rounded-md bg-surface-secondary" style={SKELETON_ROW} />
        </View>
    )
}

// No open bill for the vendor (vendor refund spec §3.9): the text, New bill, which opens a
// bill for the vendor, and Record refund beside it, which opens a vendor refund for the
// vendor with this credit ticked. Both close the dialog and push, so Back returns to the
// credit.
function NoOpenBills({ text, credit }: { text: string; credit: ApplyCreditTarget }) {
    const orgHref = useOrgHref()
    const close = useApplyCreditStore(state => state.close)
    const openPushed = (href: string) => {
        close()
        router.push(orgHref(href))
    }
    const newBill = () => openPushed(`books/bills/new?vendor=${credit.vendor}`)
    const recordRefund = () =>
        openPushed(`books/vendor-refunds/new?vendor=${credit.vendor}&credit=${credit.id}`)
    return (
        <View testID={`${TEST_ID_PREFIX}-empty`} className="gap-3">
            <Text className="text-sm text-foreground">{text}</Text>
            <View className="flex-row flex-wrap gap-2">
                <Button
                    testID={`${TEST_ID_PREFIX}-new-bill`}
                    variant="outline"
                    style={TAP}
                    onPress={newBill}
                >
                    <ButtonText>New bill</ButtonText>
                </Button>
                <Button
                    testID={`${TEST_ID_PREFIX}-record-refund`}
                    variant="outline"
                    style={TAP}
                    onPress={recordRefund}
                >
                    <ButtonText>Record refund</ButtonText>
                </Button>
            </View>
        </View>
    )
}

// The shared grid's and cards' props for the listed bills.
function billListOf(apply: ApplyCreditState, currency: string): OutstandingGridProps {
    const { rows, payments } = apply
    const errors = apply.form.formState.errors
    const rowErrors = Object.fromEntries(
        rows.map(row => [row.id, errorText(errors, `payments.${row.id}.amount`)])
    )
    return {
        doc: CREDIT_OUTSTANDING,
        rows,
        tickAll: tickAllState(rows, payments, currency),
        payments,
        rowErrors,
        currency,
        today: todayIso(),
        isDisabled: apply.isSaving,
        onTick: apply.tick,
        // The credit's list has no header tick box (CREDIT_OUTSTANDING.hasPayAll).
        onTickAll: ignore,
        onType: apply.type,
        onNext: apply.focusAfterRow,
        onFocusRow: apply.onFocusRow,
        rowRef: apply.rowRef,
    }
}

// The grid at or above its least width, else the cards; nothing until the width is
// measured, so the first cell that takes the focus on open is the one that stays.
function BillList({ width, list }: { width: number; list: OutstandingGridProps }) {
    if (width === 0) return null
    if (width < CREDIT_OUTSTANDING.gridMinWidth) return <OutstandingCards {...list} />
    return <OutstandingGrid {...list} />
}

function BillRows({ apply, currency }: { apply: ApplyCreditState; currency: string }) {
    const { width, onLayout } = useContainerWidth()
    const list = billListOf(apply, currency)
    return (
        <View className="gap-3" onLayout={onLayout}>
            <BillList width={width} list={list} />
            <ClearLink
                label="Clear"
                testID={`${TEST_ID_PREFIX}-clear`}
                isDisabled={apply.isSaving}
                onPress={apply.clear}
                linkRef={apply.clearRef}
            />
            <Text testID={`${TEST_ID_PREFIX}-summary`} className="text-sm text-muted-foreground">
                {apply.summary}
            </Text>
        </View>
    )
}

// What stands under the date: the skeleton while the reads load, the load error with
// Retry, the no-open-bills text, or the bills.
function ApplyBody({ apply, credit }: { apply: ApplyCreditState; credit: ApplyCreditTarget }) {
    if (apply.isLoading) return <SkeletonRows />
    if (apply.loadFailed) {
        return (
            <DialogLoadError
                isVisible
                testIdPrefix={`${TEST_ID_PREFIX}-load`}
                testID={`${TEST_ID_PREFIX}-load-error`}
                message={APPLY_CREDIT_MESSAGES.loadFailed}
                onRetry={apply.retryLoad}
            />
        )
    }
    if (apply.isEmpty) return <NoOpenBills text={apply.emptyText} credit={credit} />
    return <BillRows apply={apply} currency={credit.currency} />
}

/**
 * The apply dialog of a posted vendor credit (vendor credit spec §3.9): a core Dialog (a
 * Sheet on a phone) with the unapplied credit, the Apply date, and the vendor's open bills
 * as the shared grid (its content at least `CREDIT_OUTSTANDING.gridMinWidth`) or cards
 * (below it), Clear and the summary, or, for a vendor with no open bill, the text with New
 * bill and Record refund; Cancel (Esc) and Apply credit (⌘↵, disabled unless
 * the rows are listed). The first cell has focus when the measured list first draws it
 * (web). The vendor credit's read section mounts it while the store names the credit or
 * holds a write, and hands it `sectionRecovery` (its own failed open-bills read), which
 * Retry recovers too.
 */
export function ApplyCreditDialog({
    credit,
    sectionRecovery,
}: {
    credit: ApplyCreditTarget
    sectionRecovery: LiveRecovery
}) {
    const apply = useApplyCredit(credit, sectionRecovery)
    const close = useApplyCreditStore(state => state.close)
    const { formState } = apply.form
    const onClose = apply.isSaving ? ignore : close
    const unapplied = `Unapplied credit ${formatMoney(credit.balance, credit.currency)}`
    const submit = () => void apply.submit()
    const isToggleKeyOn = apply.hasRows && !apply.isSaving
    const title = `Apply vendor credit ${credit.number}`
    const isSubmitDisabled = !apply.canSave
    return (
        <Dialog
            isOpen
            onClose={onClose}
            title={title}
            size="xl"
            testID={`${TEST_ID_PREFIX}-dialog`}
            hasCloseButton={false}
            initialFocusRef={apply.firstCellRef}
        >
            <Dialog.Body>
                <ToggleRowKey isEnabled={isToggleKeyOn} onToggle={apply.toggle} />
                <Text
                    testID={`${TEST_ID_PREFIX}-unapplied`}
                    className="text-sm font-semibold text-foreground"
                >
                    {unapplied}
                </Text>
                <ApplyDateField apply={apply} />
                <FormErrorSummary
                    testID={`${TEST_ID_PREFIX}-error-summary`}
                    errors={rootErrorOnly(formState.errors)}
                    showFieldNames={false}
                    isEnabled={formState.isSubmitted}
                />
                <ApplyBody apply={apply} credit={credit} />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton
                    onPress={close}
                    isDisabled={apply.isSaving}
                    testID={`${TEST_ID_PREFIX}-cancel`}
                />
                <Dialog.ActionButton
                    label="Apply credit"
                    onPress={submit}
                    isDisabled={isSubmitDisabled}
                    shortcut={DIALOG_SUBMIT_SHORTCUT}
                    testID={`${TEST_ID_PREFIX}-submit`}
                />
            </Dialog.Footer>
        </Dialog>
    )
}
