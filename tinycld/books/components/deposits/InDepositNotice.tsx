import { Text, View } from 'react-native'
import { useOpenDocument } from '../../hooks/useOpenDocument'
import { inDepositText } from '../../lib/deposit'
import { TextLink } from '../payments/read-view-parts'

const DEPOSIT_ROUTE = { routeBase: 'books/deposits' }

interface InDepositNoticeProps {
    // The posted deposit that holds the document (hooks/useDepositOf); nothing shows without one.
    deposit: { id: string; number: string } | null
    // The document's own noun: payment, sales receipt, vendor refund, refund receipt.
    noun: string
    // A reader is never offered Edit or Void, so the reason they are not offered is not shown.
    canWrite: boolean
    isVisible: boolean
}

interface ReasonProps {
    text: string
    isVisible: boolean
}

function InDepositReason({ text, isVisible }: ReasonProps) {
    if (!isVisible) return null
    return <Text className="min-w-0 shrink py-2 text-sm text-muted-foreground">{text}</Text>
}

/**
 * The notice under the header of a deposited document's read view (bank deposit spec
 * §3.10): "In Deposit 1002", a link to the deposit, for every reader; and, for a writer
 * only (`canWrite`), the reason Edit and Void are not offered. The link pops back to the
 * deposit when its screen is below this one (the document was opened from it), so the
 * stack keeps one copy of each screen; else it pushes the deposit (useOpenDocument). It
 * wraps inside the page on a phone.
 */
export function InDepositNotice({ deposit, noun, canWrite, isVisible }: InDepositNoticeProps) {
    const open = useOpenDocument(DEPOSIT_ROUTE, deposit?.id ?? '')
    if (!isVisible || !deposit) return null
    const linkText = `In Deposit ${deposit.number}`
    const reason = inDepositText(noun)
    return (
        <View
            testID="in-deposit-notice"
            className="flex-row flex-wrap items-center gap-x-2 rounded-lg border border-border bg-surface-secondary px-3"
        >
            <TextLink text={linkText} onPress={open} testID="in-deposit-link" />
            <InDepositReason text={reason} isVisible={canWrite} />
        </View>
    )
}
