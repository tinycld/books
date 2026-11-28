import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { FormErrorSummary, TextAreaInput } from '@tinycld/core/ui/form'
import { useMemo, useState } from 'react'
import { Platform, ScrollView, Text, View } from 'react-native'
import { type DepositForm as DepositFormState, useDepositForm } from '../../hooks/useDepositForm'
import type {
    DepositItemRow,
    DepositLineRow,
    DepositRecordHeader,
} from '../../hooks/useDepositRecord'
import { type DepositSave, useDepositLeaveGuard, useDepositSave } from '../../hooks/useDepositSave'
import { useDepositShortcuts } from '../../hooks/useDepositShortcuts'
import { useDepositWrites } from '../../hooks/useDepositWrites'
import { type UndepositedItem, useUndepositedItems } from '../../hooks/useUndepositedItems'
import { bankAccountOptions, type DepositAccountRow } from '../../lib/deposit-accounts'
import { depositRefusalErrors } from '../../lib/deposit-refusals'
import type { DepositSchemaContext } from '../../lib/deposit-schema'
import type { DepositFormMode } from '../../lib/deposit-shortcuts'
import { DEPOSIT_MESSAGES } from '../../lib/deposit-texts'
import {
    correctionValuesOf,
    type DepositFormValues,
    depositDefaults,
    depositValuesOf,
} from '../../lib/deposit-values'
import { todayIso } from '../../lib/register-range'
import { rootErrorOnly } from '../../lib/root-errors'
import type { DepositRefusedSave } from '../../stores/deposit-save-store'
import { CorrectionBar, DocumentActionBar } from '../documents/DocumentActionBar'
import { DocumentHeader } from '../documents/DocumentHeader'
import { DeleteDraftDialog } from '../entries/DeleteDraftDialog'
import { DiscardDialog } from '../entries/DiscardDialog'
import { DepositBackLink } from './DepositBackLink'
import { DepositBand } from './DepositBand'
import { DepositTotals } from './DepositTotals'
import { OtherFundsSection } from './OtherFundsSection'
import { UndepositedSection } from './UndepositedSection'

// Deposit to takes the first focus on web only (spec §3.2, standing approval).
const AUTO_FOCUS = Platform.OS === 'web'
const MEMO_WIDE = { maxWidth: 560 }
const LOG_CONTEXT = 'books.deposit'

type ChartRow = DepositAccountRow

type DepositOriginal = {
    deposit: DepositRecordHeader
    items: readonly DepositItemRow[]
    lines: readonly DepositLineRow[]
}

const NO_ITEMS: readonly DepositItemRow[] = []

// The values the form mounts with: a handed-over refusal's, a draft's, a correction's (the
// original's, with new line ids) or a new deposit's defaults.
function initialValuesOf(input: {
    refused: DepositRefusedSave | null
    deposit: DepositRecordHeader | null
    items: readonly DepositItemRow[]
    lines: readonly DepositLineRow[]
    original: DepositOriginal | null
    accounts: readonly ChartRow[]
}): DepositFormValues {
    const { refused, deposit, original } = input
    if (refused) return refused.values
    if (deposit) return depositValuesOf(deposit, input.items, input.lines)
    if (original) return correctionValuesOf(original.deposit, original.items, original.lines)
    return depositDefaults({ accounts: input.accounts, today: todayIso() })
}

type BarProps = {
    mode: DepositFormMode
    save: DepositSave
    onCancel: () => void
    isSavedDraft: boolean
    isPhone: boolean
    scopeOwner: ScopeOwner
}

// A correction posts with Save (⌘↵).
const CORRECTION_POST = { id: 'save', label: 'Save' }

// The bar: a new deposit or a draft has Cancel, Save draft, Post, Post & new and More
// (DocumentActionBar); a correction has the shared CorrectionBar: Cancel and Save, and on a
// stored correction draft (a correction whose post was refused after its header was
// written) More with Delete draft (⌘⌫, registered by useDepositShortcuts).
function DepositFormBar(props: BarProps) {
    const { mode, save, onCancel, isSavedDraft, isPhone, scopeOwner } = props
    if (mode === 'replaces') {
        return (
            <CorrectionBar
                isSaving={save.isPending}
                canDeleteDraft={isSavedDraft}
                isPhone={isPhone}
                onCancel={onCancel}
                onPost={save.post}
                onDeleteDraft={save.openDeleteDraft}
                post={CORRECTION_POST}
                scopeOwner={scopeOwner}
            />
        )
    }
    return (
        <DocumentActionBar
            isSaving={save.isPending}
            canDeleteDraft={isSavedDraft}
            isPhone={isPhone}
            onCancel={onCancel}
            onSaveDraft={save.saveDraft}
            onPost={save.post}
            onPostAndNew={save.postAndNew}
            onDeleteDraft={save.openDeleteDraft}
            scopeOwner={scopeOwner}
        />
    )
}

