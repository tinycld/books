import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { Menu } from '@tinycld/core/ui/menu'
import { MoreVertical } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable } from 'react-native'
import { useBooksAccess } from '../../../hooks/useBooksAccess'
import type { DocumentListRow } from '../../../lib/document-list'
import {
    ROW_MENU_LABELS,
    rowActionTestId,
    rowWriteOffOffered,
} from '../../../lib/document-row-menu'
import { LIST_AREAS } from '../../../lib/list-areas'
import { useWriteOffStore } from '../../../stores/write-off-store'
import { PressBoundary } from '../../PressBoundary'

const TRIGGER_STYLE = { width: 44, minHeight: 44 }

interface WriteOffItemProps {
    isVisible: boolean
    isDisabled: boolean
    onSelect: () => void
}

// The menu's one row. It exists only while the menu is open, because core Sheet keeps its
// content in the page while it slides out (as DocumentRowMenu's rows).
function WriteOffItem({ isVisible, isDisabled, onSelect }: WriteOffItemProps) {
    if (!isVisible) return null
    return (
        <Menu.Item
            testID={rowActionTestId(LIST_AREAS.sales.testIdPrefix, 'write_off')}
            label={ROW_MENU_LABELS.write_off}
            isDisabled={isDisabled}
            onSelect={onSelect}
        />
    )
}

interface CustomerInvoiceRowMenuProps {
    row: DocumentListRow
    // The customer tab's `useId()`, which mounts its one WriteOffDialog with it.
    owner: string
}

/**
 * The row menu of an invoice on the customer page's Transactions tab (write-off spec §3.1):
 * the one row "Write off", offered by the Sales lists' rule (`rowWriteOffOffered`: a writer,
 * a posted invoice with a balance above 0); nothing draws on any other row. Write off opens
 * the write-off dialog over the page (`useWriteOffStore` with `owner`) and waits while
 * writes are unavailable. The menu's parts are DocumentRowMenu's: a press on the button or
 * the row never opens the invoice behind it (PressBoundary).
 */
export function CustomerInvoiceRowMenu({ row, owner }: CustomerInvoiceRowMenuProps) {
    const color = useThemeColor('muted-foreground')
    const { canWrite } = useBooksAccess()
    const writes = useWritesAvailable()
    const openWriteOff = useWriteOffStore(state => state.open)
    const [isOpen, setOpen] = useState(false)
    if (!rowWriteOffOffered(row, canWrite)) return null
    const writeOff = () => openWriteOff(row.id, owner)
    const title = `Invoice ${row.number}`
    const label = `Actions for invoice ${row.number}`
    // An element, not a component: the menu clones it with its press handler and ref.
    const trigger = (
        <Pressable
            testID={`customer-transactions-row-menu-${row.id}`}
            accessibilityRole="button"
            accessibilityLabel={label}
            className="items-center justify-center"
            style={TRIGGER_STYLE}
        >
            <MoreVertical size={18} color={color} />
        </Pressable>
    )
    return (
        <PressBoundary>
            <Menu
                title={title}
                placement="bottom-end"
                sheetSide="bottom"
                isOpen={isOpen}
                onOpenChange={setOpen}
                trigger={trigger}
            >
                <WriteOffItem
                    isVisible={isOpen}
                    isDisabled={!writes.available}
                    onSelect={writeOff}
                />
            </Menu>
        </PressBoundary>
    )
}
