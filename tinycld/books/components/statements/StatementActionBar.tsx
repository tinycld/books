import type { ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { type ButtonShortcut, ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { View } from 'react-native'

// One button of the create screen's bar. `shortcut` is a module constant, so the button's
// key registration stays put across renders; `busyLabel` replaces `label` while `isBusy`.
export type StatementBarButton = {
    id: string
    label: string
    busyLabel: string
    shortcut: ButtonShortcut
    variant: 'primary' | 'outline'
    // A server write: also idle while the server cannot take writes.
    isServerAction: boolean
    isDisabled: boolean
    isBusy: boolean
    onPress(): void
}

interface BarButtonProps {
    button: StatementBarButton
    scopeOwner: ScopeOwner
}

function BarButton({ button, scopeOwner }: BarButtonProps) {
    const label = button.isBusy ? button.busyLabel : button.label
    const variant = button.variant === 'primary' ? undefined : 'outline'
    return (
        <ShortcutButton
            label={label}
            shortcut={button.shortcut}
            onPress={button.onPress}
            serverAction={button.isServerAction}
            variant={variant}
            isDisabled={button.isDisabled}
            testID={`statements-${button.id}`}
            scopeOwner={scopeOwner}
        />
    )
}

interface StatementActionBarProps {
    // In Tab order, left to right.
    actions: StatementBarButton[]
    scopeOwner: ScopeOwner
}

/**
 * The sticky bar of Create statements (spec §3.4): its buttons come as data, each a core
 * ShortcutButton with its key in the screen's scope, so a new action is one more entry.
 */
export function StatementActionBar({ actions, scopeOwner }: StatementActionBarProps) {
    const buttons = actions.map(button => (
        <BarButton key={button.id} button={button} scopeOwner={scopeOwner} />
    ))
    return (
        <View
            testID="statements-actions"
            className="gap-1 border-t border-border bg-background px-4 py-3"
        >
            <View className="flex-row items-center justify-end gap-2">{buttons}</View>
        </View>
    )
}
