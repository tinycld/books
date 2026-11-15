import { getFileIconForMime } from '@tinycld/core/file-viewer/file-icons'
import { downloadFile } from '@tinycld/core/file-viewer/file-url'
import { PreviewModal } from '@tinycld/core/file-viewer/PreviewModal'
import { Thumbnail } from '@tinycld/core/file-viewer/Thumbnail'
import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { type ReactNode, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { DocumentAttachmentRow, DocumentAttachments } from '../../hooks/useDocumentAttachments'
import {
    ATTACHMENT_LIMIT_TEXT,
    ATTACHMENTS_FAILED_TEXT,
    attachmentControls,
    attachmentDetailText,
    attachmentPreviewSource,
    attachmentsHeading,
    hasThumbnail,
    movedText,
    NO_ATTACHMENTS_TEXT,
} from '../../lib/attachments'
import type { SalesDocumentKind } from '../../lib/sales-document-kinds'

const ROW_STYLE = { minHeight: 44 }
const BOX_STYLE = { width: 40, height: 40 }
const RETRY_STYLE = { minHeight: 36 }

// The 40 px tile every row's mark sits in. The edge keeps a thumbnail of a white
// page visible on a white screen, and keeps it from glaring on a dark one.
function MarkTile({ children }: { children: ReactNode }) {
    return (
        <View
            className="shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surface-secondary"
            style={BOX_STYLE}
        >
            {children}
        </View>
    )
}

// The mark of a row: core Thumbnail for a row with a generated thumbnail or an
// image PocketBase thumbnails, else the type's icon, both in the same tile. The
// realtime update that stores a generated thumbnail redraws the row.
function FileMark({ row }: { row: DocumentAttachmentRow }) {
    const muted = useThemeColor('muted-foreground')
    const source = attachmentPreviewSource(row)
    if (hasThumbnail(source)) {
        return (
            <MarkTile>
                <Thumbnail source={source} size={40} />
            </MarkTile>
        )
    }
    const { icon: Icon, color } = getFileIconForMime(source.mimeType, muted)
    return (
        <MarkTile>
            <Icon size={20} color={color} />
        </MarkTile>
    )
}

interface AttachmentRowProps {
    row: DocumentAttachmentRow
    onOpen: () => void
    // The trailing Remove (checkpoint 3); a row without it has none.
    onRemove?: () => void
    testId: string
}

// A stored file: a button that opens it, named by the file.
export function AttachmentRow({ row, onOpen, testId }: AttachmentRowProps) {
    const detail = attachmentDetailText(row)
    return (
        <View className="flex-row items-center gap-2 border-t border-border" style={ROW_STYLE}>
            <Pressable
                testID={testId}
                accessibilityRole="button"
                accessibilityLabel={row.name}
                onPress={onOpen}
                className="min-w-0 flex-1 flex-row items-center gap-3 py-1.5"
            >
                <FileMark row={row} />
                <View className="min-w-0 flex-1 gap-0.5">
                    <Text numberOfLines={1} className="text-sm text-foreground">
                        {row.name}
                    </Text>
                    <Text className="text-sm text-muted-foreground">{detail}</Text>
                </View>
            </Pressable>
        </View>
    )
}

interface AttachmentsPreviewProps {
    // The rows in screen order: a correction's From group, then the document's own.
    rows: readonly DocumentAttachmentRow[]
    // The open row's place in `rows`; null while closed.
    index: number | null
    onIndex: (index: number) => void
    onClose: () => void
}

// Core PreviewModal over the list; Previous and Next only where there is a row to move
// to. A row that goes away while it is open closes the preview.
export function AttachmentsPreview({ rows, index, onIndex, onClose }: AttachmentsPreviewProps) {
    const row = index === null ? undefined : rows[index]
    const source = row ? attachmentPreviewSource(row) : null
    const hasPrevious = index !== null && index > 0
    const hasNext = index !== null && index < rows.length - 1
    const onPrevious = hasPrevious ? () => onIndex(index - 1) : undefined
    const onNext = hasNext ? () => onIndex(index + 1) : undefined
    const onDownload = source ? () => downloadFile(source) : undefined
    return (
        <PreviewModal
            isVisible={source !== null}
            source={source}
            onClose={onClose}
            onPrevious={onPrevious}
            onNext={onNext}
            onDownload={onDownload}
        />
    )
}

function SkeletonRow({ isVisible, testID }: { isVisible: boolean; testID: string }) {
    if (!isVisible) return null
    return (
        <View testID={testID} className="flex-row items-center gap-3" style={ROW_STYLE}>
            <View className="rounded bg-surface-secondary" style={BOX_STYLE} />
            <View className="flex-1 gap-1.5">
                <View className="h-3 w-2/3 rounded bg-surface-secondary" />
                <View className="h-3 w-1/3 rounded bg-surface-secondary" />
            </View>
        </View>
    )
}

interface LoadErrorProps {
    isVisible: boolean
    prefix: string
    onRetry: () => void
}

function LoadError({ isVisible, prefix, onRetry }: LoadErrorProps) {
    if (!isVisible) return null
    return (
        <View
            testID={`${prefix}-attachments-error`}
            className="flex-row flex-wrap items-center gap-3"
        >
            <Text accessibilityRole="alert" className="text-sm text-danger">
                {ATTACHMENTS_FAILED_TEXT}
            </Text>
            <Button
                testID={`${prefix}-attachments-retry`}
                variant="outline"
                size="sm"
                style={RETRY_STYLE}
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

function MutedLine({ text, testID }: { text: string; testID?: string }) {
    if (text === '') return null
    return (
        <Text testID={testID} className="text-sm text-muted-foreground">
            {text}
        </Text>
    )
}

function RowList({ rows, testID }: { rows: ReactNode[]; testID: string }) {
    if (rows.length === 0) return null
    return <View testID={testID}>{rows}</View>
}

interface AttachmentsSectionProps {
    kind: Pick<SalesDocumentKind, 'testId' | 'noun' | 'shortcutGroup' | 'features'>
    attachments: DocumentAttachments
    recordId: string | undefined
    isVoid: boolean
    // The number of the correction that replaced this document (it keeps the number);
    // '' when nothing replaced it.
    replacedByNumber: string
    canWrite: boolean
    // Writes are unavailable (checkpoint 3 disables add and Remove with it).
    isDisabled: boolean
    mode: 'read' | 'form'
    // The screen's shortcut scope, for Attach files (checkpoint 3).
    scopeOwner: ScopeOwner
    // The screen's one Retry over its merged recoveries.
    onRetry: () => void
}

/**
 * The Attachments section of a bill or an expense (spec §3.3): the heading with the
 * count, and the limit where a file can be added; one skeleton row while the rows load; the error
 * with Retry when they fail; the list, each row opening core PreviewModal; "No
 * attachments" when there are none and no add area shows; and, on a replaced original,
 * "Moved to <number> (edited)" instead.
 */
export function AttachmentsSection({
    kind,
    attachments,
    isVoid,
    replacedByNumber,
    canWrite,
    isDisabled,
    mode,
    onRetry,
}: AttachmentsSectionProps) {
    const [openIndex, setOpenIndex] = useState<number | null>(null)
    const prefix = kind.testId
    const { rows, isLoading, isError } = attachments
    // Only a correction's form lists the original's files (checkpoint 4); a read view
    // shows the document's own.
    const fromRows = mode === 'form' ? attachments.fromRows : []
    const controls = attachmentControls({ canWrite, isVoid, isDisabled, isLoading })
    const isReady = !isLoading && !isError
    const previewRows = [...fromRows, ...rows]
    const closePreview = () => setOpenIndex(null)
    const listRows = isReady
        ? rows.map((row, place) => (
              <AttachmentRow
                  key={row.id}
                  row={row}
                  testId={`${prefix}-attachment-${row.id}`}
                  onOpen={() => setOpenIndex(fromRows.length + place)}
              />
          ))
        : []
    const heading = attachmentsHeading(rows.length)
    const isEmpty = isReady && rows.length === 0
    const moved = isEmpty && replacedByNumber !== '' ? movedText(replacedByNumber) : ''
    const empty = isEmpty && moved === '' && !controls.showsAdd ? NO_ATTACHMENTS_TEXT : ''
    // The limit shows only where a file can be added: a writer on a document that is not
    // void (a replaced original is void).
    const limit = controls.showsAdd ? ATTACHMENT_LIMIT_TEXT : ''
    return (
        <View testID={`${prefix}-attachments`} className="gap-2">
            <View className="flex-row flex-wrap items-baseline gap-x-2">
                <Text
                    testID={`${prefix}-attachments-heading`}
                    className="text-sm font-semibold text-foreground"
                >
                    {heading}
                </Text>
                <MutedLine text={limit} />
            </View>
            <SkeletonRow isVisible={isLoading} testID={`${prefix}-attachments-loading`} />
            <LoadError isVisible={isError} prefix={prefix} onRetry={onRetry} />
            <RowList rows={listRows} testID={`${prefix}-attachments-list`} />
            <MutedLine text={moved} testID={`${prefix}-attachments-moved`} />
            <MutedLine text={empty} testID={`${prefix}-attachments-empty`} />
            <AttachmentsPreview
                rows={previewRows}
                index={openIndex}
                onIndex={setOpenIndex}
                onClose={closePreview}
            />
        </View>
    )
}
