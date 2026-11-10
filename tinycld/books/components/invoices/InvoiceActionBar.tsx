import { formatHint, type ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { View } from 'react-native'
import { INVOICE_SHORTCUT_GROUP } from '../../hooks/useInvoiceShortcuts'
import { FORM_KEYS } from '../../lib/entry-shortcuts'

// A row of the More menu: its key text is shown on the row; the key itself is
// registered by the screen and does what the row does.
export type InvoiceMoreItem = {
    id: string
    label: string
    keys: string
    isDisabled: boolean
    onSelect: () => void
}

export interface InvoiceActionBarProps {
    isSaving: boolean
    // The form is a saved draft the user may delete: More then holds Delete draft.
    canDeleteDraft: boolean
    onCancel: () => void
    onSaveDraft: () => void
    onDeleteDraft: () => void
    // Not drawn yet: checkpoint 5 draws Post and Post & new from these.
    onPost?: () => void
    onPostAndNew?: () => void
    // More rows after Delete draft (checkpoint 5's).
    moreItems?: InvoiceMoreItem[]
    scopeOwner: ScopeOwner
}

const TAP = { minHeight: 44 }
const DELETE_DRAFT_HINT = formatHint(FORM_KEYS.deleteDraft).text

// Delete draft (its key is registered by the screen), then the caller's rows.
function useMoreItems({
    isSaving,
    canDeleteDraft,
    onDeleteDraft,
    moreItems = [],
}: InvoiceActionBarProps): InvoiceMoreItem[] {
    const deleteState = useServerActionState({ isDisabled: isSaving })
    if (!canDeleteDraft) return moreItems
    const deleteDraft: InvoiceMoreItem = {
        id: 'delete-draft',
        label: 'Delete draft',
        keys: DELETE_DRAFT_HINT,
        isDisabled: deleteState.isDisabled,
        onSelect: onDeleteDraft,
    }
    return [deleteDraft, ...moreItems]
}

const CANCEL_KEY = {
    keys: FORM_KEYS.cancel,
    scope: 'compose',
    allowInInputs: true,
    group: INVOICE_SHORTCUT_GROUP,
} as const

const SAVE_DRAFT_KEY = {
    keys: FORM_KEYS.saveDraft,
    scope: 'compose',
    allowInInputs: true,
    group: INVOICE_SHORTCUT_GROUP,
} as const

function MoreItems({ items }: { items: InvoiceMoreItem[] }) {
    const rows = items.map(item => (
        <Menu.Item
            key={item.id}
            testID={`invoice-${item.id}`}
            label={item.label}
            shortcut={item.keys}
            isDisabled={item.isDisabled}
            onSelect={item.onSelect}
        />
    ))
    return <>{rows}</>
}

function MoreMenu({ items, isSaving }: { items: InvoiceMoreItem[]; isSaving: boolean }) {
    if (items.length === 0) return null
    return (
        <Menu
            title="More"
            placement="top-end"
            trigger={
                <Button testID="invoice-more" variant="outline" style={TAP} isDisabled={isSaving}>
                    <ButtonText>More</ButtonText>
                </Button>
            }
        >
            <MoreItems items={items} />
        </Menu>
    )
}

/**
 * The form's sticky bar: Cancel (Esc), Save draft (⌘S) and More (Delete draft when the
 * invoice is a saved draft). Each button with a key is a core ShortcutButton in the
 * screen's scope; Save draft is a server action, so it and its key are idle offline.
 */
export function InvoiceActionBar(props: InvoiceActionBarProps) {
    const { isSaving, onCancel, onSaveDraft, scopeOwner } = props
    const moreItems = useMoreItems(props)
    return (
        <View
            testID="invoice-actions"
            className="flex-row items-center justify-end gap-2 border-t border-border bg-background px-4 py-3"
        >
            <ShortcutButton
                label="Cancel"
                shortcut={CANCEL_KEY}
                onPress={onCancel}
                variant="outline"
                isDisabled={isSaving}
                testID="invoice-cancel"
                scopeOwner={scopeOwner}
            />
            <ShortcutButton
                label="Save draft"
                shortcut={SAVE_DRAFT_KEY}
                onPress={onSaveDraft}
                serverAction
                isDisabled={isSaving}
                testID="invoice-save-draft"
                scopeOwner={scopeOwner}
            />
            <MoreMenu items={moreItems} isSaving={isSaving} />
        </View>
    )
}
