import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { Menu } from '@tinycld/core/ui/menu'
import { MoreVertical } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable } from 'react-native'
import { useBooksAccess } from '../../../hooks/useBooksAccess'
import { useOpenCreditWithApply } from '../../../hooks/useOpenCreditWithApply'
import type { DocumentListRow } from '../../../lib/document-list'
import {
    ROW_MENU_LABELS,
    rowActionTestId,
    rowApplyCreditOffered,
    rowWriteOffOffered,
} from '../../../lib/document-row-menu'
import { LIST_AREAS } from '../../../lib/list-areas'
import { useWriteOffStore } from '../../../stores/write-off-store'
import { PressBoundary } from '../../PressBoundary'

const TRIGGER_STYLE = { width: 44, minHeight: 44 }
const PREFIX = LIST_AREAS.sales.testIdPrefix

// The menu's one row: a row's action is offered or there is no menu at all.
type MenuAction = 'write_off' | 'apply_credit'

interface ActionItemProps {
    action: MenuAction
    isVisible: boolean
    isDisabled: boolean
    onSelect: () => void
}

// The menu's one row. It exists only while the menu is open, because core Sheet keeps its
// content in the page while it slides out (as DocumentRowMenu's rows).
function ActionItem({ action, isVisible, isDisabled, onSelect }: ActionItemProps) {
    if (!isVisible) return null
    return (
        <Menu.Item
            testID={rowActionTestId(PREFIX, action)}
            label={ROW_MENU_LABELS[action]}
            isDisabled={isDisabled}
            onSelect={onSelect}
        />
    )
}

// The row's offered action: Write off on an invoice, Apply to invoices on a credit memo,
// each by the Sales lists' rule; null on any other row, or when the rule does not offer it.
function offeredAction(row: DocumentListRow, canWrite: boolean): MenuAction | null {
    if (rowWriteOffOffered(row, canWrite)) return 'write_off'
    if (rowApplyCreditOffered(row, canWrite)) return 'apply_credit'
    return null
}

// The menu's title and the trigger's label: "Invoice 1009", "Actions for invoice 1009".
function namesOf(row: DocumentListRow, action: MenuAction) {
    const noun = action === 'write_off' ? 'Invoice' : 'Credit memo'
    return {
        title: `${noun} ${row.number}`,
        label: `Actions for ${noun.toLowerCase()} ${row.number}`,
    }
}

interface CustomerRowMenuProps {
    row: DocumentListRow
    // The customer tab's `useId()`, which mounts its one WriteOffDialog with it.
    owner: string
}

/**
 * The row menu of a row on the customer page's Transactions tab, with one row, offered by
 * the Sales lists' rules: "Write off" on an invoice (write-off spec §3.1;
 * `rowWriteOffOffered`: a writer, a posted invoice with a balance above 0), and "Apply to
 * invoices" on a credit memo (apply credit spec §3.1; `rowApplyCreditOffered`: a writer, a
 * posted credit memo with unapplied credit). Nothing draws on any other row, nor for a
 * reader. Write off opens the write-off dialog over the page (`useWriteOffStore` with
 * `owner`) and waits while writes are unavailable. Apply to invoices opens the credit memo
 * and its apply dialog there (`useOpenCreditWithApply`, as the Sales lists do); the dialog
 * itself waits while writes are unavailable. The menu's parts are DocumentRowMenu's: a press
 * on the button or the row never opens the document behind it (PressBoundary).
 */
export function CustomerRowMenu({ row, owner }: CustomerRowMenuProps) {
    const color = useThemeColor('muted-foreground')
    const { canWrite } = useBooksAccess()
    const writes = useWritesAvailable()
    const openWriteOff = useWriteOffStore(state => state.open)
    const openCreditWithApply = useOpenCreditWithApply()
    const [isOpen, setOpen] = useState(false)
    const action = offeredAction(row, canWrite)
    if (action === null) return null
    // Pushed, as the Sales lists' row action, so Back returns to the customer page.
    const applyCredit = () => openCreditWithApply(row)
    const onSelect = action === 'write_off' ? () => openWriteOff(row.id, owner) : applyCredit
    const isDisabled = action === 'write_off' && !writes.available
    const { title, label } = namesOf(row, action)
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
                <ActionItem
                    action={action}
                    isVisible={isOpen}
                    isDisabled={isDisabled}
                    onSelect={onSelect}
                />
            </Menu>
        </PressBoundary>
    )
}
