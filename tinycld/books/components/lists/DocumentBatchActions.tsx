import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { useIsFocused } from 'expo-router'
import { CheckSquare } from 'lucide-react-native'
import { Pressable } from 'react-native'
import type { DocumentBatch } from '../../hooks/useDocumentBatch'
import type { useListSelection } from '../../hooks/useListSelection'
import { useDocumentListStore } from '../../stores/document-list-store'

const TRIGGER_STYLE = { minHeight: 44 }
const ICON_STYLE = { width: 44, height: 44 }

type Selection = ReturnType<typeof useListSelection>

// Open while the store's menu is 'batch' and the list has the focus (as the row menus).
function useBatchMenuOpen() {
    const isFocused = useIsFocused()
    const isOpen = useDocumentListStore(state => state.menu === 'batch')
    const setMenu = useDocumentListStore(state => state.setMenu)
    return {
        isOpen: isFocused && isOpen,
        setOpen: (next: boolean) => setMenu(next ? 'batch' : ''),
    }
}

interface ItemsProps {
    isOpen: boolean
    isCards: boolean
    hasTicks: boolean
    selection: Selection
    batch: DocumentBatch
}

// Built only while the menu is open, because core Sheet keeps its content in the page while
// it slides out. With cards the menu also selects all and clears; the actions wait for a
// tick, for writes and for a running batch.
function BatchItems({ isOpen, isCards, hasTicks, selection, batch }: ItemsProps) {
    if (!isOpen) return null
    const canAct = hasTicks && batch.canStart
    const deleteDrafts = () => batch.open('delete_drafts')
    const voidAll = () => batch.open('void')
    const selectAll = () => selection.tickAll()
    const clear = () => selection.clear()
    const cardItems = isCards ? (
        <>
            <Menu.Item testID="sales-batch-select-all" label="Select all" onSelect={selectAll} />
            <Menu.Item
                testID="sales-batch-clear"
                label="Clear selection"
                isDisabled={!hasTicks}
                onSelect={clear}
            />
        </>
    ) : null
    return (
        <>
            {cardItems}
            <Menu.Item
                testID="sales-batch-delete-drafts"
                label="Delete drafts"
                isDisabled={!canAct}
                onSelect={deleteDrafts}
            />
            <Menu.Item
                testID="sales-batch-void"
                label="Void"
                isDisabled={!canAct}
                onSelect={voidAll}
            />
        </>
    )
}

// With cards an icon in a 44 px bordered square (the border, radius and background of the
// toolbar's search field) that stays enabled; with the table the labelled button, disabled
// while no row is ticked. An element, not a component: the menu clones it with its press
// handler and ref.
function batchTrigger(isCards: boolean, hasTicks: boolean, color: string) {
    if (isCards) {
        return (
            <Pressable
                testID="sales-batch-actions"
                accessibilityRole="button"
                accessibilityLabel="Batch actions"
                className="items-center justify-center rounded-md border border-border bg-background"
                style={ICON_STYLE}
            >
                <CheckSquare size={18} color={color} />
            </Pressable>
        )
    }
    return (
        <Button
            testID="sales-batch-actions"
            variant="outline"
            size="sm"
            isDisabled={!hasTicks}
            accessibilityLabel="Batch actions"
            style={TRIGGER_STYLE}
        >
            <ButtonText>Batch actions</ButtonText>
        </Button>
    )
}

interface DocumentBatchActionsProps {
    isVisible: boolean
    // The list draws cards (no header tick box): the icon, with Select all and Clear.
    isCards: boolean
    selection: Selection
    batch: DocumentBatch
}

/**
 * The toolbar's Batch actions (spec §3 "Batch actions"): a core Menu with Delete drafts and
 * Void, which open the batch's confirm dialog. Not drawn for a reader or in the names
 * column (`controls.showBatch`).
 */
export function DocumentBatchActions({
    isVisible,
    isCards,
    selection,
    batch,
}: DocumentBatchActionsProps) {
    const { isOpen, setOpen } = useBatchMenuOpen()
    // A tick on a loaded row; the header box's state counts only those.
    const hasTicks = selection.headerState !== 'empty'
    const color = useThemeColor('foreground')
    const trigger = batchTrigger(isCards, hasTicks, color)
    if (!isVisible) return null
    return (
        <Menu
            title="Batch actions"
            placement="bottom-end"
            sheetSide="bottom"
            isOpen={isOpen}
            onOpenChange={setOpen}
            trigger={trigger}
        >
            <BatchItems
                isOpen={isOpen}
                isCards={isCards}
                hasTicks={hasTicks}
                selection={selection}
                batch={batch}
            />
        </Menu>
    )
}
