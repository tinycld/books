import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { Menu } from '@tinycld/core/ui/menu'
import type { CustomerPageState } from '../../../hooks/useCustomerPage'
import { useOpenHistory } from '../../../hooks/useOpenHistory'
import type { BooksCustomers } from '../../../types'
import { moreTrigger } from '../../party/page/PartyMoreTrigger'
import { WhileOpen } from '../../RecordRowMenu'
import { DeleteCustomerDialog } from '../DeleteCustomerDialog'

interface CustomerMoreMenuProps {
    record: BooksCustomers
    page: CustomerPageState
    isPhone: boolean
}

function AddSubItem({ isVisible, onSelect }: { isVisible: boolean; onSelect: () => void }) {
    if (!isVisible) return null
    return <Menu.Item label="Add sub-customer" testID="customer-more-add-sub" onSelect={onSelect} />
}

interface WriteItemsProps {
    isVisible: boolean
    page: CustomerPageState
    // Read outside the menu: on native the overlay host drops the screen's contexts.
    isWriteDisabled: boolean
    onAddSub: () => void
}

// Add sub-customer, Make inactive / Make active and Delete customer, then the separator
// before Audit history. A write item is disabled while a write runs or writes cannot
// reach the server.
function WriteItems({ isVisible, page, isWriteDisabled, onAddSub }: WriteItemsProps) {
    if (!isVisible) return null
    const { deleteDialog, controls } = page
    return (
        <>
            <AddSubItem isVisible={controls.showAddSub} onSelect={onAddSub} />
            <Menu.Item
                label={controls.inactiveLabel}
                testID="customer-more-inactive"
                isDisabled={isWriteDisabled}
                onSelect={page.toggleInactive}
            />
            <Menu.Separator />
            <Menu.Item
                label="Delete customer"
                testID="customer-more-delete"
                isDestructive
                isDisabled={isWriteDisabled}
                onSelect={deleteDialog.open}
            />
            <Menu.Separator />
        </>
    )
}

/**
 * Add sub-customer, Make inactive / Make active and Delete for a writer, then Audit
 * history for every Books reader, so a reader gets More holding Audit history alone.
 * A refusal shows in the page's banner (Delete's in its dialog).
 */
export function CustomerMoreMenu({ record, page, isPhone }: CustomerMoreMenuProps) {
    const writes = useWritesAvailable()
    const color = useThemeColor('foreground')
    const openHistory = useOpenHistory('books_customers', record.id)
    const { actions, navigation, deleteDialog, controls } = page
    if (!controls.showMore) return null
    const isWriteDisabled = actions.isWorking || !writes.available
    const addSub = () => navigation.openNew(record.id)
    const deleteTarget = deleteDialog.isOpen ? record : null
    const trigger = moreTrigger(isPhone, color, 'customer')
    return (
        <>
            <Menu title="More" placement="bottom-end" sheetSide="bottom" trigger={trigger}>
                <WhileOpen>
                    <WriteItems
                        isVisible={controls.showWriteItems}
                        page={page}
                        isWriteDisabled={isWriteDisabled}
                        onAddSub={addSub}
                    />
                    <Menu.Item
                        label="Audit history"
                        testID="customer-more-history"
                        onSelect={openHistory}
                    />
                </WhileOpen>
            </Menu>
            <DeleteCustomerDialog
                customer={deleteTarget}
                actions={actions}
                isOpenAndDirty={page.isDirty}
                refusal={deleteDialog.refusal}
                onClose={deleteDialog.close}
                onDeleted={deleteDialog.onDeleted}
            />
        </>
    )
}
