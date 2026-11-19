import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { Menu } from '@tinycld/core/ui/menu'
import { ShortcutButton } from '@tinycld/core/ui/shortcut-button'
import { router } from 'expo-router'
import { ChevronDown } from 'lucide-react-native'
import { useRef } from 'react'
import { Text, View, type ViewInstance } from 'react-native'
import type { DocumentPartyKey } from '../../../lib/sales-document-kinds'
import {
    transactionActions,
    transactionHref,
    transactionItemTestId,
} from '../../../lib/transaction-actions'
import { WhileOpen } from '../../RecordRowMenu'

// The page's header sits inside RecordSurface, whose `modal` scope is the top one on the
// page: a `compose` key would never fire there.
const NEW_TRANSACTION_KEY = { keys: 'Alt+n', scope: 'modal', allowInInputs: true } as const

const PARTY_NOUN: Record<DocumentPartyKey, string> = { customer: 'customer', vendor: 'vendor' }

// The menu items of each party: the actions that take it, in NEW_ACTIONS order.
const ACTIONS = {
    customer: transactionActions('customer'),
    vendor: transactionActions('vendor'),
} satisfies Record<DocumentPartyKey, ReturnType<typeof transactionActions>>

function DisabledHint({
    isVisible,
    text,
    testIdPrefix,
}: {
    isVisible: boolean
    text: string
    testIdPrefix: string
}) {
    if (!isVisible) return null
    return (
        <Text
            testID={`${testIdPrefix}-new-transaction-hint`}
            className="max-w-60 text-xs text-muted-foreground"
        >
            {text}
        </Text>
    )
}

interface NewTransactionMenuProps {
    party: DocumentPartyKey
    id: string
    isVisible: boolean
    isDisabled: boolean
    isFullWidth: boolean
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    testIdPrefix: string
}

/**
 * "New transaction" (⌥N): a menu of the transactions that take the party (a sheet on a
 * phone). Each opens its new document for this record, pushed over the page, so Back
 * returns to the page with its edits. Disabled for an inactive record, with the reason
 * under it; not drawn for a reader.
 */
export function NewTransactionMenu({
    party,
    id,
    isVisible,
    isDisabled,
    isFullWidth,
    isOpen,
    onOpenChange,
    testIdPrefix,
}: NewTransactionMenuProps) {
    const orgHref = useOrgHref()
    const anchorRef = useRef<ViewInstance>(null)
    if (!isVisible) return null
    const open = () => onOpenChange(true)
    const items = ACTIONS[party].map(action => {
        const select = () => router.push(orgHref(transactionHref(party, action.id, id)))
        return (
            <Menu.Item
                key={action.id}
                label={action.label}
                testID={transactionItemTestId(testIdPrefix, action.id)}
                onSelect={select}
            />
        )
    })
    const inactiveHint = `Make this ${PARTY_NOUN[party]} active to add transactions.`
    const hint = isDisabled ? inactiveHint : undefined
    const wrapClass = isFullWidth ? 'w-full gap-1' : 'gap-1'
    const buttonClass = isFullWidth ? 'w-full' : undefined
    return (
        <View ref={anchorRef} className={wrapClass}>
            <ShortcutButton
                testID={`${testIdPrefix}-new-transaction`}
                label="New transaction"
                icon={ChevronDown}
                shortcut={NEW_TRANSACTION_KEY}
                onPress={open}
                isDisabled={isDisabled}
                className={buttonClass}
                accessibilityHint={hint}
            />
            <DisabledHint isVisible={isDisabled} text={inactiveHint} testIdPrefix={testIdPrefix} />
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
