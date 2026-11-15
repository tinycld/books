import { DropZone } from '@tinycld/core/components/DropZone'
import { getFileIconForMime } from '@tinycld/core/file-viewer/file-icons'
import { downloadFile } from '@tinycld/core/file-viewer/file-url'
import { PreviewModal } from '@tinycld/core/file-viewer/PreviewModal'
import { uploadFileToPickedFile } from '@tinycld/core/file-viewer/picked-file'
import { Thumbnail } from '@tinycld/core/file-viewer/Thumbnail'
import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { ConfirmDialog } from '@tinycld/core/ui/ConfirmDialog'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { Paperclip, X } from 'lucide-react-native'
import { type ReactNode, useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import {
    type AttachmentRemove,
    useAttachmentRemove,
    useAttachmentUpload,
} from '../../hooks/useAttachmentUpload'
import type { DocumentAttachmentRow, DocumentAttachments } from '../../hooks/useDocumentAttachments'
import {
    ATTACHMENT_LIMIT_TEXT,
    ATTACHMENTS_FAILED_TEXT,
    attachmentControls,
    attachmentDetailText,
    attachmentPreviewSource,
    attachmentsHeading,
    DROP_OVERLAY,
    DROP_PROMPT_NATIVE,
    DROP_PROMPT_WEB,
    hasThumbnail,
    movedText,
    NO_ATTACHMENTS_TEXT,
    pendingDetailText,
    removeMessage,
    uploadingText,
} from '../../lib/attachments'
import type { SalesDocumentKind } from '../../lib/sales-document-kinds'
import {
    type AttachmentDraft,
    readSessionKey,
    useAttachmentsStore,
} from '../../stores/attachments-store'

const ROW_STYLE = { minHeight: 44 }
const BOX_STYLE = { width: 40, height: 40 }
const RETRY_STYLE = { minHeight: 36 }
const ICON_BUTTON_STYLE = { minWidth: 44, minHeight: 44 }
const NO_DRAFTS: AttachmentDraft[] = []
const NO_ACTION = () => {}
const DROP_PROMPT = Platform.OS === 'web' ? DROP_PROMPT_WEB : DROP_PROMPT_NATIVE

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

function TypeMark({ mimeType }: { mimeType: string }) {
    const muted = useThemeColor('muted-foreground')
    const { icon: Icon, color } = getFileIconForMime(mimeType, muted)
    return (
        <MarkTile>
            <Icon size={20} color={color} />
        </MarkTile>
    )
}

// The mark of a row: core Thumbnail for a row with a generated thumbnail or an
// image PocketBase thumbnails, else the type's icon, both in the same tile. The
// realtime update that stores a generated thumbnail redraws the row.
function FileMark({ row }: { row: DocumentAttachmentRow }) {
    const source = attachmentPreviewSource(row)
    if (!hasThumbnail(source)) return <TypeMark mimeType={source.mimeType} />
    return (
        <MarkTile>
            <Thumbnail source={source} size={40} />
        </MarkTile>
    )
}

interface RemoveButtonProps {
    name: string
    isVisible: boolean
    isDisabled: boolean
    onPress: () => void
    testID: string
}

// A row's trailing Remove (Lucide X), named by the file. Disabled, it is drawn at core
// Button's disabled opacity, so it does not look the same as a Remove that works.
function RemoveButton({ name, isVisible, isDisabled, onPress, testID }: RemoveButtonProps) {
    const muted = useThemeColor('muted-foreground')
    if (!isVisible) return null
    const className = isDisabled
        ? 'items-center justify-center rounded-md opacity-40'
        : 'items-center justify-center rounded-md'
    return (
        <Pressable
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${name}`}
            disabled={isDisabled}
            onPress={onPress}
            className={className}
            style={ICON_BUTTON_STYLE}
        >
            <X size={16} color={muted} />
        </Pressable>
    )
}

// The second line of a row: muted, or the row's error in the danger color.
function RowDetail({ text, isError }: { text: string; isError: boolean }) {
    const className = isError ? 'text-sm text-danger' : 'text-sm text-muted-foreground'
    return <Text className={className}>{text}</Text>
}

interface AttachmentRowProps {
    row: DocumentAttachmentRow
    onOpen: () => void
    // The trailing Remove; a row without it has none (a reader, a void document, a
    // correction's From group).
    onRemove?: () => void
    isRemoveDisabled?: boolean
    // The server's refusal of this row's delete; '' when there is none.
    refusal?: string
    testId: string
    removeTestId?: string
}

// A stored file: a button that opens it, named by the file, and a writer's Remove.
export function AttachmentRow({
    row,
    onOpen,
    onRemove,
    isRemoveDisabled = false,
    refusal = '',
    testId,
    removeTestId = '',
}: AttachmentRowProps) {
    const isRefused = refusal !== ''
    const detail = isRefused ? refusal : attachmentDetailText(row)
    const remove = onRemove ?? NO_ACTION
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
                    <RowDetail text={detail} isError={isRefused} />
                </View>
            </Pressable>
            <RemoveButton
                name={row.name}
                isVisible={onRemove !== undefined}
                isDisabled={isRemoveDisabled}
                onPress={remove}
                testID={removeTestId}
            />
        </View>
    )
}

function ProgressBar({ percent }: { percent: number | null }) {
    if (percent === null) return null
    const fill = { width: `${percent}%` as const }
    return (
        <View className="h-1 overflow-hidden rounded-full bg-border">
            <View className="h-1 rounded-full bg-primary" style={fill} />
        </View>
    )
}

interface RetryButtonProps {
    isVisible: boolean
    isDisabled: boolean
    onPress: () => void
    testID: string
}

function RetryButton({ isVisible, isDisabled, onPress, testID }: RetryButtonProps) {
    if (!isVisible) return null
    return (
        <Button
            testID={testID}
            variant="outline"
            size="sm"
            style={RETRY_STYLE}
            isDisabled={isDisabled}
            onPress={onPress}
        >
            <ButtonText>Retry</ButtonText>
        </Button>
    )
}

function draftDetail(draft: AttachmentDraft): string {
    if (draft.state.kind === 'uploading') return uploadingText(draft.state.percent)
    if (draft.state.kind === 'failed') return draft.state.message
    return pendingDetailText(draft.size)
}

interface DraftRowProps {
    draft: AttachmentDraft
    prefix: string
    // Writes are unavailable: Retry and Remove are disabled.
    isDisabled: boolean
    onRetry: () => void
    onRemove: () => void
}

// A file that is not stored: uploading with its progress, or failed with its error,
// Retry and Remove. It does not open, so it is not a button.
function DraftRow({ draft, prefix, isDisabled, onRetry, onRemove }: DraftRowProps) {
    const { state } = draft
    const isFailed = state.kind === 'failed'
    const isUploading = state.kind === 'uploading'
    const percent = state.kind === 'uploading' ? state.percent : null
    return (
        <View className="flex-row items-center gap-2 border-t border-border" style={ROW_STYLE}>
            <View
                testID={`${prefix}-attachment-pending-${draft.key}`}
                accessibilityLabel={draft.name}
                className="min-w-0 flex-1 flex-row items-center gap-3 py-1.5"
            >
                <TypeMark mimeType={draft.mimeType} />
                <View className="min-w-0 flex-1 gap-0.5">
                    <Text numberOfLines={1} className="text-sm text-foreground">
                        {draft.name}
                    </Text>
                    <RowDetail text={draftDetail(draft)} isError={isFailed} />
                    <ProgressBar percent={percent} />
                </View>
            </View>
            <RetryButton
                isVisible={isFailed}
                isDisabled={isDisabled}
                onPress={onRetry}
                testID={`${prefix}-attachment-retry-${draft.key}`}
            />
            <RemoveButton
                name={draft.name}
                isVisible={!isUploading}
                isDisabled={isDisabled}
                onPress={onRemove}
                testID={`${prefix}-attachment-remove-pending-${draft.key}`}
            />
        </View>
    )
}

interface AttachmentAddAreaProps {
    kind: Pick<SalesDocumentKind, 'shortcutGroup'>
    // The document has files: one row under the list instead of the full prompt.
    isCompact: boolean
    isDisabled: boolean
    onFiles: (files: File[]) => void
    onPick: () => void
    scopeOwner: ScopeOwner
    // The kind's test id prefix (`bill`, `expense`).
    testId: string
}

/**
 * The dashed add area (spec §3.1): a web drop, the prompt and Attach files (⌥A, only
 * while the area is drawn). While writes are unavailable it stays drawn, Attach files is
 * disabled and a drop is refused.
 */
export function AttachmentAddArea({
    kind,
    isCompact,
    isDisabled,
    onFiles,
    onPick,
    scopeOwner,
    testId,
}: AttachmentAddAreaProps) {
    const muted = useThemeColor('muted-foreground')
    const box = isCompact
        ? 'flex-row items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2'
        : 'min-h-[96px] items-center justify-center gap-2 rounded-xl border border-dashed border-border p-3'
    const promptClass = isCompact
        ? 'min-w-0 flex-1 text-sm text-muted-foreground'
        : 'text-center text-sm text-muted-foreground'
    const shortcut = {
        keys: 'Alt+a',
        scope: 'compose' as const,
        allowInInputs: true,
        group: kind.shortcutGroup,
    }
    return (
        <DropZone
            testID={`${testId}-attachments-drop`}
            isEnabled={!isDisabled}
            label={DROP_OVERLAY}
            onDrop={onFiles}
        >
            <View testID={`${testId}-attachments-add`} className={box}>
                <Paperclip size={18} color={muted} />
                <Text className={promptClass}>{DROP_PROMPT}</Text>
                <ShortcutButton
                    testID={`${testId}-attachments-attach`}
                    label="Attach files"
                    shortcut={shortcut}
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    isDisabled={isDisabled}
                    scopeOwner={scopeOwner}
                    onPress={onPick}
                />
            </View>
        </DropZone>
    )
}

function AddArea(props: AttachmentAddAreaProps & { isVisible: boolean }) {
    const { isVisible, ...area } = props
    if (!isVisible) return null
    return <AttachmentAddArea {...area} />
}

function Refusal({ text, testID }: { text: string | null; testID: string }) {
    if (!text) return null
    return (
        <Text testID={testID} accessibilityRole="alert" className="text-sm text-danger">
            {text}
        </Text>
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
// to.
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

interface RemoveConfirmProps {
    // The row Remove asks about; undefined while no confirm is open, or when the row
    // went away while it was open.
    row: DocumentAttachmentRow | undefined
    noun: string
    prefix: string
    remove: AttachmentRemove
    onClose: () => void
}

// The read view's confirm before a delete (spec §3.3). Its texts are computed here, out
// of the Dialog's content.
function RemoveConfirm({ row, noun, prefix, remove, onClose }: RemoveConfirmProps) {
    const { title, message } = removeMessage(row?.name ?? '', noun)
    const confirm = () => {
        if (row) remove.remove(row.id)
        onClose()
    }
    return (
        <ConfirmDialog
            isOpen={row !== undefined}
            onClose={onClose}
            onConfirm={confirm}
            title={title}
            message={message}
            confirmLabel="Remove"
            isDestructive
            isSubmitting={remove.isPending}
            confirmTestID={`${prefix}-attachment-remove-confirm`}
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
    kind: Pick<SalesDocumentKind, 'key' | 'testId' | 'noun' | 'shortcutGroup' | 'features'>
    attachments: DocumentAttachments
    recordId: string | undefined
    isVoid: boolean
    // The number of the correction that replaced this document (it keeps the number);
    // '' when nothing replaced it.
    replacedByNumber: string
    canWrite: boolean
    // Writes are unavailable: add, Retry and Remove are disabled.
    isDisabled: boolean
    mode: 'read' | 'form'
    // The screen's shortcut scope, for Attach files.
    scopeOwner: ScopeOwner
    // The screen's one Retry over its merged recoveries.
    onRetry: () => void
}

/**
 * The Attachments section of a bill or an expense (spec §3): the heading with the count,
 * and the limit where a file can be added; one skeleton row while the rows load; the
 * error with Retry when they fail; the list, each stored row opening core PreviewModal
 * and a writer's Remove asking first, then the files still uploading or failed; the add
 * area with its refusal line; "No attachments" when there are none and no add area
 * shows; and, on a replaced original, "Moved to <number> (edited)" instead.
 */
export function AttachmentsSection({
    kind,
    attachments,
    recordId,
    isVoid,
    replacedByNumber,
    canWrite,
    isDisabled,
    mode,
    scopeOwner,
    onRetry,
}: AttachmentsSectionProps) {
    const [openId, setOpenId] = useState<string | null>(null)
    const [removeId, setRemoveId] = useState<string | null>(null)
    const prefix = kind.testId
    const { rows, isLoading, isError } = attachments
    // The read view screen opens and drops this session (useReadAttachmentSession), so
    // it outlives the section across a tab switch. '' (no session) for a form until it
    // gets its own.
    const sessionKey = mode === 'read' && recordId ? readSessionKey(recordId) : ''
    const drafts = useAttachmentsStore(s => s.sessions[sessionKey]?.drafts) ?? NO_DRAFTS
    const refusal = useAttachmentsStore(s => s.sessions[sessionKey]?.refusal) ?? null
    const upload = useAttachmentUpload({ kind, recordId, sessionKey, count: attachments.allCount })
    const remove = useAttachmentRemove()
    // Only a correction's form lists the original's files (checkpoint 4); a read view
    // shows the document's own.
    const fromRows = mode === 'form' ? attachments.fromRows : []
    const controls = attachmentControls({ canWrite, isVoid, isDisabled, isLoading })
    const isReady = !isLoading && !isError
    // The preview holds the open row by id, so a row removed or added while it is open
    // never moves it to another file; a row that went away closes it.
    const previewRows = [...fromRows, ...rows]
    const openIndex = previewRows.findIndex(row => row.id === openId)
    const previewIndex = openIndex < 0 ? null : openIndex
    const showPreviewAt = (index: number) => setOpenId(previewRows[index]?.id ?? null)
    const closePreview = () => setOpenId(null)
    const removing = rows.find(row => row.id === removeId)
    const closeRemove = () => setRemoveId(null)
    const refusedId = remove.refusedId
    // The confirm closes as the delete starts, so Remove waits for it: a second confirm
    // would send a second delete of the same row.
    const isStoredRemoveDisabled = controls.isRemoveDisabled || remove.isPending
    const listRows = isReady
        ? rows.map(row => (
              <AttachmentRow
                  key={row.id}
                  row={row}
                  testId={`${prefix}-attachment-${row.id}`}
                  removeTestId={`${prefix}-attachment-remove-${row.id}`}
                  onOpen={() => setOpenId(row.id)}
                  onRemove={controls.showsRemove ? () => setRemoveId(row.id) : undefined}
                  isRemoveDisabled={isStoredRemoveDisabled}
                  refusal={row.id === refusedId ? remove.refusal : ''}
              />
          ))
        : []
    const draftRows = drafts.map(draft => (
        <DraftRow
            key={draft.key}
            draft={draft}
            prefix={prefix}
            isDisabled={controls.isAddDisabled}
            onRetry={() => upload.retry(draft.key)}
            onRemove={() => upload.discardDraft(draft.key)}
        />
    ))
    const shownRows = [...listRows, ...draftRows]
    const heading = attachmentsHeading(shownRows.length)
    const isEmpty = isReady && shownRows.length === 0
    const moved = isEmpty && replacedByNumber !== '' ? movedText(replacedByNumber) : ''
    const empty = isEmpty && moved === '' && !controls.showsAdd ? NO_ATTACHMENTS_TEXT : ''
    // The limit shows only where a file can be added: a writer on a document that is not
    // void (a replaced original is void).
    const limit = controls.showsAdd ? ATTACHMENT_LIMIT_TEXT : ''
    const showsAddArea = controls.showsAdd && isReady && sessionKey !== ''
    const dropFiles = (files: File[]) => upload.addFiles(files.map(uploadFileToPickedFile))
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
            <RowList rows={shownRows} testID={`${prefix}-attachments-list`} />
            <MutedLine text={moved} testID={`${prefix}-attachments-moved`} />
            <MutedLine text={empty} testID={`${prefix}-attachments-empty`} />
            <AddArea
                isVisible={showsAddArea}
                kind={kind}
                isCompact={shownRows.length > 0}
                isDisabled={controls.isAddDisabled}
                onFiles={dropFiles}
                onPick={upload.pick}
                scopeOwner={scopeOwner}
                testId={prefix}
            />
            <Refusal text={refusal} testID={`${prefix}-attachments-refusal`} />
            <AttachmentsPreview
                rows={previewRows}
                index={previewIndex}
                onIndex={showPreviewAt}
                onClose={closePreview}
            />
            <RemoveConfirm
                row={removing}
                noun={kind.noun}
                prefix={prefix}
                remove={remove}
                onClose={closeRemove}
            />
        </View>
    )
}
