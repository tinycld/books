import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { formatHint, type ScopeOwner } from '@tinycld/core/lib/shortcuts'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { Menu } from '@tinycld/core/ui/menu'
import { type ButtonShortcut, ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { useButtonShortcut } from '@tinycld/core/ui/shortcut-button/useButtonShortcut'
import { Text, View } from 'react-native'
import { WhileOpen } from '../RecordRowMenu'

const TAP = { minHeight: 44 }
const BAR_ROW = 'flex-row items-center justify-end gap-2'

// One button of the create screen's bar. `shortcut` is a module constant, so the button's
// key registration stays put across renders. `label` is the bar state's (statementBarState):
// it reads "Preparing…", "Saving…" or "Sending…" while that action runs.
export type StatementBarButton = {
    id: string
    label: string
    shortcut: ButtonShortcut
    variant: 'primary' | 'outline'
    // A server write: also idle while the server cannot take writes.
    isServerAction: boolean
    isDisabled: boolean
    onPress(): void
}

interface BarButtonProps {
    button: StatementBarButton
    scopeOwner: ScopeOwner
}

function BarButton({ button, scopeOwner }: BarButtonProps) {
    const variant = button.variant === 'primary' ? undefined : 'outline'
    return (
        <ShortcutButton
            label={button.label}
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

// The key of an action that sits in the phone's More menu: the menu row shows its hint, and
// the key stays in the screen's scope (a hardware keyboard on a phone or a tablet).
function MenuActionKey({ button, scopeOwner }: BarButtonProps) {
    useButtonShortcut({
        label: button.label,
        shortcut: button.shortcut,
        isDisabled: button.isDisabled,
        onPress: button.onPress,
        scopeOwner,
    })
    return null
}

function MenuAction({ button }: { button: StatementBarButton }) {
    const hint = formatHint(button.shortcut.keys).text
    return (
        <Menu.Item
            testID={`statements-${button.id}`}
            label={button.label}
            shortcut={hint}
            isDisabled={button.isDisabled}
            onSelect={button.onPress}
        />
    )
}

function EmailNote({ note }: { note: string | null }) {
    if (note === null) return null
    return (
        <Text testID="statements-email-note" className="text-right text-xs text-muted-foreground">
            {note}
        </Text>
    )
}

interface PhoneBarProps {
    primary: StatementBarButton
    others: StatementBarButton[]
    isMoreDisabled: boolean
    scopeOwner: ScopeOwner
}

// A phone: the primary and More (a core Menu, a sheet) with the other actions, the server
// actions first and the ones that only leave (Cancel) last (spec §3.4: Preview, Save,
// Cancel). The rows are rendered only while the menu is open (lesson 6).
function PhoneBarRow({ primary, others, isMoreDisabled, scopeOwner }: PhoneBarProps) {
    const keys = others.map(button => (
        <MenuActionKey key={button.id} button={button} scopeOwner={scopeOwner} />
    ))
    const menuOrder = [
        ...others.filter(button => button.isServerAction),
        ...others.filter(button => !button.isServerAction),
    ]
    const rows = menuOrder.map(button => <MenuAction key={button.id} button={button} />)
    const trigger = (
        <Button testID="statements-more" variant="outline" style={TAP} isDisabled={isMoreDisabled}>
            <ButtonText>More</ButtonText>
        </Button>
    )
    return (
        <View className={BAR_ROW}>
            {keys}
            <BarButton button={primary} scopeOwner={scopeOwner} />
            <Menu title="More" placement="top-end" trigger={trigger}>
                <WhileOpen>{rows}</WhileOpen>
            </Menu>
        </View>
    )
}

interface StatementActionBarProps {
    // In Tab order, left to right; the last one is the primary.
    actions: StatementBarButton[]
    // The line under the bar (statementBarState's `note`), or null.
    note: string | null
    // More is idle while a run is in flight, as the bar's buttons are.
    isMoreDisabled: boolean
    scopeOwner: ScopeOwner
}

/**
 * The sticky bar of Create statements (spec §3.4): its buttons come as data, each a core
 * ShortcutButton with its key in the screen's scope. On a phone the bar holds the primary
 * and a More menu with the others, whose keys stay registered. The note under the bar says
 * why Save and send is idle when the server cannot send email.
 */
export function StatementActionBar({
    actions,
    note,
    isMoreDisabled,
    scopeOwner,
}: StatementActionBarProps) {
    const isPhone = useBreakpoint() === 'mobile'
    const primary = actions[actions.length - 1]
    const others = actions.slice(0, -1)
    const buttons = actions.map(button => (
        <BarButton key={button.id} button={button} scopeOwner={scopeOwner} />
    ))
    const row = isPhone ? (
        <PhoneBarRow
            primary={primary}
            others={others}
            isMoreDisabled={isMoreDisabled}
            scopeOwner={scopeOwner}
        />
    ) : (
        <View className={BAR_ROW}>{buttons}</View>
    )
    return (
        <View
            testID="statements-actions"
            className="gap-1 border-t border-border bg-background px-4 py-3"
        >
            {row}
            <EmailNote note={note} />
        </View>
    )
}
