import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { FormProvider } from 'react-hook-form'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useAccountOptions } from '../../hooks/useAccountOptions'
import { useEntryForm } from '../../hooks/useEntryForm'
import type { LineTotals } from '../../lib/entry-lines'
import type { EntryFormValues } from '../../lib/entry-schema'
import { EntryEditableLineCard } from './EntryEditableLineCard'
import { EntryEditableLineTable } from './EntryEditableLineTable'
import { EntryHeaderFields } from './EntryHeaderFields'
import type { LineActions } from './EntryLineRow'
import { EntryTotals } from './EntryTotals'

interface EntryFormProps {
    initial: EntryFormValues
    currency: string
    header(totals: LineTotals): React.ReactNode
    actions?: React.ReactNode
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

export function EntryForm({ initial, currency, header, actions }: EntryFormProps) {
    const isWide = useBreakpoint() !== 'mobile'
    const entryForm = useEntryForm({ initial, currency })
    const { options } = useAccountOptions()
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
            <View testID="entry-screen" className="min-w-0 flex-1 bg-background">
                {header(entryForm.totals)}
                <ScrollView className="flex-1" contentContainerClassName="gap-4 py-4">
                    <View className="px-4">
                        <EntryHeaderFields isWide={isWide} />
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
                {actions}
            </View>
        </FormProvider>
    )
}
