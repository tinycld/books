import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { TextAreaInput } from '@tinycld/core/ui/form'
import { FormProvider } from 'react-hook-form'
import { ScrollView, View } from 'react-native'
import type { SaveOutcome } from '../../hooks/useEntrySubmit'
import type { useTransferAccounts } from '../../hooks/useTransferAccounts'
import { useTransferForm } from '../../hooks/useTransferForm'
import { useTransferSubmit } from '../../hooks/useTransferSubmit'
import type { TransferFormValues, TransferLineIds } from '../../lib/transfer'
import { DiscardDialog } from '../entries/DiscardDialog'
import { EntryActionBar } from '../entries/EntryActionBar'
import { EntryLeaveContext } from '../entries/EntryLeaveContext'
import { TransferBand } from './TransferBand'
import { TransferErrorSummary } from './TransferErrorSummary'
import { TransferHeader } from './TransferHeader'

interface TransferFormProps {
    initial: TransferFormValues
    currency: string
    accounts: ReturnType<typeof useTransferAccounts>
    // A saved draft and its two line ids; a new transfer has neither.
    entryId?: string | null
    savedIds?: TransferLineIds
    // The posted transfer this form corrects, and its number for the header.
    replaces?: string
    replacesNumber?: string
    title: string
    // A draft screen hides its form under the read view while a post is unconfirmed; the
    // hidden form then draws no header, so the read view's is the only one on the page.
    isHeaderVisible?: boolean
    onSaved(id: string, outcome: SaveOutcome): void
    onCancel(): void
    // A saved draft's delete, offered in the action bar's More menu.
    onDeleteDraft?: () => void
}

const MEMO_WIDE = { style: { maxWidth: 560 } }

function FormHeader({
    isVisible,
    ...header
}: { isVisible: boolean } & Parameters<typeof TransferHeader>[0]) {
    if (!isVisible) return null
    return <TransferHeader {...header} />
}

export function TransferForm({
    initial,
    currency,
    accounts,
    entryId,
    savedIds,
    replaces,
    replacesNumber,
    title,
    isHeaderVisible = true,
    onSaved,
    onCancel,
    onDeleteDraft,
}: TransferFormProps) {
    const isWide = useBreakpoint() !== 'mobile'
    const transferForm = useTransferForm({ initial, currency })
    const submit = useTransferSubmit({
        transferForm,
        currency,
        entryId,
        savedIds,
        replaces,
        onSaved,
        onCancel,
    })
    const { form, values, amountText } = transferForm
    return (
        <FormProvider {...form}>
            <EntryLeaveContext.Provider value={submit.cancel}>
                <View testID="transfer-form" className="min-w-0 flex-1 bg-background">
                    <FormHeader
                        isVisible={isHeaderVisible}
                        title={title}
                        status="draft"
                        amountText={amountText}
                        replacesNumber={replacesNumber}
                    />
                    <TransferErrorSummary />
                    <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
                        <TransferBand
                            isWide={isWide}
                            accounts={accounts}
                            values={values}
                            currency={currency}
                        />
                        <TextAreaInput
                            name="memo"
                            control={form.control}
                            label="Memo"
                            testID="transfer-memo"
                            wrapperProps={isWide ? MEMO_WIDE : undefined}
                        />
                    </ScrollView>
                    <EntryActionBar
                        testIDPrefix="transfer"
                        isWide={isWide}
                        isPending={submit.isPending}
                        onCancel={submit.cancel}
                        onSaveDraft={submit.saveDraft}
                        onPost={submit.post}
                        onPostAndNew={submit.postAndNew}
                        onDeleteDraft={onDeleteDraft}
                    />
                    <DiscardDialog
                        title="Discard changes?"
                        isVisible={submit.isDiscardOpen}
                        onDiscard={submit.discard}
                        onKeepEditing={submit.keepEditing}
                    />
                </View>
            </EntryLeaveContext.Provider>
        </FormProvider>
    )
}