function titleOf(mode: DepositFormMode, isNew: boolean, original: DepositOriginal | null) {
    if (mode === 'replaces') return `Edit deposit ${original?.deposit.number ?? ''}`.trim()
    return isNew ? 'Bank deposit' : 'Draft deposit'
}

interface DepositFormProps {
    // The saved draft; null for a new deposit.
    deposit: DepositRecordHeader | null
    items: readonly DepositItemRow[]
    lines: readonly DepositLineRow[]
    // The posted deposit a correction edits ('' for none): `?replaces` of a new form, or a
    // stored correction draft's `replaces`.
    replaces: string
    // That deposit with its items and lines; null without one.
    original: DepositOriginal | null
    accounts: readonly ChartRow[]
    balanceOf: (id: string) => number | null | undefined
    currency: string
    canWrite: boolean
    // A new deposit's refused save handed to this draft's form (read once by the screen).
    refused: DepositRefusedSave | null
    scopeOwner: ScopeOwner
}

// The schema's context from this render: the Deposit to options, every listed item by
// line and the chart by id.
function schemaContextOf(
    bankOptions: readonly string[],
    items: readonly UndepositedItem[],
    accounts: readonly ChartRow[]
): DepositSchemaContext {
    return {
        bankOptions,
        items: Object.fromEntries(
            items.map(item => [
                item.line,
                {
                    amount: item.amount,
                    date: item.date,
                    doc_type: item.doc_type,
                    number: item.number,
                },
            ])
        ),
        accounts: Object.fromEntries(
            accounts.map(account => [
                account.id,
                {
                    number: account.number,
                    name: account.name,
                    type: account.type,
                    inactive: account.inactive,
                },
            ])
        ),
    }
}

function MemoField({
    depositForm,
    isDisabled,
    isPhone,
}: {
    depositForm: DepositFormState
    isDisabled: boolean
    isPhone: boolean
}) {
    const memoStyle = isPhone ? undefined : MEMO_WIDE
    return (
        <View className="min-w-0 flex-1" style={memoStyle}>
            <TextAreaInput
                name="memo"
                control={depositForm.form.control}
                label="Memo"
                maxLength={4000}
                editable={!isDisabled}
                testID="deposit-memo"
            />
            <Text testID="deposit-memo-hint" className="mt-1 text-xs text-muted-foreground">
                {DEPOSIT_MESSAGES.memoHint}
            </Text>
        </View>
    )
}

/**
 * The deposit form for a new deposit, a saved draft and a correction (bank deposit spec
 * §3.3 to §3.7, §3.8 Edit): the back link and the header with the Deposit total figure
 * ("Edit deposit N" for a correction), the refusal summary, the band, the Undeposited
 * funds section, the Other funds section, the memo beside the totals (stacked on a
 * phone), and the bar with the Discard and Delete draft dialogs. A correction starts from
 * its original (its items ticked, its lines with new ids) and its bar is Cancel and Save.
 * The hooks run in a fixed order: the list, the form, the writes and save, the leave
 * guard, the keys.
 */
