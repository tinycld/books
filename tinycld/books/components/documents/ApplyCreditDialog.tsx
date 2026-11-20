import { HelpIcon } from '@tinycld/core/components/help/HelpIcon'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { type Shortcut, useRegisterShortcuts } from '@tinycld/core/lib/shortcuts'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { FormErrorSummary } from '@tinycld/core/ui/form'
import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { router } from 'expo-router'
import { type ReactNode, useId, useMemo, useRef } from 'react'
import { get, useController } from 'react-hook-form'
import { Text, View } from 'react-native'
import {
    type ApplyCreditState,
    type ApplyCreditTarget,
    useApplyCredit,
} from '../../hooks/useApplyCredit'
import type { CreditApplicationKind } from '../../lib/credit-application-kinds'
import type { LiveRecovery } from '../../lib/live-recovery'
import { formatMoney } from '../../lib/money'
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
import { type PaymentsLineOpeners, UnappliedPaymentsLine } from './UnappliedPaymentsLine'

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
// cells too); registered only while rows are listed and no write runs. Its words come from
// the dialog's kind and side.
function ToggleRowKey({
    isEnabled,
    description,
    group,
    onToggle,
}: {
    isEnabled: boolean
    description: string
    group: string
    onToggle: () => void
}) {
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
                description,
                group,
                allowInInputs: true,
                run: () => runRef.current(),
            },
        ]
    }, [instance, isEnabled, description, group])
    useRegisterShortcuts(shortcuts)
    return null
}

