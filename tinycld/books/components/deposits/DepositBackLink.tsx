import { useBackToJournalEntries } from '../../hooks/useBackToJournalEntries'
import { BackLink } from '../entries/EntryHeader'

interface DepositBackLinkProps {
    // The form's leave guard (useDepositLeaveGuard's `cancel`), so a dirty form asks first;
    // absent, the link goes back at once (the read view, the notices).
    onPress?: () => void
}

/** The deposit screen's back link, "← Journal entries" (`deposit-back`). */
export function DepositBackLink({ onPress }: DepositBackLinkProps) {
    const onBack = useBackToJournalEntries()
    const handlePress = onPress ?? onBack
    return <BackLink label="Journal entries" testID="deposit-back" onPress={handlePress} />
}
