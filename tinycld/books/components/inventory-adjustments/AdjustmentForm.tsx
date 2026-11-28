import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { FormErrorSummary } from '@tinycld/core/ui/form'
import { useContainerWidth } from '@tinycld/core/ui/forms/use-container-width'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { useMemo, useState } from 'react'
import { Platform, ScrollView, Text, View } from 'react-native'
import {
    type AdjustmentFormStart,
    type AdjustmentForm as AdjustmentFormState,
    useAdjustmentForm,
} from '../../hooks/useAdjustmentForm'
import type { ExcludedChange } from '../../hooks/useAdjustmentLineStock'
import type { AdjustmentRecordHeader } from '../../hooks/useAdjustmentRecord'
import {
    type AdjustmentSave,
    useAdjustmentLeaveGuard,
    useAdjustmentSave,
} from '../../hooks/useAdjustmentSave'
import { useAdjustmentShortcuts } from '../../hooks/useAdjustmentShortcuts'
import type { FormAccount } from '../../hooks/useFormAccounts'
import { adjustmentAccountOptions, lineAssetAccounts } from '../../lib/adjustment-accounts'
import { ADJUSTMENT_FRAME_BORDER, adjustmentLinesMinWidth } from '../../lib/adjustment-columns'
import { adjustmentRefusalErrors } from '../../lib/adjustment-refusals'
import {
    ADJUSTMENT_FORM_DESCRIPTIONS,
    ADJUSTMENT_FORM_KEYS,
    ADJUSTMENT_LINES_GROUP,
} from '../../lib/adjustment-shortcuts'
import { documentConflictText } from '../../lib/revision'
import { rootErrorOnly } from '../../lib/root-errors'
import { showsTableCards } from '../../lib/table-fit'
import type { AdjustmentRefusedSave } from '../../stores/adjustment-save-store'
import { ConflictNotice } from '../ConflictNotice'
import { CorrectionBar, DocumentActionBar } from '../documents/DocumentActionBar'
import { DiscardDialog } from '../entries/DiscardDialog'
import { AdjustmentDeleteDialog } from './AdjustmentDialogs'
import { AdjustmentFormHeader } from './AdjustmentFormHeader'
import { AdjustmentLineCards } from './AdjustmentLineCards'
import type { AdjustmentLinesProps } from './AdjustmentLineCells'
import { AdjustmentLinesTable } from './AdjustmentLinesTable'

// The Date takes the first focus on web only (spec §3.2).
const AUTO_FOCUS = Platform.OS === 'web'
const LOG_CONTEXT = 'books.inventory-adjustment'
const TAP = { minHeight: 44 }

const ADD_LINE_SHORTCUT = {
    keys: ADJUSTMENT_FORM_KEYS.addLine,
    scope: 'compose',
    allowInInputs: true,
    group: ADJUSTMENT_LINES_GROUP,
} as const

// A line as the save plans it: the stored draft's lines carry only these.
export type AdjustmentStoredLine = {
    id: string
    product: string
    bin: string
    quantity: number
    value: number
    value_given: boolean
    position: number
}