// The figure (spec §3.2, §7): the fixed side's label over its amount, the eye's first stop,
// with the help topic beside it.
function ApplyFigure({
    label,
    value,
    topic,
}: {
    label: string
    value: string
    topic: CreditApplicationKind['helpTopic']
}) {
    return (
        <View className="flex-row items-center gap-2">
            <View className="gap-0.5">
                <Text className="text-xs text-muted-foreground">{label}</Text>
                <Text
                    testID={`${TEST_ID_PREFIX}-figure`}
                    className="text-2xl font-semibold text-foreground tabular-nums"
                >
                    {value}
                </Text>
            </View>
            <HelpIcon topic={topic} />
        </View>
    )
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
                disabled={apply.state.fieldsDisabled}
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

// One button of the empty state: it closes the dialog and pushes the kind's route, so Back
// returns to the credit.
function EmptyActionButton({
    testID,
    label,
    href,
}: {
    testID: string
    label: string
    href: string
}) {
    const orgHref = useOrgHref()
    const close = useApplyCreditStore(state => state.close)
    const openPushed = () => {
        close()
        router.push(orgHref(href))
    }
    return (
        <Button testID={testID} variant="outline" style={TAP} onPress={openPushed}>
            <ButtonText>{label}</ButtonText>
        </Button>
    )
}

// The party has no open document (from a credit; vendor credit spec §3.9, apply credit
// spec §3.2): the text and the kind's buttons (New bill and Record refund, or New invoice
// and Refund credit). From an invoice (spec §3.3), the text alone: its last credit memo left
// the list while the dialog was open.
function EmptyRows({ apply, target }: { apply: ApplyCreditState; target: ApplyCreditTarget }) {
    const actions = target.from === 'credit' ? target.kind.emptyActions : []
    const buttons = actions.map(action => (
        <EmptyActionButton
            key={action.testId}
            testID={action.testId}
            label={action.label}
            href={action.href({ party: target.party, id: target.id })}
        />
    ))
    const hasButtons = buttons.length > 0
    return (
        <View testID={`${TEST_ID_PREFIX}-empty`} className="gap-3">
            <Text className="text-sm text-foreground">{apply.emptyText}</Text>
            <EmptyButtons isVisible={hasButtons}>{buttons}</EmptyButtons>
        </View>
    )
}

function EmptyButtons({ isVisible, children }: { isVisible: boolean; children: ReactNode }) {
    if (!isVisible) return null
    return <View className="flex-row flex-wrap gap-2">{children}</View>
}

// The shared grid's and cards' props for the listed rows.
function rowListOf(apply: ApplyCreditState, currency: string): OutstandingGridProps {
    const { rows, payments } = apply
    const errors = apply.form.formState.errors
    const rowErrors = Object.fromEntries(
        rows.map(row => [row.id, errorText(errors, `payments.${row.id}.amount`)])
    )
    return {
        doc: apply.listDoc,
        rows,
        tickAll: tickAllState(rows, payments, currency),
        payments,
        rowErrors,
        currency,
        today: todayIso(),
        isDisabled: apply.state.fieldsDisabled,
        onTick: apply.tick,
        // The apply lists have no header tick box (`hasPayAll` false).
        onTickAll: ignore,
        onType: apply.type,
        onNext: apply.focusAfterRow,
        onFocusRow: apply.onFocusRow,
        rowRef: apply.rowRef,
    }
}

// The grid at or above the descriptor's least width, else the cards; nothing until the
// width is measured, so the first cell that takes the focus on open is the one that stays.
function RowList({ width, list }: { width: number; list: OutstandingGridProps }) {
    if (width === 0) return null
    if (width < list.doc.gridMinWidth) return <OutstandingCards {...list} />
    return <OutstandingGrid {...list} />
}

// From an invoice (spec §3.3): the customer's payments with an amount that is not applied,
// under the summary, its links the openers the invoice's frame built on the screen; nothing
// from a credit (no openers).
function DialogPaymentsLine({
    target,
    openers,
}: {
    target: ApplyCreditTarget
    openers: PaymentsLineOpeners | undefined
}) {
    if (target.from !== 'document' || openers === undefined) return null
    return (
        <UnappliedPaymentsLine
            customerId={target.party}
            currency={target.currency}
            testID={`${TEST_ID_PREFIX}-payments-line`}
            testIdPrefix={`${TEST_ID_PREFIX}-unapplied`}
            openers={openers}
        />
    )
}

function ListedRows({
    apply,
    target,
    openers,
}: {
    apply: ApplyCreditState
    target: ApplyCreditTarget
    openers: PaymentsLineOpeners | undefined
}) {
    const { width, onLayout } = useContainerWidth()
    const list = rowListOf(apply, target.currency)
    return (
        <View className="gap-3" onLayout={onLayout}>
            <RowList width={width} list={list} />
            <ClearLink
                label="Clear"
                testID={`${TEST_ID_PREFIX}-clear`}
                isDisabled={apply.state.fieldsDisabled}
                onPress={apply.clear}
                linkRef={apply.clearRef}
            />
            <Text testID={`${TEST_ID_PREFIX}-summary`} className="text-sm text-muted-foreground">
                {apply.summary}
            </Text>
            <DialogPaymentsLine target={target} openers={openers} />
        </View>
    )
}

// What stands under the date, by applyDialogState: the skeleton while the reads load, the
// load error with Retry, the empty state, or the rows.
function ApplyBody({
    apply,
    target,
    openers,
}: {
    apply: ApplyCreditState
    target: ApplyCreditTarget
    openers: PaymentsLineOpeners | undefined
}) {
    const { body } = apply.state
    if (body === 'loading') return <SkeletonRows />
    if (body === 'load-error') {
        return (
            <DialogLoadError
                isVisible
                testIdPrefix={`${TEST_ID_PREFIX}-load`}
                testID={`${TEST_ID_PREFIX}-load-error`}
                message={apply.texts.loadFailed}
                onRetry={apply.retryLoad}
            />
        )
    }
    if (body === 'empty') return <EmptyRows apply={apply} target={target} />
    return <ListedRows apply={apply} target={target} openers={openers} />
}

/**
 * The shared apply dialog (vendor credit spec §3.9, apply credit spec §3.2–§3.4) of one fixed
 * side (`target`: a credit applied to its party's open documents, or an invoice that takes
 * its customer's credit memos): a core Dialog (a Sheet on a phone) titled from the kind's
 * texts, the figure (the fixed side's label and amount, with the kind's help topic), the
 * Apply date, the root refusals, and the rows of the kind's list descriptor as the shared
 * grid (its content at least the descriptor's `gridMinWidth`) or cards (below it), Clear,
 * the summary and, from an invoice, the payments line (UnappliedPaymentsLine); or the
 * skeleton, the load error with Retry, or the empty state (with the kind's buttons from a
 * credit; from an invoice, the "no unapplied credit" text alone). Cancel (Esc) and Apply credit (⌘↵, disabled unless applyDialogState allows
 * it: rows listed, writes available, no write held). The first cell has focus when the
 * measured list first draws it (web). The credit's or the invoice's read frame mounts it
 * while the store names the record or holds a write, and hands it `sectionRecovery` (the
 * frame's own failed read of the rows' source), which Retry recovers too. The invoice's frame
 * also hands it the payments line's openers (`paymentsLineOpeners`): the dialog's content
 * gets no navigation on native, so the line's links are built on the screen.
 */
export function ApplyCreditDialog({
    target,
    sectionRecovery,
    paymentsLineOpeners,
}: {
    target: ApplyCreditTarget
    sectionRecovery: LiveRecovery
    paymentsLineOpeners?: PaymentsLineOpeners
}) {
    const apply = useApplyCredit(target, sectionRecovery)
    const close = useApplyCreditStore(state => state.close)
    const { formState } = apply.form
    const { fieldsDisabled, canSubmit } = apply.state
    const onClose = fieldsDisabled ? ignore : close
    const figure = formatMoney(target.balance, target.currency)
    const submit = () => void apply.submit()
    const isToggleKeyOn = apply.hasRows && !fieldsDisabled
    return (
        <Dialog
            isOpen
            onClose={onClose}
            title={apply.title}
            size="xl"
            testID={`${TEST_ID_PREFIX}-dialog`}
            hasCloseButton={false}
            initialFocusRef={apply.firstCellRef}
        >
            <Dialog.Body>
                <ToggleRowKey
                    isEnabled={isToggleKeyOn}
                    description={apply.toggleKey.description}
                    group={apply.toggleKey.group}
                    onToggle={apply.toggle}
                />
                <ApplyFigure
                    label={apply.texts.figureLabel}
                    value={figure}
                    topic={target.kind.helpTopic}
                />
                <ApplyDateField apply={apply} />
                <FormErrorSummary
                    testID={`${TEST_ID_PREFIX}-error-summary`}
                    errors={rootErrorOnly(formState.errors)}
                    showFieldNames={false}
                    isEnabled={formState.isSubmitted}
                />
                <ApplyBody apply={apply} target={target} openers={paymentsLineOpeners} />
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton
                    onPress={onClose}
                    isDisabled={fieldsDisabled}
                    testID={`${TEST_ID_PREFIX}-cancel`}
                />
                <Dialog.ActionButton
                    label="Apply credit"
                    onPress={submit}
                    isDisabled={!canSubmit}
                    shortcut={DIALOG_SUBMIT_SHORTCUT}
                    testID={`${TEST_ID_PREFIX}-submit`}
                />
            </Dialog.Footer>
        </Dialog>
    )
}
