import { TextAreaInput, TextInput } from '@tinycld/core/ui/form'
import { useFormContext } from 'react-hook-form'
import { Text, View } from 'react-native'
import { useClearStaleErrors } from '../../hooks/useClearStaleErrors'
import type { EntryFormValues } from '../../lib/entry-schema'

function Cell({ isWide, children }: { isWide: boolean; children: React.ReactNode }) {
    return <View className={isWide ? 'min-w-0 flex-1' : ''}>{children}</View>
}

export function EntryHeaderFields({
    isWide,
    journalNumber,
}: {
    isWide: boolean
    // Set when editing a posted entry: the replacement keeps the original's number.
    journalNumber?: string
}) {
    const { control } = useFormContext<EntryFormValues>()
    const { onEdit } = useClearStaleErrors()
    return (
        <View>
            <View className={isWide ? 'flex-row gap-3' : ''}>
                <Cell isWide={isWide}>
                    <TextInput
                        name="date"
                        control={control}
                        label="Date"
                        hint="YYYY-MM-DD"
                        testID="entry-date"
                        onValueChange={onEdit}
                    />
                </Cell>
                <Cell isWide={isWide}>
                    <View className="gap-1 pb-3">
                        <Text className="text-sm font-semibold text-foreground">Journal no.</Text>
                        <View
                            className="justify-center rounded-md border border-border bg-surface-secondary px-3"
                            style={{ minHeight: 44 }}
                        >
                            <Text testID="entry-number" className="text-sm text-muted-foreground">
                                {journalNumber || 'Assigned when posted'}
                            </Text>
                        </View>
                    </View>
                </Cell>
                <Cell isWide={isWide}>
                    <TextInput
                        name="autoReverseOn"
                        control={control}
                        label="Auto-reverse on"
                        hint="Posts a reversing entry on this date"
                        testID="entry-auto-reverse"
                        onValueChange={onEdit}
                    />
                </Cell>
            </View>
            <TextAreaInput
                name="memo"
                control={control}
                label="Memo"
                testID="entry-memo"
                onChange={onEdit}
            />
        </View>
    )
}
