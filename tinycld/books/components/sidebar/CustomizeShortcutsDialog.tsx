import { SortableDragHandle, SortableList } from '@tinycld/core/components/SortableList'
import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { DIALOG_SUBMIT_SHORTCUT, Dialog } from '@tinycld/core/ui/dialog'
import { ArrowDown, ArrowUp, type LucideIcon, X } from 'lucide-react-native'
import { type RefObject, useRef } from 'react'
import { Pressable, type PressableInstance, Text, View } from 'react-native'
import { type CustomizeRow, useCustomizeShortcuts } from '../../hooks/useCustomizeShortcuts'
import { type FocusRequest, type MoveDirection, useMovedFocus } from '../../hooks/useMovedFocus'
import { shortcutTestId } from '../../lib/shortcut-rows'
import { DashboardIconButton } from '../dashboard/DashboardIconButton'

type Customize = ReturnType<typeof useCustomizeShortcuts>

function RowIcon({ icon: Icon }: { icon: LucideIcon | null }) {
    const color = useThemeColor('muted-foreground')
    if (!Icon) return null
    return <Icon size={16} color={color} />
}

interface DialogRowProps {
    row: CustomizeRow
    index: number
    dialog: Customize
    focusRequest: RefObject<FocusRequest | null>
}

function DialogRow({ row, index, dialog, focusRequest }: DialogRowProps) {
    const upRef = useRef<PressableInstance>(null)
    const downRef = useRef<PressableInstance>(null)
    // The place comes from the draft, not from the list's render index: the sortable list
    // draws a new order a render later (and, on native, keeps its cells after a drop).
    const place = dialog.rows.findIndex(candidate => candidate.key === row.key)
    const isFirst = place === 0
    const isLast = place === dialog.rows.length - 1
    useMovedFocus({ id: row.key, index, place, isFirst, isLast, focusRequest, upRef, downRef })
    const id = editRowTestId(row)
    const labelClass = row.icon
        ? 'flex-1 text-base text-foreground'
        : 'flex-1 text-base text-muted-foreground'
    const move = (direction: MoveDirection) => {
        focusRequest.current = { id: row.key, direction }
        dialog.move(row.key, direction === 'up' ? -1 : 1)
    }
    return (
        <View
            testID={id}
            className="mb-2 flex-row items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2"
        >
            <SortableDragHandle testID={`${id}-handle`} />
            <RowIcon icon={row.icon} />
            <Text className={labelClass} numberOfLines={1}>
                {row.label}
            </Text>
            <DashboardIconButton
                buttonRef={upRef}
                testID={`${id}-up`}
                label={`Move up: ${row.label}`}
                icon={ArrowUp}
                iconSize={16}
                isDisabled={isFirst}
                onPress={() => move('up')}
            />
            <DashboardIconButton
                buttonRef={downRef}
                testID={`${id}-down`}
                label={`Move down: ${row.label}`}
                icon={ArrowDown}
                iconSize={16}
                isDisabled={isLast}
                onPress={() => move('down')}
            />
            <DashboardIconButton
                testID={`${id}-remove`}
                label={`Remove: ${row.label}`}
                icon={X}
                iconSize={16}
                isDisabled={false}
                onPress={() => dialog.remove(row.key)}
            />
        </View>
    )
}

// `books-shortcuts-row-<kind>-<ref>`: not under the `books-shortcut-` prefix of the
// sidebar's own rows, so a count of the sidebar's shortcuts never includes the dialog's.
export function editRowTestId(row: CustomizeRow) {
    return shortcutTestId(row.shortcut).replace('books-shortcut-', 'books-shortcuts-row-')
}

function EmptyDraft({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID="books-shortcuts-dialog-empty" className="text-sm text-muted-foreground">
            No shortcuts. The sidebar shows none.
        </Text>
    )
}

function keyOf(row: CustomizeRow) {
    return row.key
}

// Customize shortcuts (QuickBooks' "Customize Shortcuts"): the user's list with Remove,
// Move up, Move down and drag. Core Dialog draws a sheet on a phone. Nothing is written
// until Save.
export function CustomizeShortcutsDialog() {
    const dialog = useCustomizeShortcuts()
    const focusRequest = useRef<FocusRequest | null>(null)
    const resetStyle = { minHeight: 44, opacity: dialog.isDefault ? 0.4 : 1 }
    const renderItem = ({ item, index }: { item: CustomizeRow; index: number }) => (
        <DialogRow row={item} index={index} dialog={dialog} focusRequest={focusRequest} />
    )
    return (
        <Dialog
            isOpen={dialog.isOpen}
            onClose={dialog.cancel}
            title="Customize shortcuts"
            description="Drag a row, or use the arrows, to change the order."
            size="lg"
            testID="books-shortcuts-dialog"
        >
            <Dialog.Body>
                <SortableList
                    data={dialog.rows}
                    keyExtractor={keyOf}
                    onReorder={dialog.reorder}
                    renderItem={renderItem}
                />
                <EmptyDraft isVisible={dialog.isEmpty} />
                <Pressable
                    testID="books-shortcuts-reset"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: dialog.isDefault }}
                    disabled={dialog.isDefault}
                    onPress={dialog.resetToDefaults}
                    className="self-start justify-center"
                    style={resetStyle}
                >
                    <Text className="text-sm font-medium text-primary">Reset to defaults</Text>
                </Pressable>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.CancelButton onPress={dialog.cancel} />
                <Dialog.ActionButton
                    label="Save"
                    onPress={dialog.save}
                    isDisabled={!dialog.canSave}
                    shortcut={DIALOG_SUBMIT_SHORTCUT}
                    testID="books-shortcuts-save"
                />
            </Dialog.Footer>
        </Dialog>
    )
}
