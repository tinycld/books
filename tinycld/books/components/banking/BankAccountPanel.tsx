import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import type { ReactNode } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type { BankConnectionRow } from '../../hooks/useBankConnections'
import type { BankFileItem } from '../../hooks/useBankFiles'
import type { BankFileUpload } from '../../hooks/useBankFileUpload'
import type { ReviewBatch } from '../../hooks/useReviewBatch'
import { bankDetailsText, connectionLabel } from '../../lib/bank-connections'
import type { ReviewTab } from '../../lib/bank-review'
import { useFabClearanceStyle } from '../../lib/fab-clearance'
import type { LiveRecovery } from '../../lib/live-recovery'
import { useBankingUIStore } from '../../stores/banking-ui-store'
import { BankFileDrop } from './BankFileDrop'
import { BankFileList } from './BankFileList'
import { BankPanelMenu } from './BankPanelMenu'
import { BankingTabs } from './review/BankingTabs'
import { ReviewTabBody } from './review/ReviewTabBody'

interface PanelActionsProps {
    canWrite: boolean
    title: string
    isPanelMenuOpen: boolean
    setPanelMenuOpen: (open: boolean) => void
    onEditDetails: () => void
    onViewRegister: () => void
    onDisconnect: () => void
}

// A writer gets the More menu; a reader can only open the register, so that is a link.
function PanelActions({
    canWrite,
    title,
    isPanelMenuOpen,
    setPanelMenuOpen,
    ...actions
}: PanelActionsProps) {
    if (canWrite) {
        return (
            <BankPanelMenu
                title={title}
                isOpen={isPanelMenuOpen}
                onOpenChange={setPanelMenuOpen}
                {...actions}
            />
        )
    }
    return (
        <Pressable
            testID="bank-view-register"
            accessibilityRole="link"
            onPress={actions.onViewRegister}
            className="justify-center"
            style={{ minHeight: 44 }}
        >
            <Text className="text-sm font-medium text-primary">View register</Text>
        </Pressable>
    )
}

interface RemoveFileButtonProps {
    file: BankFileItem
    isDisabled: boolean
    accessibilityHint: string | undefined
    onRemove: (file: BankFileItem) => void
}

// The server deletes a file only while it is waiting to import.
function RemoveFileButton({
    file,
    isDisabled,
    accessibilityHint,
    onRemove,
}: RemoveFileButtonProps) {
    if (file.status !== 'uploaded') return null
    const onPress = () => onRemove(file)
    return (
        <Button
            testID={`bank-file-remove-${file.id}`}
            variant="outline"
            size="sm"
            style={{ minHeight: 36 }}
            isDisabled={isDisabled}
            accessibilityHint={accessibilityHint}
            onPress={onPress}
        >
            <ButtonText>Remove</ButtonText>
        </Button>
    )
}

interface ImportFileButtonProps {
    file: BankFileItem
    isDisabled: boolean
    accessibilityHint: string | undefined
    onImport: (file: BankFileItem) => void
}

// Every file can be imported again: the rest of its rows, or to see that all are in.
function ImportFileButton({
    file,
    isDisabled,
    accessibilityHint,
    onImport,
}: ImportFileButtonProps) {
    const onPress = () => onImport(file)
    return (
        <Button
            testID={`bank-file-import-${file.id}`}
            variant="outline"
            size="sm"
            style={{ minHeight: 36 }}
            isDisabled={isDisabled}
            accessibilityHint={accessibilityHint}
            onPress={onPress}
        >
            <ButtonText>Import</ButtonText>
        </Button>
    )
}

function UploadArea({ isVisible, upload }: { isVisible: boolean; upload: BankFileUpload }) {
    if (!isVisible) return null
    return <BankFileDrop upload={upload} />
}

interface PanelBodyProps {
    isLoading: boolean
    upload: BankFileUpload
    children?: ReactNode
    files: BankFileItem[]
    canWrite: boolean
    isWide: boolean
    renderAction?: (file: BankFileItem) => ReactNode
}

// While the selected connection's files load, only the Files tab shows it is loading; the
// header, the strip and the tab bar stay.
function PanelBody({
    isLoading,
    upload,
    children,
    files,
    canWrite,
    isWide,
    renderAction,
}: PanelBodyProps) {
    if (isLoading) {
        return (
            <View testID="bank-panel-loading">
                <LoadingState />
            </View>
        )
    }
    return (
        <>
            <UploadArea isVisible={canWrite} upload={upload} />
            {children}
            <BankFileList
                files={files}
                canWrite={canWrite}
                isWide={isWide}
                renderAction={renderAction}
            />
        </>
    )
}

