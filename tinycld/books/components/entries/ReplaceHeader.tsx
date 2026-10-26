import { Text, View } from 'react-native'
import type { LineTotals } from '../../lib/entry-lines'
import { EntryHeader } from './EntryHeader'
import { EntryStatusBadge } from './EntryStatusBadge'

interface ReplaceHeaderProps {
    originalNumber: string
    totals: LineTotals
    currency: string
    menu?: React.ReactNode
}

// The header of a replacement draft, new or saved: it keeps the original's number in view.
export function ReplaceHeader({ originalNumber, totals, currency, menu }: ReplaceHeaderProps) {
    return (
        <View>
            <EntryHeader
                title={`Edit ${originalNumber}`}
                badge={<EntryStatusBadge status="draft" />}
                bigTotal={totals.bigTotal}
                isTooLarge={totals.isTooLarge}
                currency={currency}
                menu={menu}
            />
            <Text className="px-4 pt-3 text-sm text-muted-foreground">
                {`Posting this replaces ${originalNumber} under the same number. The original is voided.`}
            </Text>
            <Text testID="entry-replace-help" className="px-4 pt-1 text-sm text-muted-foreground">
                {`You are editing a copy. Until you post, ${originalNumber} stays as it is and your books do not change. Save draft keeps your changes for later.`}
            </Text>
        </View>
    )
}
