import { Text, View } from 'react-native'
import type { StatusTone } from '../lib/document-lifecycle'

const BORDER: Record<StatusTone, string> = {
    info: 'border-info',
    success: 'border-success',
    destructive: 'border-destructive',
    muted: 'border-border',
    warning: 'border-warning',
}

const TEXT: Record<StatusTone, string> = {
    info: 'text-info',
    success: 'text-success',
    destructive: 'text-destructive',
    muted: 'text-muted-foreground',
    warning: 'text-warning',
}

interface StatusBadgeProps {
    label: string
    tone: StatusTone
    // On the label, so a test reads the badge's words. Optional: an entry list row's
    // badge carries one only when the row names its entry.
    testID?: string
}

// A status at a glance (spec §7): a rounded-full outline badge in its tone's color.
export function StatusBadge({ label, tone, testID }: StatusBadgeProps) {
    return (
        <View className={`rounded-full border px-2 py-0.5 ${BORDER[tone]}`}>
            <Text testID={testID} className={`text-xs ${TEXT[tone]}`}>
                {label}
            </Text>
        </View>
    )
}
