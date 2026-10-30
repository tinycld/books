import { EmptyState } from '@tinycld/core/components/EmptyState'
import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { ChevronRight } from 'lucide-react-native'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useReportsHub } from '../../hooks/useReportsHub'
import { useFabClearanceStyle } from '../../lib/fab-clearance'
import type { HubSection, ReportEntry } from '../../lib/report-registry'

const ROW_MIN_HEIGHT = 44

interface HubRowProps {
    entry: ReportEntry
    isLast: boolean
    onOpen: (entry: ReportEntry) => void
}

function HubRow({ entry, isLast, onOpen }: HubRowProps) {
    const muted = useThemeColor('muted-foreground')
    // The box draws its own bottom border, so the last row leaves its divider off.
    const divider = isLast ? '' : 'border-b border-border'
    return (
        <Pressable
            testID={`report-hub-row-${entry.id}`}
            accessibilityRole="link"
            onPress={() => onOpen(entry)}
            className={`flex-row items-center gap-3 px-4 py-2 ${divider}`}
            style={{ minHeight: ROW_MIN_HEIGHT }}
        >
            <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-sm font-medium text-foreground">{entry.title}</Text>
                <Text numberOfLines={2} className="text-xs text-muted-foreground">
                    {entry.description}
                </Text>
            </View>
            <ChevronRight size={16} color={muted} />
        </Pressable>
    )
}

interface HubSectionBlockProps {
    section: HubSection
    onOpen: (entry: ReportEntry) => void
}

function HubSectionBlock({ section, onOpen }: HubSectionBlockProps) {
    const lastIndex = section.entries.length - 1
    const rows = section.entries.map((entry, index) => (
        <HubRow key={entry.id} entry={entry} isLast={index === lastIndex} onOpen={onOpen} />
    ))
    return (
        <View testID={`report-hub-section-${section.id}`} className="gap-2">
            <Text className="px-1 text-xs font-semibold uppercase text-muted-foreground">
                {section.title}
            </Text>
            <View className="overflow-hidden rounded-lg border border-border bg-card">{rows}</View>
        </View>
    )
}

function HubLoading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="report-hub-loading">
            <LoadingState />
        </View>
    )
}

function HubError({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View
            testID="report-hub-error"
            accessibilityRole="alert"
            className="items-center gap-3 p-6"
        >
            <Text className="text-base font-medium text-foreground">Could not load reports</Text>
            <Button
                testID="report-hub-retry"
                variant="outline"
                style={{ minHeight: ROW_MIN_HEIGHT }}
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function HubEmpty({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="report-hub-empty" className="items-center gap-1">
            <EmptyState message="No reports yet" />
            <Text className="text-sm text-muted-foreground">
                Reports appear here as Books features are added.
            </Text>
        </View>
    )
}

export function ReportsHubView() {
    const { state, sections, isEmpty, onOpen, onRetry } = useReportsHub()
    const fabClearanceStyle = useFabClearanceStyle()
    const blocks = sections.map(section => (
        <HubSectionBlock key={section.id} section={section} onOpen={onOpen} />
    ))

    return (
        <ScrollView
            testID="report-hub"
            className="flex-1 bg-background"
            contentContainerStyle={fabClearanceStyle}
        >
            <View className="w-full gap-6 p-6">
                <Text className="text-2xl font-semibold text-foreground">Reports</Text>
                <HubLoading isVisible={state === 'loading'} />
                <HubError isVisible={state === 'error'} onRetry={onRetry} />
                {blocks}
                <HubEmpty isVisible={isEmpty} />
            </View>
        </ScrollView>
    )
}
