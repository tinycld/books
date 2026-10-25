import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { FormErrorSummary } from '@tinycld/core/ui/form'
import { type FieldErrors, FormProvider, useFormContext, useFormState } from 'react-hook-form'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useAccountOptions } from '../../hooks/useAccountOptions'
import { useEntryForm } from '../../hooks/useEntryForm'
import { type SaveOutcome, useEntrySubmit } from '../../hooks/useEntrySubmit'
import type { EntryFormLine, LineTotals } from '../../lib/entry-lines'
import type { EntryFormValues } from '../../lib/entry-schema'
import { DiscardDialog } from './DiscardDialog'
import { EntryActionBar } from './EntryActionBar'
import { EntryEditableLineCard } from './EntryEditableLineCard'
import { EntryEditableLineTable } from './EntryEditableLineTable'
import { EntryHeaderFields } from './EntryHeaderFields'
import { EntryLeaveContext } from './EntryLeaveContext'
import type { LineActions } from './EntryLineRow'
import { EntryTotals } from './EntryTotals'

interface EntryFormProps {
    initial: EntryFormValues
    currency: string
    // Set when editing a saved draft; `saved` is that draft's rows.
    entryId?: string | null
    saved?: readonly EntryFormLine[]
    replaces?: string
    journalNumber?: string
    header(totals: LineTotals): React.ReactNode
    onSaved(id: string, outcome: SaveOutcome): void
    onCancel(): void
    onBusyChange?(isBusy: boolean): void
}

interface LinesProps {
    isWide: boolean
    lineIds: string[]
    currency: string
    options: { value: string; label: string }[]
    actions: LineActions
}

function Lines({ isWide, lineIds, currency, options, actions }: LinesProps) {
    if (isWide) {
        return (
            <EntryEditableLineTable
                lineIds={lineIds}
                currency={currency}
                options={options}
                actions={actions}
            />
        )
    }
    const cards = lineIds.map((id, index) => (
        <EntryEditableLineCard
            key={id}
            index={index}
            lineCount={lineIds.length}
            currency={currency}
            options={options}
            actions={actions}
        />
    ))
    return <View className="gap-2 px-4">{cards}</View>
}

// Only what belongs to no single field is summarized; field errors sit on their field or
// under their line.
function formLevelMessages(errors: FieldErrors<EntryFormValues>): string[] {
    const refusals = Object.values(errors.root ?? {}).map(value =>
        typeof value === 'object' ? value.message : undefined
    )
    return [errors.lines?.root?.message, ...refusals].filter(
        (message): message is string => typeof message === 'string' && message !== ''
    )
}

function EntryErrorSummary() {
    const { control } = useFormContext<EntryFormValues>()
    const { errors } = useFormState({ control })
    const messages = formLevelMessages(errors)
    const formLevel: FieldErrors = Object.fromEntries(
        messages.map((message, index) => [`entry${index}`, { type: 'server', message }])
    )
    // An empty summary would still take its padding out of the phone header's height.
    if (messages.length === 0) return null
    return (
        <View className="px-4 pt-3">
            <FormErrorSummary
                errors={formLevel}
                isEnabled
                showFieldNames={false}
                title={null}
                variant="destructive"
                testID="entry-error-summary"
            />
        </View>
    )
}

function AddLineButton({ onPress }: { onPress: () => void }) {
    return (
        <Pressable
            testID="entry-add-line"
            accessibilityRole="button"
            onPress={onPress}
            className="mx-4 self-start"
            style={{ minHeight: 44, justifyContent: 'center' }}
        >
            <Text className="text-sm font-medium text-primary">+ Add line</Text>
        </Pressable>
    )
}

export function EntryForm({
    initial,
    currency,
    entryId,
    saved,
    replaces,
    journalNumber,
    header,
    onSaved,
    onCancel,
    onBusyChange,
}: EntryFormProps) {
    const isWide = useBreakpoint() !== 'mobile'
    const entryForm = useEntryForm({ initial, currency })
    const { options } = useAccountOptions()
    const submit = useEntrySubmit({
        entryForm,
        currency,
        entryId,
        saved,
        replaces,
        onSaved,
        onCancel,
        onBusyChange,
    })
    const lineActions: LineActions = {
        onAdd: entryForm.addLine,
        onRemove: entryForm.removeLine,
        onMoveUp: entryForm.moveLineUp,
        onMoveDown: entryForm.moveLineDown,
        register: entryForm.register,
        focus: entryForm.focus,
        submit: entryForm.submit,
    }
    const lineIds = entryForm.fields.map(field => field.key)
    return (
        <FormProvider {...entryForm.form}>
            <EntryLeaveContext.Provider value={submit.cancel}>
                <View testID="entry-screen" className="min-w-0 flex-1 bg-background">
                    {header(entryForm.totals)}
                    <EntryErrorSummary />
                    <ScrollView className="flex-1" contentContainerClassName="gap-4 py-4">
                        <View className="px-4">
                            <EntryHeaderFields isWide={isWide} journalNumber={journalNumber} />
                        </View>
                        <Lines
                            isWide={isWide}
                            lineIds={lineIds}
                            currency={currency}
                            options={options}
                            actions={lineActions}
                        />
                        <AddLineButton onPress={entryForm.addLine} />
                    </ScrollView>
                    <EntryTotals totals={entryForm.totals} currency={currency} />
                    <EntryActionBar
                        isWide={isWide}
                        isPending={submit.isPending}
                        onCancel={submit.cancel}
                        onSaveDraft={submit.saveDraft}
                        onPost={submit.post}
                        onPostAndNew={submit.postAndNew}
                    />
                    <DiscardDialog
                        isVisible={submit.isDiscardOpen}
                        onDiscard={submit.discard}
                        onKeepEditing={submit.keepEditing}
                    />
                </View>
            </EntryLeaveContext.Provider>
        </FormProvider>
    )
}
