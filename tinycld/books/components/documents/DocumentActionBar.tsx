import { formatHint, type ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { useMemo } from 'react'
import { View } from 'react-native'
import { FORM_KEYS } from '../../lib/entry-shortcuts'
import { useDocumentKind } from './document-kind-context'

// A row of a More menu: its key text is shown on the row; the key itself is registered
// by the screen and does what the row does. The row's test id is `<kind test id>-<id>`.
export type DocumentMoreItem = {
    id: string
    label: string
    keys: string
    isDisabled: boolean
    isDestructive?: boolean
    onSelect: () => void
}

export interface DocumentActionBarProps {
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
    // More rows after Delete draft (Download PDF).
    moreItems?: DocumentMoreItem[]
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
}: DocumentActionBarProps): DocumentMoreItem[] {
    const writeState = useServerActionState({ isDisabled: isSaving })
    const postAndNew: DocumentMoreItem = {
        id: 'post-new',
        label: 'Post & new',
        keys: POST_AND_NEW_HINT,
        isDisabled: writeState.isDisabled,
        onSelect: onPostAndNew,
    }
    const deleteDraft: DocumentMoreItem = {
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

// The bar's keys, in the kind's shortcut group.
function barKeysOf(group: string) {
    const key = (keys: string) => ({ keys, scope: 'compose', allowInInputs: true, group }) as const
    return {
        cancel: key(FORM_KEYS.cancel),
        saveDraft: key(FORM_KEYS.saveDraft),
        post: key(FORM_KEYS.post),
        postAndNew: key(FORM_KEYS.postAndNew),
    }
}

function MoreItems({ items }: { items: DocumentMoreItem[] }) {
    const { doc } = useDocumentKind()
    const rowIds = items.map(item => `${doc.testId}-${item.id}`)
    const rows = items.map((item, index) => (
        <Menu.Item
            key={item.id}
            testID={rowIds[index]}
            label={item.label}
            shortcut={item.keys}
            isDisabled={item.isDisabled}
            isDestructive={item.isDestructive}
            onSelect={item.onSelect}
        />
    ))
    return <>{rows}</>
}

interface DocumentMoreMenuProps {
    items: DocumentMoreItem[]
    isDisabled: boolean
    testID: string
}

// The More menu of the form's bar and of the read view's phone bar.
export function DocumentMoreMenu({ items, isDisabled, testID }: DocumentMoreMenuProps) {
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
    shortcut: ReturnType<typeof barKeysOf>['postAndNew']
    testID: string
}

function PostAndNewButton({
    isVisible,
    isSaving,
    onPress,
    scopeOwner,
    shortcut,
    testID,
}: PostAndNewButtonProps) {
    if (!isVisible) return null
    return (
        <ShortcutButton
            label="Post & new"
            shortcut={shortcut}
            onPress={onPress}
            serverAction
            variant="outline"
            isDisabled={isSaving}
            testID={testID}
            scopeOwner={scopeOwner}
        />
    )
}

/**
 * The form's sticky bar, in Tab order: Cancel (Esc), Save draft (⌘S), Post (⌘↵), Post &
 * new (⌘⇧↵; a More row on a phone) and More (Delete draft when the document is a saved
 * draft; Download PDF, ⌘P). Each button with a key is a core ShortcutButton in the
 * screen's scope, in the kind's shortcut group; Save draft, Post and Post & new are
 * server actions, so they and their keys are idle offline.
 */
export function DocumentActionBar(props: DocumentActionBarProps) {
    const { isSaving, isPhone, onCancel, onSaveDraft, onPost, onPostAndNew, scopeOwner } = props
    const { doc } = useDocumentKind()
    const moreItems = useMoreItems(props)
    const keys = useMemo(() => barKeysOf(doc.shortcutGroup), [doc.shortcutGroup])
    const testId = doc.testId
    const ids = {
        actions: `${testId}-actions`,
        cancel: `${testId}-cancel`,
        saveDraft: `${testId}-save-draft`,
        post: `${testId}-post`,
        postAndNew: `${testId}-post-new`,
        more: `${testId}-more`,
    }
    return (
        <View
            testID={ids.actions}
            className="flex-row items-center justify-end gap-2 border-t border-border bg-background px-4 py-3"
        >
            <ShortcutButton
                label="Cancel"
                shortcut={keys.cancel}
                onPress={onCancel}
                variant="outline"
                isDisabled={isSaving}
                testID={ids.cancel}
                scopeOwner={scopeOwner}
            />
            <ShortcutButton
                label="Save draft"
                shortcut={keys.saveDraft}
                onPress={onSaveDraft}
                serverAction
                variant="outline"
                isDisabled={isSaving}
                testID={ids.saveDraft}
                scopeOwner={scopeOwner}
            />
            <ShortcutButton
                label="Post"
                shortcut={keys.post}
                onPress={onPost}
                serverAction
                isDisabled={isSaving}
                testID={ids.post}
                scopeOwner={scopeOwner}
            />
            <PostAndNewButton
                isVisible={!isPhone}
                isSaving={isSaving}
                onPress={onPostAndNew}
                scopeOwner={scopeOwner}
                shortcut={keys.postAndNew}
                testID={ids.postAndNew}
            />
            <DocumentMoreMenu items={moreItems} isDisabled={isSaving} testID={ids.more} />
        </View>
    )
}
