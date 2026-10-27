import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { X } from 'lucide-react-native'
import type { Ref } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { FilterSpec } from '../../lib/report-definition'
import { REPORT_TAP_TARGET } from './ReportHeader'

interface ReportFilterChipProps {
    spec: FilterSpec
    value: string
    onPress: () => void
    onRemove: () => void
    // Set by the picker's Popover, which clones its trigger with an anchor ref.
    ref?: Ref<View>
}

// The 44pt targets reach over the chip's 1px top and bottom border, so the chip is 44 tall
// like the period chip and the row keeps one top.
const TARGET_STYLE = { minHeight: REPORT_TAP_TARGET, marginVertical: -1 }
const REMOVE_STYLE = { ...TARGET_STYLE, minWidth: REPORT_TAP_TARGET }

// The label opens the filter's picker; the remove control is its own 44pt target and
// removes the filter at once.
export function ReportFilterChip({ spec, value, onPress, onRemove, ref }: ReportFilterChipProps) {
    const muted = useThemeColor('muted-foreground')
    return (
        <View
            ref={ref}
            testID={`report-filter-chip-${spec.id}`}
            className="flex-row items-center rounded-full border border-border bg-secondary pl-3"
            style={{ minHeight: REPORT_TAP_TARGET }}
        >
            <Pressable
                accessibilityRole="button"
                onPress={onPress}
                className="justify-center"
                style={TARGET_STYLE}
            >
                <Text numberOfLines={1} className="text-sm text-secondary-foreground">
                    {`${spec.label}: ${value}`}
                </Text>
            </Pressable>
            <Pressable
                testID={`report-filter-remove-${spec.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${spec.label} filter`}
                onPress={onRemove}
                className="items-center justify-center"
                style={REMOVE_STYLE}
            >
                <X size={14} color={muted} />
            </Pressable>
        </View>
    )
}