// A read that failed after the form opened: its text and Retry, in place.
function ReadError({
    isVisible,
    message,
    onRetry,
    testID,
}: {
    isVisible: boolean
    message: string
    onRetry: () => void
    testID: string
}) {
    if (!isVisible) return null
    return (
        <View
            testID={testID}
            accessibilityRole="alert"
            className="flex-row flex-wrap items-center gap-2"
        >
            <Text className="text-sm text-danger">{message}</Text>
            <Button variant="outline" size="sm" style={TAP} onPress={onRetry}>
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

interface LinesSectionProps {
    adjustmentForm: AdjustmentFormState
    hasBins: boolean
    isPhone: boolean
    isWriting: boolean
    canAdd: boolean
    scopeOwner: ScopeOwner
}

/**
 * The lines (inventory-adjust spec §3.3): the table while the section is at least its
 * least width (`adjustmentLinesMinWidth`, from the section's own width) and not on a phone,
 * else cards; a failed read of the items' stock with Retry; then Add line (⌥↵, a
 * ShortcutButton in the screen's scope, idle at 500 lines).
 */
function LinesSection({
    adjustmentForm,
    hasBins,
    isPhone,
    isWriting,
    canAdd,
    scopeOwner,
}: LinesSectionProps) {
    const { width, onLayout } = useContainerWidth()
    const isCards = showsTableCards({
        isPhone,
        width: width > 0 ? width : null,
        minWidth: adjustmentLinesMinWidth(hasBins),
        // onLayout gives the frame's outer width, border included (cards draw no border,
        // and the outer width is the same in both).
        gutter: ADJUSTMENT_FRAME_BORDER,
    })
    const { stock, lineFocus } = adjustmentForm
    const lines: AdjustmentLinesProps = {
        fields: adjustmentForm.lineFields,
        lines: adjustmentForm.values.lines,
        errors: adjustmentForm.form.formState.errors,
        stock,
        actions: adjustmentForm.line,
        lineFocus,
        hasBins,
        isDisabled: isWriting,
    }
    const frame = isCards ? 'gap-3' : 'gap-3 rounded-xl border border-border p-4'
    const body = isCards ? <AdjustmentLineCards {...lines} /> : <AdjustmentLinesTable {...lines} />
    const retryStock = () => {
        void recoverLiveQueries({ ...stock.recovery, onError: err => log.error(LOG_CONTEXT, err) })
    }
    return (
        <View testID="inventory-adjustment-lines" className={frame} onLayout={onLayout}>
            <ReadError
                isVisible={stock.isError}
                message="Could not load the stock of these items."
                onRetry={retryStock}
                testID="inventory-adjustment-stock-error"
            />
            {body}
            <View ref={lineFocus.addLineRef} className="self-start">
                <ShortcutButton
                    label={ADJUSTMENT_FORM_DESCRIPTIONS.addLine}
                    shortcut={ADD_LINE_SHORTCUT}
                    onPress={lineFocus.add}
                    variant="outline"
                    isDisabled={isWriting || !canAdd}
                    testID="inventory-adjustment-add-line"
                    scopeOwner={scopeOwner}
                />
            </View>
        </View>
    )
}

const STALE_TEXT = documentConflictText('Inventory adjustment', 'posting')
// A correction posts with Post (spec §3.4), as the deposit's correction does with Save.
const CORRECTION_POST = { id: 'post', label: 'Post' }

interface FormBarProps {
    save: AdjustmentSave
    onCancel: () => void
    isSavedDraft: boolean
    isPhone: boolean
    // The draft changed elsewhere: every write waits until the current one is loaded.
    isStale: boolean
    scopeOwner: ScopeOwner
}

// The bar: a new adjustment or a draft has Cancel, Save draft, Post, Post & new and More
// (DocumentActionBar; on a phone Save draft and Post & new are More rows); a correction
// has the shared CorrectionBar (Cancel and Post; More with Delete draft on a stored
// correction draft, the hand-off of a refused post).
function AdjustmentFormBar({
    save,
    onCancel,
    isSavedDraft,
    isPhone,
    isStale,
    scopeOwner,
}: FormBarProps) {
    if (save.isCorrection) {
        return (
            <CorrectionBar
                isSaving={save.isPending}
                canDeleteDraft={isSavedDraft}
                isPhone={isPhone}
                onCancel={onCancel}
                onPost={save.post}
                onDeleteDraft={save.openDeleteDraft}
                post={CORRECTION_POST}
                areWritesDisabled={isStale}
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
            savesDraftInMore
            areWritesDisabled={isStale}
            scopeOwner={scopeOwner}
        />
    )
}

interface AdjustmentFormProps {
    // The stored draft; null for a new adjustment.
    adjustment: AdjustmentRecordHeader | null
    // The draft's stored lines, live, in position order.
    storedLines: readonly AdjustmentStoredLine[]
    // The values the form mounts with, or the adjustment a correction or a copy starts from
    // (the screen gives them once its reads are in; useAdjustmentForm builds the values).
    start: AdjustmentFormStart
    hasBins: boolean
    canWrite: boolean
    // The chart, read by the screen; a failed read after the form opened shows with Retry.
    accounts: readonly FormAccount[]
    isAccountsError: boolean
    onRetryAccounts: () => void
    isActiveBin: (id: string) => boolean
    // A new adjustment's refused save handed to this draft's form (read once by the
    // screen): the form shows its refusal from the mount.
    refused: AdjustmentRefusedSave | null
    // The lines of the posted adjustment a correction replaces: On hand leaves them out,
    // as the post takes them back first (spec §3.4).
    excluded: readonly ExcludedChange[]
    // The posted adjustment this form corrects ('' for none).
    replaces: string
    // The draft was posted or deleted elsewhere (adjustmentStale): the notice shows, and
    // the writes wait until the current adjustment is loaded.
    stale: boolean
    onLoadCurrent: () => void
    scopeOwner: ScopeOwner
}

/**
 * The inventory adjustment form for a new adjustment and a saved draft (inventory-adjust
 * spec §3.2 to §3.4): the head (AdjustmentFormHeader), the refusal summary, the lines and
 * Add line, and the bar (DocumentActionBar; on a phone Cancel, Post and More with Save
 * draft and Post & new) with the Discard dialog. The Adjustment account offers every active
 * account but Accounts receivable, Accounts payable and the asset accounts of the lines'
 * items; a stored account it no longer offers stays named. The hooks run in a fixed order:
 * the form, the save, the leave guard, the keys.
 */
export function AdjustmentForm({
    adjustment,
    storedLines,
    start,
    hasBins,
    canWrite,
    accounts,
    isAccountsError,
    onRetryAccounts,
    isActiveBin,
    refused,
    excluded,
    replaces,
    stale,
    onLoadCurrent,
    scopeOwner,
}: AdjustmentFormProps) {
    const isPhone = useBreakpoint() === 'mobile'
    const adjustmentId = adjustment?.id ?? null
    // The hand-off's refusal, placed once: the form owns its errors from its mount.
    const [initialErrors] = useState(() =>
        refused
            ? adjustmentRefusalErrors(refused.error, {
                  saved: refused.saved,
                  formLines: refused.values.lines,
                  lineAt: refused.lineAt ?? null,
              })
            : undefined
    )
    const adjustmentForm = useAdjustmentForm({
        ...start,
        initialErrors,
        hasBins,
        isActiveBin,
        excluded,
    })
    const { stock, values } = adjustmentForm
    // A stored inactive account is named only for the value the form mounted with.
    const [storedAccount] = useState(() => adjustmentForm.initial.account)
    const lineItems = values.lines.flatMap(line => stock.productOf(line.product) ?? [])
    const assets = lineAssetAccounts(accounts, lineItems)
    const assetKey = [...assets].sort().join(',')
    const account = useMemo(
        () => adjustmentAccountOptions(accounts, storedAccount, new Set(assetKey.split(','))),
        [accounts, storedAccount, assetKey]
    )
    const save = useAdjustmentSave({
        adjustmentForm,
        adjustmentId,
        storedLines,
        holdsHandOff: refused !== null,
        replaces,
    })
    const leaveGuard = useAdjustmentLeaveGuard(save)
    const isSavedDraft = adjustmentId !== null
    const deleteDraft = isSavedDraft ? save.openDeleteDraft : undefined
    const shortcuts = useAdjustmentShortcuts({
        scopeOwner,
        canWrite,
        isPending: save.isPending,
        isDialogOpen: leaveGuard.dialog.isVisible || save.isDeleteOpen,
        isSavedDraft,
        isPhone,
        mode: save.isCorrection ? 'replaces' : 'new',
        isStale: stale,
        lineCount: adjustmentForm.lineFields.length,
        isLineFocused: adjustmentForm.lineFocus.isFocused,
        run: {
            saveDraft: save.saveDraft,
            postAndNew: save.postAndNew,
            removeLine: adjustmentForm.lineFocus.removeFocused,
            deleteDraft,
        },
    })
    // A running save or post: every control waits for it, so an edit made during the write
    // is not lost when the form resets to what it submitted.
    const isWriting = save.isPending
    const summaryErrors = rootErrorOnly(adjustmentForm.form.formState.errors)
    return (
        <View testID="inventory-adjustment-form" className="min-w-0 flex-1 bg-background">
            <ScrollView
                className="flex-1"
                contentContainerClassName="gap-4 px-4 pt-2 pb-6"
                keyboardShouldPersistTaps="handled"
            >
                <AdjustmentFormHeader
                    adjustmentForm={adjustmentForm}
                    number={adjustment?.number ?? ''}
                    isSaved={adjustment !== null}
                    accountOptions={account.options}
                    accountTriggerLabel={account.triggerLabel}
                    isDisabled={isWriting}
                    hasFocusOnOpen={AUTO_FOCUS}
                    onBack={leaveGuard.cancel}
                />
                <ConflictNotice
                    isVisible={stale}
                    text={STALE_TEXT}
                    actionLabel="Load the current inventory adjustment"
                    testID="inventory-adjustment-stale"
                    onReload={onLoadCurrent}
                />
                <ReadError
                    isVisible={isAccountsError}
                    message="Could not load the chart of accounts."
                    onRetry={onRetryAccounts}
                    testID="inventory-adjustment-accounts-error"
                />
                <FormErrorSummary
                    errors={summaryErrors}
                    title={null}
                    variant="destructive"
                    showFieldNames={false}
                    testID="inventory-adjustment-error-summary"
                    isEnabled
                />
                <LinesSection
                    adjustmentForm={adjustmentForm}
                    hasBins={hasBins}
                    isPhone={isPhone}
                    isWriting={isWriting}
                    canAdd={shortcuts.offered.includes('addLine')}
                    scopeOwner={scopeOwner}
                />
            </ScrollView>
            <AdjustmentFormBar
                save={save}
                onCancel={leaveGuard.cancel}
                isSavedDraft={isSavedDraft}
                isPhone={isPhone}
                isStale={stale}
                scopeOwner={scopeOwner}
            />
            <DiscardDialog title="Discard changes?" {...leaveGuard.dialog} />
            <AdjustmentDeleteDialog state={save.deleteDialog} />
        </View>
    )
}
