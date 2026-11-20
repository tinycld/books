import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import {
    formatHint,
    type ScopeOwner,
    type Shortcut,
    useRegisterShortcuts,
} from '@tinycld/core/lib/shortcuts'
import { useWritesAvailable } from '@tinycld/core/lib/use-writes-available'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { router } from 'expo-router'
import { useId, useMemo, useRef } from 'react'
import { View } from 'react-native'
import { useOpenDocument } from '../../hooks/useOpenDocument'
import { INVOICE_KIND } from '../../lib/sales-document-kinds'
import {
    WRITE_OFF_ACTION_KEYS,
    WRITE_OFF_ACTION_LABELS,
    type WriteOffAction,
    writeOffReadActions,
    writeOffVoidDisabled,
} from '../../lib/write-off-actions'
import { type DocumentMoreItem, DocumentMoreMenu } from '../documents/DocumentActionBar'

const GROUP = 'Write-off'
const BAR =
    'flex-row flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-4 py-2'

type BarItem = DocumentMoreItem & { action: WriteOffAction }

const ALL_ACTIONS: readonly WriteOffAction[] = ['void', 'invoice', 'entry']

interface WriteOffReadActionsProps {
    writeOff: { status: string; entry: string; invoiceId: string }
    canWrite: boolean
    // A void runs: Void, the other actions and More are idle.
    isVoidPending: boolean
    onVoid: () => void
    scopeOwner: ScopeOwner
}

// The bar's rows: Void (writer on a posted write-off), Open invoice, View journal entry.
// Void writes, so it is idle offline (writeOffVoidDisabled); the others only open a screen.
function useBarItems({
    writeOff,
    canWrite,
    isVoidPending,
    onVoid,
}: Omit<WriteOffReadActionsProps, 'scopeOwner'>): BarItem[] {
    const orgHref = useOrgHref()
    const writesAvailable = useWritesAvailable().available
    const isVoidDisabled = writeOffVoidDisabled({ writesAvailable, isPending: isVoidPending })
    // Pops to the invoice when this page was opened from it (lesson 12), else pushes it.
    const openInvoice = useOpenDocument(INVOICE_KIND, writeOff.invoiceId)
    const run: Record<WriteOffAction, () => void> = {
        void: onVoid,
        invoice: openInvoice,
        entry: () => router.push(orgHref(`books/entries/${writeOff.entry}`)),
    }
    const disabled: Record<WriteOffAction, boolean> = {
        void: isVoidDisabled,
        invoice: isVoidPending,
        entry: isVoidPending || writeOff.entry === '',
    }
    return writeOffReadActions(writeOff.status, canWrite).map(action => ({
        action,
        id: `read-${action}`,
        label: WRITE_OFF_ACTION_LABELS[action],
        keys: formatHint(WRITE_OFF_ACTION_KEYS[action]).text,
        isDisabled: disabled[action],
        isDestructive: action === 'void',
        onSelect: run[action],
    }))
}

// The keys of the rows a phone puts in More: the rows have no ShortcutButton, so their keys
// are registered here, only for the rows offered; `when` reads a row's state at press time.
function useMoreKeys(items: BarItem[], scopeOwner: ScopeOwner) {
    const instance = useId()
    const itemsRef = useRef(items)
    itemsRef.current = items
    const names = items.map(item => item.action).join(',')
    const shortcuts = useMemo<Shortcut[]>(() => {
        const offered = names.split(',')
        const actions = ALL_ACTIONS.filter(action => offered.includes(action))
        const current = (action: WriteOffAction) =>
            itemsRef.current.find(item => item.action === action)
        return actions.map(action => ({
            id: `books.write-off.read.${instance}.${action}`,
            keys: WRITE_OFF_ACTION_KEYS[action],
            scope: 'compose' as const,
            description: WRITE_OFF_ACTION_LABELS[action],
            group: GROUP,
            when: () => current(action)?.isDisabled === false,
            run: () => current(action)?.onSelect(),
        }))
    }, [instance, names])
    useRegisterShortcuts(shortcuts, scopeOwner)
}

function BarButton({
    item,
    isPrimary,
    scopeOwner,
}: {
    item: BarItem
    isPrimary: boolean
    scopeOwner: ScopeOwner
}) {
    const variant = isPrimary ? 'default' : 'outline'
    const shortcut = {
        keys: WRITE_OFF_ACTION_KEYS[item.action],
        scope: 'compose',
        group: GROUP,
    } as const
    return (
        <ShortcutButton
            label={item.label}
            shortcut={shortcut}
            onPress={item.onSelect}
            variant={variant}
            isDisabled={item.isDisabled}
            testID={`write-off-${item.id}`}
            scopeOwner={scopeOwner}
        />
    )
}

/**
 * The write-off page's bar (write-off spec §3.5). Wide: a ShortcutButton per action, Void V
 * (writer on posted), Open invoice I, View journal entry J, the first one primary. Phone:
 * the first action stays a button (Void when it is offered) and the others are rows of
 * More with their keys. A hidden action's key is not registered.
 */
export function WriteOffReadActions({ scopeOwner, ...props }: WriteOffReadActionsProps) {
    const isPhone = useBreakpoint() === 'mobile'
    const items = useBarItems(props)
    const inBar = isPhone ? items.slice(0, 1) : items
    const inMore = isPhone ? items.slice(1) : []
    useMoreKeys(inMore, scopeOwner)
    const buttons = inBar.map((item, index) => (
        <BarButton key={item.id} item={item} isPrimary={index === 0} scopeOwner={scopeOwner} />
    ))
    return (
        <View testID="write-off-read-actions" className={BAR}>
            <DocumentMoreMenu
                items={inMore}
                isDisabled={props.isVoidPending}
                testID="write-off-read-more"
            />
            {buttons}
        </View>
    )
}
