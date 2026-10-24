import { LoadingState } from '@tinycld/core/components/LoadingState'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Dialog } from '@tinycld/core/ui/dialog'
import { Pressable, Text, View } from 'react-native'
import type { OverrideRow as OverrideRowData } from '../../hooks/useCloseOverrides'
import { useOverridesPanel } from '../../hooks/useOverridesPanel'
import { GrantOverrideDialog } from './GrantOverrideDialog'
import { OverrideRow } from './OverrideRow'
import { SectionCard } from './SectionCard'

interface RevokeDialogProps {
    target: OverrideRowData | null
    onConfirm: () => void
    onCancel: () => void
}

// Core ConfirmDialog has no testID prop on its buttons (a core request for the human),
// so this builds on Dialog like ReopenDialog.
function RevokeDialog({ target, onConfirm, onCancel }: RevokeDialogProps) {
    if (!target) return null
    return (
        <Dialog
            isOpen
            onClose={onCancel}
            title={`Revoke ${target.userName ?? 'this person'}'s override?`}
            hasCloseButton={false}
        >
            <Dialog.Body>
                <Text className="text-sm text-foreground">
                    The person can no longer post into the closed period. The override stays in the
                    past overrides.
                </Text>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={onCancel} />
                <Dialog.ActionButton
                    label="Revoke"
                    isDestructive
                    onPress={onConfirm}
                    testID="books-settings-revoke-confirm"
                />
            </Dialog.Footer>
        </Dialog>
    )
}

interface RowListProps {
    rows: OverrideRowData[]
    isActive: boolean
    onRevoke?: (row: OverrideRowData) => void
}

function RowList({ rows, isActive, onRevoke }: RowListProps) {
    const items = rows.map(row => (
        <OverrideRow key={row.id} row={row} isActive={isActive} onRevoke={onRevoke} />
    ))
    return <View>{items}</View>
}

function EmptyNote({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text className="py-3 text-sm text-muted-foreground">
            No one can post into the closed period.
        </Text>
    )
}

function PastRows({ isVisible, rows }: { isVisible: boolean; rows: OverrideRowData[] }) {
    if (!isVisible) return null
    return <RowList rows={rows} isActive={false} />
}

interface HistoryProps {
    rows: OverrideRowData[]
    isOpen: boolean
    onToggle: () => void
}

function History({ rows, isOpen, onToggle }: HistoryProps) {
    if (rows.length === 0) return null
    const label = `${isOpen ? 'Hide' : 'Show'} past overrides (${rows.length})`
    return (
        <View>
            <Pressable
                accessibilityRole="button"
                onPress={onToggle}
                testID="books-settings-history-toggle"
                style={{ minHeight: 44, justifyContent: 'center' }}
            >
                <Text className="text-sm font-semibold text-primary">{label}</Text>
            </Pressable>
            <PastRows isVisible={isOpen} rows={rows} />
        </View>
    )
}

function NoCloseDate({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text className="py-3 text-sm text-muted-foreground">
            Set a close date to grant overrides.
        </Text>
    )
}

function OverridesLoading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <View testID="books-settings-overrides-loading">
            <LoadingState />
        </View>
    )
}

function OverridesError({ isVisible, onRetry }: { isVisible: boolean; onRetry: () => void }) {
    if (!isVisible) return null
    return (
        <View
            accessibilityRole="alert"
            className="items-center gap-3 p-4"
            testID="books-settings-overrides-error"
        >
            <Text className="text-sm text-foreground">Overrides could not be loaded.</Text>
            <Button
                size="sm"
                variant="outline"
                testID="books-settings-overrides-retry"
                onPress={onRetry}
            >
                <ButtonText>Retry</ButtonText>
            </Button>
        </View>
    )
}

export function OverridesPanel() {
    const panel = useOverridesPanel()
    const { part } = panel
    return (
        <SectionCard title="Overrides">
            <View testID="books-settings-overrides">
                <OverridesLoading isVisible={part === 'loading'} />
                <OverridesError isVisible={part === 'error'} onRetry={panel.retryLoad} />
                <NoCloseDate isVisible={part === 'no-close-date'} />
                <OverridesBody isVisible={part === 'empty' || part === 'ready'} panel={panel} />
            </View>
            <GrantOverrideDialog
                isVisible={panel.grantOpen}
                form={panel.grantForm}
                users={panel.grantableUsers}
                isSubmitting={panel.isSubmitting}
                onSubmit={panel.submitGrant}
                onClose={panel.closeGrant}
            />
            <RevokeDialog
                target={panel.revokeTarget}
                onConfirm={panel.confirmRevoke}
                onCancel={panel.cancelRevoke}
            />
        </SectionCard>
    )
}

function OverridesBody({
    isVisible,
    panel,
}: {
    isVisible: boolean
    panel: ReturnType<typeof useOverridesPanel>
}) {
    if (!isVisible) return null
    return (
        <View>
            <EmptyNote isVisible={panel.active.length === 0} />
            <RowList rows={panel.active} isActive onRevoke={panel.askRevoke} />
            <History
                rows={panel.past}
                isOpen={panel.isHistoryOpen}
                onToggle={panel.toggleHistory}
            />
            <View className="mt-3 flex-row">
                <Button
                    variant="outline"
                    size="sm"
                    onPress={panel.openGrant}
                    testID="books-settings-grant"
                >
                    <ButtonText>Grant an override</ButtonText>
                </Button>
            </View>
        </View>
    )
}
