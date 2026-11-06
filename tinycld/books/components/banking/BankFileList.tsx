import type { ReactNode } from 'react'
import { Text, View, type ViewStyle } from 'react-native'
import type { BankFileItem } from '../../hooks/useBankFiles'
import {
    bankFileFormatLabel,
    bankFileStatusLabel,
    fileSizeText,
    uploadedOnText,
    uploadedText,
} from '../../lib/bank-connections'
import { ListHeaderCell } from '../ListTable'

// One style per column, shared by the header and every row so they line up.
const COLUMNS = {
    name: { flex: 3 },
    format: { flex: 1 },
    size: { flex: 1 },
    uploaded: { flex: 3 },
    status: { flex: 2 },
    actions: { width: 96, flexShrink: 0 },
} satisfies Record<string, ViewStyle>

const EMPTY_TEXT = {
    writer: 'No files uploaded yet. Upload the statement you exported from your bank.',
    reader: 'No files uploaded yet.',
}

type RenderAction = (file: BankFileItem) => ReactNode

export function FormatChip({ format }: { format: BankFileItem['format'] }) {
    return (
        <View className="self-start rounded-full border border-border px-2 py-0.5">
            <Text className="text-xs font-medium text-muted-foreground">
                {bankFileFormatLabel(format)}
            </Text>
        </View>
    )
}

export function BankFileRow({
    file,
    renderAction,
}: {
    file: BankFileItem
    renderAction?: RenderAction
}) {
    return (
        <View
            testID={`bank-file-${file.id}`}
            className="flex-row items-center border-b border-border px-2"
            style={{ minHeight: 52 }}
        >
            <View className="min-w-0 pr-3" style={COLUMNS.name}>
                <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                    {file.name}
                </Text>
            </View>
            <View className="min-w-0 pr-3" style={COLUMNS.format}>
                <FormatChip format={file.format} />
            </View>
            <View className="min-w-0 pr-3" style={COLUMNS.size}>
                <Text numberOfLines={1} className="text-right text-sm tabular-nums text-foreground">
                    {fileSizeText(file.size)}
                </Text>
            </View>
            <View className="min-w-0 pr-3" style={COLUMNS.uploaded}>
                <Text numberOfLines={1} className="text-sm text-muted-foreground">
                    {uploadedOnText(file.created, file.uploadedByName)}
                </Text>
            </View>
            <View className="min-w-0 pr-3" style={COLUMNS.status}>
                <Text numberOfLines={1} className="text-sm text-foreground">
                    {bankFileStatusLabel(file.status)}
                </Text>
            </View>
            <View className="items-end" style={COLUMNS.actions}>
                {renderAction?.(file)}
            </View>
        </View>
    )
}

export function BankFileTable({
    files,
    renderAction,
}: {
    files: BankFileItem[]
    renderAction?: RenderAction
}) {
    const rows = files.map(file => (
        <BankFileRow key={file.id} file={file} renderAction={renderAction} />
    ))
    return (
        <View testID="bank-files">
            <View
                className="flex-row items-center border-b border-border px-2"
                style={{ minHeight: 40 }}
            >
                <ListHeaderCell label="Name" style={COLUMNS.name} />
                <ListHeaderCell label="Format" style={COLUMNS.format} />
                <ListHeaderCell label="Size" style={COLUMNS.size} align="right" />
                <ListHeaderCell label="Uploaded" style={COLUMNS.uploaded} />
                <ListHeaderCell label="Status" style={COLUMNS.status} />
                <View style={COLUMNS.actions} />
            </View>
            {rows}
        </View>
    )
}

export function BankFileCard({
    file,
    renderAction,
}: {
    file: BankFileItem
    renderAction?: RenderAction
}) {
    return (
        <View
            testID={`bank-file-${file.id}`}
            className="gap-1 rounded-xl border border-border bg-background p-3"
        >
            <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
                {file.name}
            </Text>
            <View className="flex-row flex-wrap items-center gap-2">
                <FormatChip format={file.format} />
                <Text className="text-xs tabular-nums text-muted-foreground">
                    {fileSizeText(file.size)}
                </Text>
            </View>
            <Text className="text-xs text-muted-foreground">
                {uploadedText(file.created, file.uploadedByName)}
            </Text>
            <View className="flex-row items-center justify-between gap-2 pt-1">
                <Text className="text-sm text-foreground">{bankFileStatusLabel(file.status)}</Text>
                {renderAction?.(file)}
            </View>
        </View>
    )
}

interface BankFileListProps {
    files: BankFileItem[]
    canWrite: boolean
    isWide: boolean
    renderAction?: RenderAction
}

export function BankFileList({ files, canWrite, isWide, renderAction }: BankFileListProps) {
    if (files.length === 0) {
        const text = canWrite ? EMPTY_TEXT.writer : EMPTY_TEXT.reader
        return (
            <Text testID="bank-files-empty" className="text-sm text-muted-foreground">
                {text}
            </Text>
        )
    }
    if (isWide) return <BankFileTable files={files} renderAction={renderAction} />
    const cards = files.map(file => (
        <BankFileCard key={file.id} file={file} renderAction={renderAction} />
    ))
    return (
        <View testID="bank-files" className="gap-3">
            {cards}
        </View>
    )
}