export function DepositForm({
    deposit,
    items,
    lines,
    replaces,
    original,
    accounts,
    balanceOf,
    currency,
    canWrite,
    refused,
    scopeOwner,
}: DepositFormProps) {
    const isPhone = useBreakpoint() === 'mobile'
    const depositId = deposit?.id ?? null
    const mode: DepositFormMode = replaces === '' ? 'new' : 'replaces'
    // The values and the start errors are read once: the form owns them from its mount.
    const [initial] = useState(() =>
        initialValuesOf({ refused, deposit, items, lines, original, accounts })
    )
    const [initialErrors] = useState(() =>
        refused
            ? depositRefusalErrors(
                  refused.error,
                  refused.stored,
                  refused.values.items,
                  refused.lineAt ?? null
              )
            : undefined
    )
    // The original's items are held by the original until the correction posts, so the
    // list shows them as a draft's stored items.
    const originalItems = original?.items ?? NO_ITEMS
    const listedStored = useMemo(() => [...items, ...originalItems], [items, originalItems])
    // A stored inactive account is named only for the value the form mounted with.
    const [storedDepositTo] = useState(() => initial.deposit_to)
    const bank = useMemo(
        () => bankAccountOptions(accounts, storedDepositTo),
        [accounts, storedDepositTo]
    )
    const undeposited = useUndepositedItems(listedStored, replaces)
    const context = useMemo(
        () =>
            schemaContextOf(
                bank.options.map(option => option.value),
                undeposited.items,
                accounts
            ),
        [bank.options, undeposited.items, accounts]
    )
    const depositForm = useDepositForm({
        initial,
        initialErrors,
        currency,
        context,
        items: undeposited.items,
    })
    const writes = useDepositWrites()
    const save = useDepositSave(writes, {
        depositForm,
        currency,
        depositId,
        storedItems: items,
        storedLines: lines,
        replaces,
        holdsHandOff: refused !== null,
    })
    const leaveGuard = useDepositLeaveGuard(save)
    const isDialogOpen = leaveGuard.dialog.isVisible || save.isDeleteOpen
    const shortcuts = useDepositShortcuts({
        scopeOwner,
        canWrite,
        isPending: save.isPending,
        isDialogOpen,
        isSavedDraft: depositId !== null,
        isPhone,
        mode,
        lineCount: depositForm.lineFields.length,
        isLineFocused: depositForm.lineFocus.isFocused,
        run: {
            selectAll: depositForm.onTickAll,
            deleteDraft: save.openDeleteDraft,
            postAndNew: save.postAndNew,
            removeLine: depositForm.lineFocus.removeFocused,
        },
    })
    // A running save, post or delete: every control waits for it, so an edit made during
    // the write is not lost when the form resets to what it submitted.
    const isWriting = save.isPending
    // Clear selection and its ⌥⌫, and Add line and its ⌥↵, follow the form's key rule
    // (depositFormKeysOffered).
    const isClearDisabled = isWriting || !shortcuts.offered.includes('clearSelection')
    const canAddLine = shortcuts.offered.includes('addLine')
    const title = titleOf(mode, depositId === null, original)
    const summaryErrors = rootErrorOnly(depositForm.form.formState.errors)
    const { totals } = depositForm
    const hasLines = depositForm.values.lines.length > 0
    const foot = isPhone ? 'gap-4' : 'flex-row items-start justify-between gap-6'
    const actions = {
        onToggle: depositForm.onToggle,
        onOpenLink: save.openLink,
        onTickAll: depositForm.onTickAll,
        isDisabled: isWriting,
    }
    const retryList = () => {
        void recoverLiveQueries({
            ...undeposited.recovery,
            onError: err => log.error(LOG_CONTEXT, err),
        })
    }
    return (
        <View testID="deposit-form" className="min-w-0 flex-1 bg-background">
            <ScrollView
                className="flex-1"
                contentContainerClassName="gap-4 px-4 pt-2 pb-6"
                keyboardShouldPersistTaps="handled"
            >
                <DepositBackLink onPress={leaveGuard.back} />
                <DocumentHeader
                    title={title}
                    status="draft"
                    figure={depositForm.figure}
                    isExpired={false}
                />
                <FormErrorSummary
                    errors={summaryErrors}
                    title={null}
                    variant="destructive"
                    showFieldNames={false}
                    testID="deposit-error-summary"
                    isEnabled
                />
                <DepositBand
                    depositForm={depositForm}
                    options={bank.options}
                    triggerLabel={bank.triggerLabel}
                    balanceOf={balanceOf}
                    currency={currency}
                    isPhone={isPhone}
                    isDisabled={isWriting}
                    hasFocusOnOpen={AUTO_FOCUS}
                />
                <UndepositedSection
                    depositForm={depositForm}
                    isLoading={undeposited.isLoading}
                    isError={undeposited.isError}
                    onRetry={retryList}
                    currency={currency}
                    actions={actions}
                    isClearDisabled={isClearDisabled}
                    scopeOwner={scopeOwner}
                />
                <OtherFundsSection
                    depositForm={depositForm}
                    accounts={accounts}
                    currency={currency}
                    isWriting={isWriting}
                    canAdd={canAddLine}
                    scopeOwner={scopeOwner}
                />
                <View className={foot}>
                    <MemoField depositForm={depositForm} isDisabled={isWriting} isPhone={isPhone} />
                    <DepositTotals
                        itemsTotal={totals.itemsTotal}
                        linesTotal={totals.linesTotal}
                        total={totals.total}
                        hasLines={hasLines}
                        currency={currency}
                    />
                </View>
            </ScrollView>
            <DepositFormBar
                mode={mode}
                save={save}
                onCancel={leaveGuard.cancel}
                isSavedDraft={depositId !== null}
                isPhone={isPhone}
                scopeOwner={scopeOwner}
            />
            <DiscardDialog title="Discard changes?" {...leaveGuard.dialog} />
            <DeleteDraftDialog
                isVisible={save.isDeleteOpen}
                onConfirm={save.confirmDelete}
                onCancel={save.closeDeleteDraft}
                isPending={save.isDeletePending}
                errorMessage={save.deleteError}
                body={DEPOSIT_MESSAGES.deleteDraftBody}
            />
        </View>
    )
}
