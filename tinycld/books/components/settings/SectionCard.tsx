import type { ReactNode } from 'react'
import { Text, View } from 'react-native'

interface SectionCardProps {
    title?: string
    children: ReactNode
}

function CardTitle({ title }: { title: string | undefined }) {
    if (!title) return null
    return <Text className="mb-3 text-sm font-semibold text-foreground">{title}</Text>
}

export function SectionCard({ title, children }: SectionCardProps) {
    return (
        <View className="rounded-xl border border-border bg-surface-secondary p-4">
            <CardTitle title={title} />
            {children}
        </View>
    )
}

interface ReadOnlyRowProps {
    label: string
    value: string
    multiline?: boolean
    testID?: string
}

export function ReadOnlyRow({ label, value, multiline, testID }: ReadOnlyRowProps) {
    return (
        <View className="flex-row justify-between gap-4 border-b border-border py-3">
            <Text className="text-sm text-muted-foreground">{label}</Text>
            <Text
                testID={testID}
                numberOfLines={multiline ? undefined : 1}
                className="flex-1 text-right text-sm text-foreground"
            >
                {value || '—'}
            </Text>
        </View>
    )
}

export function FieldNote({ text }: { text: string }) {
    return <Text className="text-xs text-muted-foreground">{text}</Text>
}
