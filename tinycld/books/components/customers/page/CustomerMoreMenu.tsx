import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { MoreHorizontal } from 'lucide-react-native'
import { Pressable } from 'react-native'
import type { CustomerPageState } from '../../../hooks/useCustomerPage'
import { customerPageControls } from '../../../lib/customer-page-tabs'
import type { BooksCustomers } from '../../../types'
import { WhileOpen } from '../../RecordRowMenu'
import { DeleteCustomerDialog } from '../DeleteCustomerDialog'

interface CustomerMoreMenuProps {
    record: BooksCustomers
    page: CustomerPageState
    isPhone: boolean
}

// An icon button on a phone, where the header's top right has room for one icon only.
// An element, not a component: the menu clones it with its press handler and anchor ref.
function moreTrigger(isPhone: boolean, color: string) {
    if (isPhone) {
        return (
            <Pressable
                testID="customer-more"
                accessibilityRole="button"
                accessibilityLabel="More"
                className="h-11 w-11 items-center justify-center"
            >
                <MoreHorizontal size={20} color={color} />
            </Pressable>
        )
    }
    return (
        <Button testID="customer-more" variant="outline" style={{ minHeight: 44 }}>
            <ButtonText>More</ButtonText>
        </Button>
    )
}

function AddSubItem({ isVisible, onSelect }: { isVisible: boolean; onSelect: () => void }) {
    if (!isVisible) return null
    return <Menu.Item label="Add sub-customer" testID="customer-more-add-sub" onSelect={onSelect} />
}

/**
 * Add sub-customer, Make inactive / Make active and Delete for a writer; a reader gets no
 * menu. A write item is disabled while a write runs or writes cannot reach the server;
 * a refusal shows in the page's banner (Delete's in its dialog).
 */
export function CustomerMoreMenu({ record, page, isPhone }: CustomerMoreMenuProps) {
    const writes = useWritesAvailable()
    const color = useThemeColor('foreground')
    const { actions, navigation, deleteDialog } = page
    const controls = customerPageControls({
        canWrite: page.canWrite,
        inactive: record.inactive,
        isTopLevel: record.parent === '',
    })
    if (!controls.showMore) return null
    const isWriteDisabled = actions.isWorking || !writes.available
    const addSub = () => navigation.openNew(record.id)
    const toggleInactive = () => void actions.setInactive(record.id, !record.inactive)
    const deleteTarget = deleteDialog.isOpen ? record : null
    const trigger = moreTrigger(isPhone, color)
    return (
        <>
            <Menu title="More" placement="bottom-end" sheetSide="bottom" trigger={trigger}>
                <WhileOpen>
                    <AddSubItem isVisible={controls.showAddSub} onSelect={addSub} />
                    <Menu.Item
                        label={controls.inactiveLabel}
                        testID="customer-more-inactive"
                        isDisabled={isWriteDisabled}
                        onSelect={toggleInactive}
                    />
                    <Menu.Separator />
                    <Menu.Item
                        label="Delete customer"
                        testID="customer-more-delete"
                        isDestructive
                        isDisabled={actions.isWorking}
                        onSelect={deleteDialog.open}
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