// The Files tab scrolls on its own: the page above it stays put.
function FilesTabBody(props: PanelBodyProps) {
    const fabClearanceStyle = useFabClearanceStyle()
    return (
        <ScrollView
            testID="bank-tab-body-files"
            className="min-h-0 flex-1"
            contentContainerClassName="gap-4"
            contentContainerStyle={fabClearanceStyle}
        >
            <PanelBody {...props} />
        </ScrollView>
    )
}

interface TabBodyProps extends PanelBodyProps {
    tab: ReviewTab
    row: BankConnectionRow
    currency: string
    onGoToFiles: () => void
    pageRecovery: LiveRecovery
    batch: ReviewBatch
}

// The transaction tabs show their own loading state, so only the Files tab waits for the
// files of the selected connection.
function TabBody({ tab, row, currency, onGoToFiles, pageRecovery, batch, ...files }: TabBodyProps) {
    if (tab === 'files') return <FilesTabBody {...files} />
    return (
        <ReviewTabBody
            tab={tab}
            connection={row}
            currency={currency}
            onGoToFiles={onGoToFiles}
            pageRecovery={pageRecovery}
            batch={batch}
        />
    )
}

interface BankAccountPanelProps {
    row: BankConnectionRow | undefined
    files: BankFileItem[]
    canWrite: boolean
    isWide: boolean
    isLoading: boolean
    isPanelMenuOpen: boolean
    setPanelMenuOpen: (open: boolean) => void
    onEditDetails: () => void
    onViewRegister: () => void
    onDisconnect: () => void
    // The selected connection's upload; a writer gets its upload area.
    upload: BankFileUpload
    tab: ReviewTab
    onTab: (tab: ReviewTab) => void
    onGoToFiles: () => void
    currency: string
    // The page's failed reads, recovered with a transaction tab's Retry.
    pageRecovery: LiveRecovery
    // The page's status change of transactions, shared with the drawer beside the page.
    batch: ReviewBatch
    // What the import and review units add, under the upload area and above the files.
    children?: ReactNode
}

export function BankAccountPanel({
    row,
    files,
    canWrite,
    isWide,
    isLoading,
    upload,
    tab,
    onTab,
    onGoToFiles,
    currency,
    pageRecovery,
    batch,
    children,
    ...actions
}: BankAccountPanelProps) {
    // Called here once: a hook cannot run inside the row callback below.
    const writes = useServerActionState()
    const openDialog = useBankingUIStore(s => s.openDialog)
    const orgHref = useOrgHref()
    if (!row) return null
    const onRemove = (file: BankFileItem) =>
        openDialog({ kind: 'remove', connectionId: row.id, fileId: file.id, fileName: file.name })
    const onImport = (file: BankFileItem) => router.push(orgHref(`books/banking/import/${file.id}`))
    const renderWriterActions = (file: BankFileItem) => (
        <>
            <ImportFileButton
                file={file}
                isDisabled={writes.isDisabled}
                accessibilityHint={writes.accessibilityHint}
                onImport={onImport}
            />
            <RemoveFileButton
                file={file}
                isDisabled={writes.isDisabled}
                accessibilityHint={writes.accessibilityHint}
                onRemove={onRemove}
            />
        </>
    )
    const renderAction = canWrite ? renderWriterActions : undefined
    const title = connectionLabel(row.accountNumber, row.accountName)
    const details = bankDetailsText(row)
    const detailsTone = details ? 'text-foreground' : 'text-muted-foreground'
    return (
        <View
            testID="bank-panel"
            className="min-h-0 flex-1 gap-3 rounded-xl border border-border p-4"
        >
            <View className="flex-row items-start justify-between gap-3">
                <View className="min-w-0 shrink gap-0.5">
                    <Text
                        testID="bank-panel-title"
                        className="text-xl font-semibold text-foreground"
                    >
                        {title}
                    </Text>
                    <Text testID="bank-panel-details" className={`text-sm ${detailsTone}`}>
                        {details || 'No bank details'}
                    </Text>
                </View>
                <PanelActions canWrite={canWrite} title={title} {...actions} />
            </View>
            <BankingTabs tab={tab} reviewCount={row.reviewCount} onTab={onTab} />
            <TabBody
                tab={tab}
                row={row}
                currency={currency}
                onGoToFiles={onGoToFiles}
                pageRecovery={pageRecovery}
                batch={batch}
                isLoading={isLoading}
                upload={upload}
                files={files}
                canWrite={canWrite}
                isWide={isWide}
                renderAction={renderAction}
            >
                {children}
            </TabBody>
        </View>
    )
}
