import { LoadingState } from '@tinycld/core/components/LoadingState'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { BankConnectionRow } from '../../hooks/useBankConnections'
import type { BankFileItem } from '../../hooks/useBankFiles'
import { bankDetailsText, connectionLabel } from '../../lib/bank-connections'
import { BankFileList } from './BankFileList'
import { BankPanelMenu } from './BankPanelMenu'

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

interface PanelBodyProps {
    isLoading: boolean
    upload?: ReactNode
    children?: ReactNode
    files: BankFileItem[]
    canWrite: boolean
    isWide: boolean
    renderAction?: (file: BankFileItem) => ReactNode
}

// While the selected connection's files load, only the panel shows it is loading; the
// header and the strip stay.
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
            {upload}
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
    // The upload area, for a writer.
    upload?: ReactNode
    // What the import and review units add, under the upload area and above the files.
    children?: ReactNode
    renderAction?: (file: BankFileItem) => ReactNode
}

export function BankAccountPanel({
    row,
    files,
    canWrite,
    isWide,
    isLoading,
    upload,
    children,
    renderAction,
    ...actions
}: BankAccountPanelProps) {
    if (!row) return null
    const title = connectionLabel(row.accountNumber, row.accountName)
    const details = bankDetailsText(row)
    const detailsTone = details ? 'text-foreground' : 'text-muted-foreground'
    return (
        <View testID="bank-panel" className="gap-4 rounded-xl border border-border p-4">
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
            <PanelBody
                isLoading={isLoading}
                upload={upload}
                files={files}
                canWrite={canWrite}
                isWide={isWide}
                renderAction={renderAction}
            >
                {children}
            </PanelBody>
        </View>
    )
}
