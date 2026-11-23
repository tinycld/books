import { useBooksAccess } from './useBooksAccess'
import { useSetupCompleted } from './useSetupCompleted'

// The first-run setup card shows to a Books admin whose setup is not completed, on the
// Lists hub and on the dashboard. False while the settings row loads, so a slow load
// does not flash the card.
export function useShowSetupCard(): boolean {
    const access = useBooksAccess()
    const setupCompleted = useSetupCompleted()
    return access.isAdmin && setupCompleted === false
}
