import { formatHint, type ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { useMemo } from 'react'
import { View } from 'react-native'
import { FORM_KEYS } from '../../lib/entry-shortcuts'
import { useDocumentChrome } from './document-chrome'

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
    // More rows after Delete draft (Download PDF, on a kind with a PDF).
    moreItems?: DocumentMoreItem[]
    scopeOwner: ScopeOwner
}

// A button of the bar. Its test id is `<kind test id>-<id>`; on a phone a `wideOnly` action
// leaves the bar for the first rows of More, with the same test id and its key text.
export type DocumentBarAction = {
    id: string
    label: string
    // The action's key (a `FORM_KEYS` value), registered by the button in the screen's
    // scope and the kind's shortcut group.
    keys: string
    onPress: () => void
    // The filled button; the others are outlined.
    isPrimary?: boolean
    // A server write: idle offline, as is its More row.
    isServerAction?: boolean
    wideOnly?: boolean
}

const TAP = { minHeight: 44 }
const DELETE_DRAFT_HINT = formatHint(FORM_KEYS.deleteDraft).text
const KEY_SEPARATOR = '|'

// A button's key, in the kind's shortcut group.
function barKeyOf(keys: string, group: string) {
    return { keys, scope: 'compose', allowInInputs: true, group } as const
}

type BarKey = ReturnType<typeof barKeyOf>

// The bar's keys by key text, made again only when the group or the key set changes, so
// a button's registration stays put across renders.
function useBarKeys(actions: readonly DocumentBarAction[], group: string): Map<string, BarKey> {
    const signature = actions.map(action => action.keys).join(KEY_SEPARATOR)
    return useMemo(
        () => new Map(signature.split(KEY_SEPARATOR).map(keys => [keys, barKeyOf(keys, group)])),
        [signature, group]
    )
}

// On a phone, the `wideOnly` actions as the leading More rows (their keys are registered
// by the screen), then the caller's rows. A server action's row is idle while the bar is
// saving or the server cannot take writes.
function useMoreItems(
    actions: readonly DocumentBarAction[],
    isPhone: boolean,
    isSaving: boolean,
    moreItems: DocumentMoreItem[]
): DocumentMoreItem[] {
    const writeState = useServerActionState({ isDisabled: isSaving })
    const moved = isPhone ? actions.filter(action => action.wideOnly) : []
    const leading = moved.map(action => ({
        id: action.id,
        label: action.label,
        keys: formatHint(action.keys).text,
        isDisabled: action.isServerAction ? writeState.isDisabled : isSaving,
        onSelect: action.onPress,
    }))
    return [...leading, ...moreItems]
}

// Menu content: on native the overlay host renders it outside the screen's tree, where
// the chrome context does not reach, so the row test-id prefix comes in as a prop.
function MoreItems({ items, rowIdPrefix }: { items: DocumentMoreItem[]; rowIdPrefix: string }) {
    const rowIds = items.map(item => `${rowIdPrefix}-${item.id}`)
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
    const doc = useDocumentChrome()
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
            <MoreItems items={items} rowIdPrefix={doc.testId} />
        </Menu>
    )
}

interface BarButtonProps {
    action: DocumentBarAction
    isVisible: boolean
    isSaving: boolean
    shortcut: BarKey | undefined
    testID: string
    scopeOwner: ScopeOwner
}

function BarButton({ action, isVisible, isSaving, shortcut, testID, scopeOwner }: BarButtonProps) {
    if (!isVisible || !shortcut) return null
    const variant = action.isPrimary ? undefined : 'outline'
    return (
        <ShortcutButton
            label={action.label}
            shortcut={shortcut}
            onPress={action.onPress}
            serverAction={action.isServerAction}
            variant={variant}
            isDisabled={isSaving}
            testID={testID}
            scopeOwner={scopeOwner}
        />
    )
}

export interface DocumentBarProps {
    // In Tab order.
    actions: DocumentBarAction[]
    isSaving: boolean
    // A phone moves the `wideOnly` actions into More.
    isPhone: boolean
    // More rows after the moved actions.
    moreItems?: DocumentMoreItem[]
    scopeOwner: ScopeOwner
}

/**
 * A form's sticky bar: the caller's actions in Tab order, then More (on a phone the
 * `wideOnly` actions, then the caller's rows). Each button is a core ShortcutButton in
 * the screen's scope, in the kind's shortcut group; a server action and its key are idle
 * offline, and so is its More row. Every button waits while the bar is saving.
 */
export function DocumentBar({
    actions,
    isSaving,
    isPhone,
    moreItems = [],
    scopeOwner,
}: DocumentBarProps) {
    const doc = useDocumentChrome()
    const keys = useBarKeys(actions, doc.shortcutGroup)
    const items = useMoreItems(actions, isPhone, isSaving, moreItems)
    const testId = doc.testId
    const buttons = actions.map(action => (
        <BarButton
            key={action.id}
            action={action}
            isVisible={!(isPhone && action.wideOnly)}
            isSaving={isSaving}
            shortcut={keys.get(action.keys)}
            testID={`${testId}-${action.id}`}
            scopeOwner={scopeOwner}
        />
    ))
    return (
        <View
            testID={`${testId}-actions`}
            className="flex-row items-center justify-end gap-2 border-t border-border bg-background px-4 py-3"
        >
            {buttons}
            <DocumentMoreMenu items={items} isDisabled={isSaving} testID={`${testId}-more`} />
        </View>
    )
}

/**
 * A posting document's bar, in Tab order: Cancel (Esc), Save draft (⌘S), Post (⌘↵), Post &
 * new (⌘⇧↵; a More row on a phone) and More (Delete draft when the document is a saved
 * draft; then the caller's rows: Download PDF, ⌘P, on a kind with a PDF, which the form
 * passes only then). Save draft, Post and Post & new are server actions.
 */
export function DocumentActionBar({
    isSaving,
    canDeleteDraft,
    isPhone,
    onCancel,
    onSaveDraft,
    onPost,
    onPostAndNew,
    onDeleteDraft,
    moreItems = [],
    scopeOwner,
}: DocumentActionBarProps) {
    const writeState = useServerActionState({ isDisabled: isSaving })
    const actions: DocumentBarAction[] = [
        { id: 'cancel', label: 'Cancel', keys: FORM_KEYS.cancel, onPress: onCancel },
        {
            id: 'save-draft',
            label: 'Save draft',
            keys: FORM_KEYS.saveDraft,
            onPress: onSaveDraft,
            isServerAction: true,
        },
        {
            id: 'post',
            label: 'Post',
            keys: FORM_KEYS.post,
            onPress: onPost,
            isPrimary: true,
            isServerAction: true,
        },
        {
            id: 'post-new',
            label: 'Post & new',
            keys: FORM_KEYS.postAndNew,
            onPress: onPostAndNew,
            isServerAction: true,
            wideOnly: true,
        },
    ]
    const deleteDraft: DocumentMoreItem = {
        id: 'delete-draft',
        label: 'Delete draft',
        keys: DELETE_DRAFT_HINT,
        isDisabled: writeState.isDisabled,
        onSelect: onDeleteDraft,
    }
    const draftRows = canDeleteDraft ? [deleteDraft] : []
    return (
        <DocumentBar
            actions={actions}
            isSaving={isSaving}
            isPhone={isPhone}
            moreItems={[...draftRows, ...moreItems]}
            scopeOwner={scopeOwner}
        />
    )
}
