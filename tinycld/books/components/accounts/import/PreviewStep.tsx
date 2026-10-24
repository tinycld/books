import { Button, ButtonText, ServerActionButton } from '@tinycld/core/ui/button'
import { memo } from 'react'
import { type AccessibilityRole, ScrollView, Text, View } from 'react-native'
import type { useAccountImport } from '../../../hooks/useAccountImport'
import { useRowWindow } from '../../../hooks/useRowWindow'
import type { ImportRow } from '../../../lib/account-import'
import { accountTypeDef } from '../../../lib/account-types'

type Flow = ReturnType<typeof useAccountImport>

interface PreviewStepProps {
    isWide: boolean
    isRunning: boolean
    preview: ImportRow[]
    readyCount: number
    progress: Flow['progress']
    failure: Flow['failure']
    onBack: () => void
    onRun: () => void
}

// React Native's types omit "listitem", but react-native-web and screen readers accept it.
const LIST_ITEM = 'listitem' as AccessibilityRole
const ROW_HEIGHT = 64
const LIST_HEIGHT = 480

function statusText(row: ImportRow) {
    if (row.status === 'ready') return 'Ready'
    if (row.status === 'skipped') return `Skipped: ${row.reason}`
    return `Error: ${row.reason}`
}

function statusTone(status: ImportRow['status']) {
    if (status === 'error') return 'text-danger'
    if (status === 'skipped') return 'text-muted-foreground'
    return 'text-foreground'
}

function typeLabel(type: string) {
    return accountTypeDef(type)?.label ?? type
}

interface CellProps {
    isVisible: boolean
    width: string
    children: string
}

function Cell({ isVisible, width, children }: CellProps) {
    if (!isVisible) return null
    return (
        <Text className={`px-2 text-sm text-foreground ${width}`} numberOfLines={1}>
            {children}
        </Text>
    )
}

interface PreviewRowProps {
    row: ImportRow
    isWide: boolean
    position: number
    total: number
}

// Memoized: scrolling re-renders the list, but the rows in view keep the same props.
const PreviewRow = memo(function PreviewRow({ row, isWide, position, total }: PreviewRowProps) {
    const parent = row.parentPath === '' ? '—' : row.parentPath
    const number = row.number === '' ? 'no number' : row.number
    const detail = `Row ${row.line} · ${number} · ${typeLabel(row.type)} · ${parent}`
    return (
        <View
            testID={`account-import-row-${row.line}`}
            accessibilityRole={LIST_ITEM}
            aria-posinset={position}
            aria-setsize={total}
            className="flex-row items-center gap-2 border-t border-border"
            style={{ height: ROW_HEIGHT }}
        >
            <Text className={`w-44 px-2 text-sm ${statusTone(row.status)}`} numberOfLines={2}>
                {statusText(row)}
            </Text>
            <View className="min-w-0 flex-1 px-2">
                <Text className="text-sm text-foreground" numberOfLines={1}>
                    {row.name}
                </Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                    {detail}
                </Text>
            </View>
            <Cell isVisible={isWide} width="w-28">
                {typeLabel(row.type)}
            </Cell>
            <Cell isVisible={isWide} width="w-48">
                {parent}
            </Cell>
        </View>
    )
})

function Summary({ preview, readyCount }: Pick<PreviewStepProps, 'preview' | 'readyCount'>) {
    const skipped = preview.filter(row => row.status === 'skipped').length
    const errors = preview.filter(row => row.status === 'error').length
    return (
        <Text className="text-sm text-foreground">
            {`${readyCount} to import, ${skipped} skipped, ${errors} with errors. Rows with errors are not imported.`}
        </Text>
    )
}

function FailureText({ failure }: { failure: Flow['failure'] }) {
    if (!failure) return null
    // Line 0 means the run broke before it reached a row.
    const where = failure.line === 0 ? '' : ` at Row ${failure.line}, ${failure.name}`
    return (
        <Text className="text-sm text-danger">{`The import stopped${where}: ${failure.message}`}</Text>
    )
}

function ProgressText({ progress }: { progress: Flow['progress'] }) {
    if (!progress) return null
    return (
        <Text className="text-sm font-medium text-foreground">
            {`${progress.done} of ${progress.total} imported`}
        </Text>
    )
}

// The failure shows even when the run broke before any progress was recorded.
function ImportProgress({ progress, failure }: Pick<PreviewStepProps, 'progress' | 'failure'>) {
    if (!progress && !failure) return null
    return (
        <View accessibilityRole={failure ? 'alert' : undefined} className="gap-1">
            <ProgressText progress={progress} />
            <FailureText failure={failure} />
        </View>
    )
}

function importLabel(readyCount: number) {
    if (readyCount === 0) return 'Import'
    return readyCount === 1 ? 'Import 1 account' : `Import ${readyCount} accounts`
}

function PreviewList({ preview, isWide }: Pick<PreviewStepProps, 'preview' | 'isWide'>) {
    const total = preview.length
    const visible = useRowWindow({ total, rowHeight: ROW_HEIGHT, viewHeight: LIST_HEIGHT })
    const rows = preview
        .slice(visible.first, visible.last)
        .map((row, i) => (
            <PreviewRow
                key={row.line}
                row={row}
                isWide={isWide}
                position={visible.first + i + 1}
                total={total}
            />
        ))
    return (
        <ScrollView
            className="rounded-lg border border-border"
            style={{ height: LIST_HEIGHT }}
            accessibilityRole="list"
            accessibilityLabel={`${total} rows`}
            nestedScrollEnabled
            scrollEventThrottle={16}
            onScroll={visible.onScroll}
        >
            <View style={{ height: visible.topSpace }} />
            {rows}
            <View style={{ height: visible.bottomSpace }} />
        </ScrollView>
    )
}

export function PreviewStep({
    isWide,
    isRunning,
    preview,
    readyCount,
    progress,
    failure,
    onBack,
    onRun,
}: PreviewStepProps) {
    return (
        <View className="gap-3">
            <Summary preview={preview} readyCount={readyCount} />
            <ImportProgress progress={progress} failure={failure} />
            <PreviewList preview={preview} isWide={isWide} />
            <View className="flex-row justify-end gap-2">
                <Button
                    variant="outline"
                    className="min-h-11"
                    isDisabled={isRunning}
                    onPress={onBack}
                >
                    <ButtonText>Back</ButtonText>
                </Button>
                <ServerActionButton
                    testID="account-import-run"
                    className="min-h-11"
                    isDisabled={readyCount === 0 || isRunning}
                    onPress={onRun}
                >
                    <ButtonText>{importLabel(readyCount)}</ButtonText>
                </ServerActionButton>
            </View>
        </View>
    )
}
