import { SetupParts } from '../components/setup/SetupParts'
import { useBooksAccess } from '../hooks/useBooksAccess'
import { useSetupCompleted } from '../hooks/useSetupCompleted'

// The first-run wizard calls these on every render of every step.
export function useIsStepDone(): boolean | undefined {
    return useSetupCompleted()
}

export function useIsStepVisible(): boolean | undefined {
    const access = useBooksAccess()
    return access.isReady ? access.isAdmin : undefined
}

export default function SetupAccountingStep({ next }: { next?: () => void }) {
    return <SetupParts next={next} />
}
