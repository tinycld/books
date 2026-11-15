import { formatHint, type ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { useServerActionState } from '@tinycld/core/lib/use-writes-available'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { useMemo } from 'react'
import { View } from 'react-native'
import { QUOTE_FORM_KEYS } from '../../lib/entry-shortcuts'
import { type DocumentMoreItem, DocumentMoreMenu } from './DocumentActionBar'
import { useDocumentKind } from './document-kind-context'

// An action the bar offers only sometimes (Convert to invoice, Delete): null while the
// form has none, `isOffered` while it has one but not now.
type OptionalAction = { isOffered: boolean; onPress: () => void } | null

export interface DocumentSaveBarProps {
    isSaving: boolean
    // A phone keeps Cancel, Save & close and More on the row; the rest are More rows.
    isPhone: boolean
    onCancel: () => void
    onSave: () => void
    onSaveAndClose: () => void
    onSaveAndNew: () => void
    convert: OptionalAction
    // Copy customer link: a stored estimate's, while its token is known.
    copyLink: OptionalAction
    remove: OptionalAction
    // More rows after the bar's own (Download PDF).
    moreItems?: DocumentMoreItem[]
    scopeOwner: ScopeOwner
}

const SAVE_HINT = formatHint(QUOTE_FORM_KEYS.save).text
const SAVE_AND_NEW_HINT = formatHint(QUOTE_FORM_KEYS.saveAndNew).text
const CONVERT_HINT = formatHint(QUOTE_FORM_KEYS.convert).text
const COPY_LINK_HINT = formatHint(QUOTE_FORM_KEYS.copyLink).text
const COPY_LINK_LABEL = 'Copy customer link'
const DELETE_HINT = formatHint(QUOTE_FORM_KEYS.deleteRecord).text

// The bar's keys, in the kind's shortcut group.
function barKeysOf(group: string) {
    const key = (keys: string) => ({ keys, scope: 'compose', allowInInputs: true, group }) as const
    return {
        cancel: key(QUOTE_FORM_KEYS.cancel),
        save: key(QUOTE_FORM_KEYS.save),
        saveAndClose: key(QUOTE_FORM_KEYS.saveAndClose),
        saveAndNew: key(QUOTE_FORM_KEYS.saveAndNew),
        convert: key(QUOTE_FORM_KEYS.convert),
        copyLink: key(QUOTE_FORM_KEYS.copyLink),
        remove: key(QUOTE_FORM_KEYS.deleteRecord),
    }
}

type BarKey = ReturnType<typeof barKeysOf>[keyof ReturnType<typeof barKeysOf>]

// On a phone: Save, Save & new, then Convert, Copy customer link and Delete when offered
// (their keys are registered by useDocumentShortcuts), then the caller's rows. On a wide
// screen only the caller's rows: every other action is a button.
function useMoreItems(props: DocumentSaveBarProps, noun: string): DocumentMoreItem[] {
    const { isSaving, isPhone, onSave, onSaveAndNew, convert, copyLink, remove } = props
    const { moreItems = [] } = props
    const writeState = useServerActionState({ isDisabled: isSaving })
    if (!isPhone) return moreItems
    const row = (id: string, label: string, keys: string, onSelect: () => void) => ({
        id,
        label,
        keys,
        isDisabled: writeState.isDisabled,
        onSelect,
    })
    const rows: DocumentMoreItem[] = [
        row('save', 'Save', SAVE_HINT, onSave),
        row('save-new', 'Save & new', SAVE_AND_NEW_HINT, onSaveAndNew),
    ]
    if (convert?.isOffered)
        rows.push(row('convert', 'Convert to invoice', CONVERT_HINT, convert.onPress))
    if (copyLink?.isOffered)
        rows.push(row('copy-link', COPY_LINK_LABEL, COPY_LINK_HINT, copyLink.onPress))
    if (remove?.isOffered) {
        rows.push({
            ...row('delete', `Delete ${noun}`, DELETE_HINT, remove.onPress),
            isDestructive: true,
        })
    }
    return [...rows, ...moreItems]
}

interface BarButtonProps {
    isVisible: boolean
    label: string
    shortcut: BarKey
    onPress: () => void
    isSaving: boolean
    // Writes to the server: idle offline.
    isServerAction: boolean
    isPrimary?: boolean
    testID: string
    scopeOwner: ScopeOwner
}

function BarButton({
    isVisible,
    label,
    shortcut,
    onPress,
    isSaving,
    isServerAction,
    isPrimary = false,
    testID,
    scopeOwner,
}: BarButtonProps) {
    if (!isVisible) return null
    const variant = isPrimary ? undefined : 'outline'
    return (
        <ShortcutButton
            label={label}
            shortcut={shortcut}
            onPress={onPress}
            serverAction={isServerAction}
            variant={variant}
            isDisabled={isSaving}
            testID={testID}
            scopeOwner={scopeOwner}
        />
    )
}

const NOOP = () => {}

/**
 * A document's sticky bar (estimate, invoice, sales receipt). Wide, in Tab order: Cancel
 * (Esc), Delete (⌘⌫, when offered), Convert to invoice (⌥I, when offered), Copy customer
 * link (⌥L, when offered), Save (⌘S), Save & close (⌘↵, primary), Save & new (⌘⇧↵) and
 * More (the caller's rows: Download PDF). The wide bar wraps, right-aligned, onto a
 * second row when its buttons are wider than the content area (a tablet, or a narrow
 * desktop with the sidebar open), so no button is cut off and each keeps its own key at
 * every width. A phone keeps Cancel, Save & close and More on one row; Save, Save & new,
 * Convert, Copy customer link and Delete are More rows there, and useDocumentShortcuts
 * registers their keys. Each button is a core ShortcutButton in the screen's scope and
 * the kind's shortcut group; every one but Cancel and Copy customer link writes, so it
 * and its key are idle offline (Copy customer link is not offered offline:
 * `copyLink.isOffered`).
 */
export function DocumentSaveBar(props: DocumentSaveBarProps) {
    const { isSaving, isPhone, onCancel, onSave, onSaveAndClose, onSaveAndNew, scopeOwner } = props
    const { convert, copyLink, remove } = props
    const { doc } = useDocumentKind()
    const noun = doc.noun.toLowerCase()
    const moreItems = useMoreItems(props, noun)
    const keys = useMemo(() => barKeysOf(doc.shortcutGroup), [doc.shortcutGroup])
    const isWide = !isPhone
    const testId = doc.testId
    const ids = {
        actions: `${testId}-actions`,
        cancel: `${testId}-cancel`,
        remove: `${testId}-delete`,
        convert: `${testId}-convert`,
        copyLink: `${testId}-copy-link`,
        save: `${testId}-save`,
        saveAndClose: `${testId}-save-close`,
        saveAndNew: `${testId}-save-new`,
        more: `${testId}-more`,
    }
    const shared = { isSaving, scopeOwner }
    return (
        <View
            testID={ids.actions}
            className="flex-row flex-wrap items-center justify-end gap-2 border-t border-border bg-background px-4 py-3"
        >
            <BarButton
                {...shared}
                isVisible
                label="Cancel"
                shortcut={keys.cancel}
                onPress={onCancel}
                isServerAction={false}
                testID={ids.cancel}
            />
            <BarButton
                {...shared}
                isVisible={isWide && remove?.isOffered === true}
                label={`Delete ${noun}`}
                shortcut={keys.remove}
                onPress={remove?.onPress ?? NOOP}
                isServerAction
                testID={ids.remove}
            />
            <BarButton
                {...shared}
                isVisible={isWide && convert?.isOffered === true}
                label="Convert to invoice"
                shortcut={keys.convert}
                onPress={convert?.onPress ?? NOOP}
                isServerAction
                testID={ids.convert}
            />
            <BarButton
                {...shared}
                isVisible={isWide && copyLink?.isOffered === true}
                label={COPY_LINK_LABEL}
                shortcut={keys.copyLink}
                onPress={copyLink?.onPress ?? NOOP}
                isServerAction={false}
                testID={ids.copyLink}
            />
            <BarButton
                {...shared}
                isVisible={isWide}
                label="Save"
                shortcut={keys.save}
                onPress={onSave}
                isServerAction
                testID={ids.save}
            />
            <BarButton
                {...shared}
                isVisible
                label="Save & close"
                shortcut={keys.saveAndClose}
                onPress={onSaveAndClose}
                isServerAction
                isPrimary
                testID={ids.saveAndClose}
            />
            <BarButton
                {...shared}
                isVisible={isWide}
                label="Save & new"
                shortcut={keys.saveAndNew}
                onPress={onSaveAndNew}
                isServerAction
                testID={ids.saveAndNew}
            />
            <DocumentMoreMenu items={moreItems} isDisabled={isSaving} testID={ids.more} />
        </View>
    )
}
