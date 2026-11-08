import { Text, View } from 'react-native'
import type { SamplePreviewLine } from '../../../lib/bank-import-view'

const DATE_WIDTH = 104
const AMOUNT_WIDTH = 104

function PreviewLine({ line }: { line: SamplePreviewLine }) {
    if (line.error) {
        const text = `Line ${line.line}: ${line.error}`
        return (
            <View className="py-1.5">
                <Text className="text-sm text-danger">{text}</Text>
            </View>
        )
    }
    return (
        <View className="flex-row items-center gap-3 py-1.5">
            <Text className="text-sm text-foreground" style={{ width: DATE_WIDTH }}>
                {line.dateText}
            </Text>
            <Text className="min-w-0 flex-1 text-sm text-foreground" numberOfLines={1}>
                {line.description}
            </Text>
            <Text
                className="text-right text-sm tabular-nums text-foreground"
                style={{ width: AMOUNT_WIDTH }}
            >
                {line.amountText}
            </Text>
        </View>
    )
}

function PreviewLines({
    lines,
    isComplete,
}: {
    lines: readonly SamplePreviewLine[]
    isComplete: boolean
}) {
    if (!isComplete) {
        return (
            <Text testID="bank-import-preview-prompt" className="text-sm text-muted-foreground">
                Books shows your first rows here once every question above has an answer.
            </Text>
        )
    }
    const items = lines.map(line => <PreviewLine key={line.line} line={line} />)
    return <>{items}</>
}

// The first body rows read with the current answers, so a wrong answer shows at once.
export function MappingPreview({
    preview,
}: {
    preview: { isComplete: boolean; lines: readonly SamplePreviewLine[] }
}) {
    return (
        <View testID="bank-import-preview" className="gap-1 rounded-lg border border-border p-3">
            <Text className="text-base font-semibold text-foreground">
                First rows as Books reads them
            </Text>
            <PreviewLines lines={preview.lines} isComplete={preview.isComplete} />
        </View>
    )
}
