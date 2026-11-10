import { HelpIcon } from '@tinycld/core/components/help/HelpIcon'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { Text, View } from 'react-native'
import type { BooksInvoices } from '../../types'
import { EntryStatusBadge } from '../entries/EntryStatusBadge'

interface InvoiceHeaderProps {
    title: string
    // The invoice's status; a new form is a draft.
    status: BooksInvoices['status']
    balanceDue: string
}

function StatusBadge({ status }: { status: BooksInvoices['status'] }) {
    return (
        <View testID="invoice-badge">
            <EntryStatusBadge status={status} />
        </View>
    )
}

// Title, badge and help at the left; Balance due at the right (under the title on a
// phone).
export function InvoiceHeader({ title, status, balanceDue }: InvoiceHeaderProps) {
    const isPhone = useBreakpoint() === 'mobile'
    const layout = isPhone ? 'gap-2' : 'flex-row items-start justify-between gap-4'
    const figureClass = isPhone ? '' : 'items-end'
    return (
        <View className={layout}>
            <View className="flex-row flex-wrap items-center gap-2">
                <Text testID="invoice-title" className="text-xl font-semibold text-foreground">
                    {title}
                </Text>
                <StatusBadge status={status} />
                <HelpIcon topic="books:invoices" />
            </View>
            <View className={figureClass}>
                <Text className="text-xs uppercase tracking-wide text-muted-foreground">
                    Balance due
                </Text>
                <Text
                    testID="invoice-balance-due"
                    className="text-2xl font-semibold text-foreground tabular-nums"
                >
                    {balanceDue}
                </Text>
            </View>
        </View>
    )
}
