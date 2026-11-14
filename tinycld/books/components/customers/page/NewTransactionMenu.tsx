import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { Menu } from '@tinycld/core/ui/menu'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { router } from 'expo-router'
import { ChevronDown } from 'lucide-react-native'
import { useRef } from 'react'
import { Text, View, type ViewInstance } from 'react-native'
import { transactionActions, transactionHref } from '../../../lib/transaction-actions'
import { WhileOpen } from '../../RecordRowMenu'

// The page's header sits inside RecordSurface, whose `modal` scope is the top one on the
// page: a `compose` key would never fire there.
const NEW_TRANSACTION_KEY = { keys: 'Alt+n', scope: 'modal', allowInInputs: true } as const

const INACTIVE_HINT = 'Make this customer active to add transactions.'

const ACTIONS = transactionActions()

function DisabledHint({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text
            testID="customer-new-transaction-hint"
            className="max-w-60 text-xs text-muted-foreground"
        >
            {INACTIVE_HINT}
        </Text>
    )
}

interface NewTransactionMenuProps {
    customerId: string
    isVisible: boolean
    isDisabled: boolean
    isFullWidth: boolean
    isOpen: boolean
    onOpenChange: (open: boolean) => void
}

/**
 * "New transaction" (⌥N): a menu of the transactions that take a customer (a sheet on a
 * phone). Each opens its new document for this customer, pushed over the page, so Back
 * returns to the page with its edits. Disabled for an inactive customer, with the reason
 * under it; not drawn for a reader.
 */
export function NewTransactionMenu({
    customerId,
    isVisible,
    isDisabled,
    isFullWidth,
    isOpen,
    onOpenChange,
}: NewTransactionMenuProps) {
    const orgHref = useOrgHref()
    const anchorRef = useRef<ViewInstance>(null)
    if (!isVisible) return null
    const open = () => onOpenChange(true)
    const items = ACTIONS.map(action => {
        const select = () => router.push(orgHref(transactionHref(action.id, customerId)))
        return (
            <Menu.Item
                key={action.id}
                label={action.label}
                testID={action.testId}
                onSelect={select}
            />
        )
    })
    const hint = isDisabled ? INACTIVE_HINT : undefined
    const wrapClass = isFullWidth ? 'w-full gap-1' : 'gap-1'
    const buttonClass = isFullWidth ? 'w-full' : undefined
    return (
        <View ref={anchorRef} className={wrapClass}>
            <ShortcutButton
                testID="customer-new-transaction"
                label="New transaction"
                icon={ChevronDown}
                shortcut={NEW_TRANSACTION_KEY}
                onPress={open}
                isDisabled={isDisabled}
                className={buttonClass}
                accessibilityHint={hint}
            />
            <DisabledHint isVisible={isDisabled} />
            <Menu
                anchor={anchorRef}
                isOpen={isOpen}
                onOpenChange={onOpenChange}
                title="New transaction"
                sheetSide="bottom"
                placement="bottom-end"
                presentation="auto"
            >
                <WhileOpen>{items}</WhileOpen>
            </Menu>
        </View>
    )
}
