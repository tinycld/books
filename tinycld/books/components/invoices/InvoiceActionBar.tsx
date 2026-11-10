import { formatHint, type ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { View } from 'react-native'
import { INVOICE_SHORTCUT_GROUP } from '../../hooks/useInvoiceShortcuts'
import { FORM_KEYS } from '../../lib/entry-shortcuts'

// A row of a More menu: its key text is shown on the row; the key itself is registered
// by the screen and does what the row does. The row's test id is `invoice-<id>`.
export type InvoiceMoreItem = {
    id: string
    label: string
    keys: string
    isDisabled: boolean
    isDestructive?: boolean
    onSelect: () => void
}

export interface InvoiceActionBarProps {
    isSaving: boolean
    // The form is a saved draft the user may delete: More then holds Delete draft.
    canDeleteDraft: boolean
    // A phone puts Post & new in More.
    isPhone: boolean
    onCancel: () => void
    onSaveDraft: () => void
    onPost: () => void
    onPostAndNew: () => void
    onDeleteDraft: () => void
    // More rows after Delete draft (the PDF tab's Download PDF).
    moreItems?: InvoiceMoreItem[]
    scopeOwner: ScopeOwner
}

const TAP = { minHeight: 44 }
const DELETE_DRAFT_HINT = formatHint(FORM_KEYS.deleteDraft).text
const POST_AND_NEW_HINT = formatHint(FORM_KEYS.postAndNew).text

// Post & new on a phone, Delete draft (both keys registered by the screen), then the
// caller's rows.
function useMoreItems({
    isSaving,
    canDeleteDraft,
    isPhone,
    onPostAndNew,
    onDeleteDraft,
    moreItems = [],
}: InvoiceActionBarProps): InvoiceMoreItem[] {
    const writeState = useServerActionState({ isDisabled: isSaving })
    const postAndNew: InvoiceMoreItem = {
        id: 'post-new',
        label: 'Post & new',
        keys: POST_AND_NEW_HINT,
        isDisabled: writeState.isDisabled,
        onSelect: onPostAndNew,
    }
    const deleteDraft: InvoiceMoreItem = {
        id: 'delete-draft',
        label: 'Delete draft',
        keys: DELETE_DRAFT_HINT,
        isDisabled: writeState.isDisabled,
        onSelect: onDeleteDraft,
    }
    const leading = isPhone ? [postAndNew] : []
    const draftRows = canDeleteDraft ? [deleteDraft] : []
    return [...leading, ...draftRows, ...moreItems]
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

const POST_KEY = {
    keys: FORM_KEYS.post,
    scope: 'compose',
    allowInInputs: true,
    group: INVOICE_SHORTCUT_GROUP,
} as const

const POST_AND_NEW_KEY = {
    keys: FORM_KEYS.postAndNew,
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
            isDestructive={item.isDestructive}
            onSelect={item.onSelect}
        />
    ))
    return <>{rows}</>
}

interface InvoiceMoreMenuProps {
    items: InvoiceMoreItem[]
    isDisabled: boolean
    testID: string
}

// The More menu of the form's bar and of the read view's phone bar.
export function InvoiceMoreMenu({ items, isDisabled, testID }: InvoiceMoreMenuProps) {
    if (items.length === 0) return null
    return (
        <Menu
            title="More"
            placement="top-end"
            trigger={
                <Button testID={testID} variant="outline" style={TAP} isDisabled={isDisabled}>
                    <ButtonText>More</ButtonText>
                </Button>
            }
        >
            <MoreItems items={items} />
        </Menu>
    )
}

interface PostAndNewButtonProps {
    isVisible: boolean
    isSaving: boolean
    onPress: () => void
    scopeOwner: ScopeOwner
}

function PostAndNewButton({ isVisible, isSaving, onPress, scopeOwner }: PostAndNewButtonProps) {
    if (!isVisible) return null
    return (
        <ShortcutButton
            label="Post & new"
            shortcut={POST_AND_NEW_KEY}
            onPress={onPress}
            serverAction
            variant="outline"
            isDisabled={isSaving}
            testID="invoice-post-new"
            scopeOwner={scopeOwner}
        />
    )
}

/**
 * The form's sticky bar, in Tab order: Cancel (Esc), Save draft (⌘S), Post (⌘↵), Post &
 * new (⌘⇧↵; a More row on a phone) and More (Delete draft when the invoice is a saved
 * draft). Each button with a key is a core ShortcutButton in the screen's scope; Save
 * draft, Post and Post & new are server actions, so they and their keys are idle
 * offline.
 */
export function InvoiceActionBar(props: InvoiceActionBarProps) {
    const { isSaving, isPhone, onCancel, onSaveDraft, onPost, onPostAndNew, scopeOwner } = props
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
                variant="outline"
                isDisabled={isSaving}
                testID="invoice-save-draft"
                scopeOwner={scopeOwner}
            />
            <ShortcutButton
                label="Post"
                shortcut={POST_KEY}
                onPress={onPost}
                serverAction
                isDisabled={isSaving}
                testID="invoice-post"
                scopeOwner={scopeOwner}
            />
            <PostAndNewButton
                isVisible={!isPhone}
                isSaving={isSaving}
                onPress={onPostAndNew}
                scopeOwner={scopeOwner}
            />
            <InvoiceMoreMenu items={moreItems} isDisabled={isSaving} testID="invoice-more" />
        </View>
    )
}
