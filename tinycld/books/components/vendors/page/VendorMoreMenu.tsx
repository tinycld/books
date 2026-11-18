import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { Menu } from '@tinycld/core/ui/menu'
import { useOpenHistory } from '../../../hooks/useOpenHistory'
import type { VendorPageState } from '../../../hooks/useVendorPage'
import type { BooksVendors } from '../../../types'
import { moreTrigger } from '../../party/page/PartyMoreTrigger'
import { WhileOpen } from '../../RecordRowMenu'
import { DeleteVendorDialog } from '../DeleteVendorDialog'

interface VendorMoreMenuProps {
    record: BooksVendors
    page: VendorPageState
    isPhone: boolean
}

interface ItemProps {
    isVisible: boolean
    // Read outside the menu: on native the overlay host drops the screen's contexts.
    isDisabled: boolean
    onSelect: () => void
}

function InactiveItem({ isVisible, isDisabled, label, onSelect }: ItemProps & { label: string }) {
    if (!isVisible) return null
    return (
        <Menu.Item
            label={label}
            testID="vendor-more-inactive"
            isDisabled={isDisabled}
            onSelect={onSelect}
        />
    )
}

// Delete vendor, then the separator before Audit history.
function DeleteItem({ isVisible, isDisabled, onSelect }: ItemProps) {
    if (!isVisible) return null
    return (
        <>
            <Menu.Separator />
            <Menu.Item
                label="Delete vendor"
                testID="vendor-more-delete"
                isDestructive
                isDisabled={isDisabled}
                onSelect={onSelect}
            />
        </>
    )
}

function HistoryItem({ isVisible, onSelect }: Omit<ItemProps, 'isDisabled'>) {
    if (!isVisible) return null
    return <Menu.Item label="Audit history" testID="vendor-more-history" onSelect={onSelect} />
}

/**
 * Make inactive / Make active and Delete vendor for a writer, then Audit history for
 * every Books reader, so a reader gets More holding Audit history alone. A write item is
 * disabled while a write runs or writes cannot reach the server. A refusal shows in the
 * page's banner (Delete's in its dialog).
 */
export function VendorMoreMenu({ record, page, isPhone }: VendorMoreMenuProps) {
    const writes = useWritesAvailable()
    const color = useThemeColor('foreground')
    const openHistory = useOpenHistory('books_vendors', record.id)
    const { actions, deleteDialog, controls } = page
    const hasItem = controls.showInactiveToggle || controls.showDelete || controls.showHistory
    if (!hasItem) return null
    const isWriteDisabled = actions.isWorking || !writes.available
    const inactiveLabel = record.inactive ? 'Make active' : 'Make inactive'
    const hasWriteItem = controls.showInactiveToggle || controls.showDelete
    const historySeparator = hasWriteItem && controls.showHistory ? <Menu.Separator /> : null
    const deleteTarget = deleteDialog.isOpen ? record : null
    const trigger = moreTrigger(isPhone, color, 'vendor')
    return (
        <>
            <Menu title="More" placement="bottom-end" sheetSide="bottom" trigger={trigger}>
                <WhileOpen>
                    <InactiveItem
                        isVisible={controls.showInactiveToggle}
                        isDisabled={isWriteDisabled}
                        label={inactiveLabel}
                        onSelect={page.toggleInactive}
                    />
                    <DeleteItem
                        isVisible={controls.showDelete}
                        isDisabled={isWriteDisabled}
                        onSelect={deleteDialog.open}
                    />
                    {historySeparator}
                    <HistoryItem isVisible={controls.showHistory} onSelect={openHistory} />
                </WhileOpen>
            </Menu>
            <DeleteVendorDialog
                vendor={deleteTarget}
                actions={actions}
                isOpenAndDirty={page.isDirty}
                refusal={deleteDialog.refusal}
                onClose={deleteDialog.close}
                onDeleted={deleteDialog.onDeleted}
            />
        </>
    )
}
