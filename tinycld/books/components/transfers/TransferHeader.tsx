import { HelpIcon } from '@tinycld/core/components/help/HelpIcon'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { Text, View } from 'react-native'
import type { BooksJournalEntries } from '../../types'
import { EntryBackLink } from '../entries/EntryHeader'
import { EntryStatusBadge } from '../entries/EntryStatusBadge'

function ReplaceNote({ number }: { number?: string }) {
    if (!number) return null
    return (
        <Text testID="transfer-replace-note" className="pt-1 text-sm text-muted-foreground">
            {`Posting this replaces ${number} under the same number. The original is voided. Until you post, ${number} stays as it is.`}
        </Text>
    )
}

interface TransferHeaderProps {
    title: string
    status: BooksJournalEntries['status']
    amountText: string
    replacesNumber?: string
}

// The amount is the largest figure on the screen: top right on wide, under the title on
// a phone.
export function TransferHeader({ title, status, amountText, replacesNumber }: TransferHeaderProps) {
    const isWide = useBreakpoint() !== 'mobile'
    const row = isWide ? 'flex-row items-center justify-between gap-3' : 'gap-1'
    return (
        <View className="gap-1 border-b border-border px-4 pb-3 pt-2">
            <EntryBackLink />
            <View className={row}>
                <View className="min-w-0 shrink flex-row items-center gap-2">
                    <Text
                        testID="transfer-title"
                        numberOfLines={1}
                        className="shrink text-xl font-semibold text-foreground"
                    >
                        {title}
                    </Text>
                    <View testID="transfer-badge">
                        <EntryStatusBadge status={status} />
                    </View>
                    <HelpIcon topic="books:transfers" />
                </View>
                <Text
                    testID="transfer-amount"
                    className="shrink-0 text-2xl font-semibold tabular-nums text-foreground"
                >
                    {amountText}
                </Text>
            </View>
            <ReplaceNote number={replacesNumber} />
        </View>
    )
}
