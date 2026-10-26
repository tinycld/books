import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Calendar } from 'lucide-react-native'
import { Pressable, Text } from 'react-native'
import { REPORT_TAP_TARGET } from './ReportHeader'

export function ReportPeriodControl({ label }: { label: string }) {
    const muted = useThemeColor('muted-foreground')
    return (
        <Pressable
            testID="report-period"
            accessibilityRole="button"
            accessibilityLabel={`Report period: ${label}`}
            className="flex-row items-center gap-1.5 rounded-full border border-border bg-secondary px-3"
            style={{ minHeight: REPORT_TAP_TARGET }}
        >
            <Calendar size={14} color={muted} />
            <Text numberOfLines={1} className="text-sm text-secondary-foreground">
                {label}
            </Text>
        </Pressable>
    )
}
