import { SetupWizardShell } from '@tinycld/core/components/setup/wizard/SetupWizardShell'
import type { WizardSummary } from '@tinycld/core/lib/setup/wizard-logic'
import { NonAdminView } from '../components/setup/SetupParts'
import { useBooksAccess } from '../hooks/useBooksAccess'
import SetupAccountingStep from '../setup/accounting'

const STEP_ID = 'books:accounting'

// The org wizard's summary is not available here, so the card shows only this
// step.
const SUMMARY: WizardSummary = {
    steps: [{ id: STEP_ID, label: 'Accounting', phase: 'todo' }],
    nextStepId: STEP_ID,
    doneCount: 0,
    total: 1,
    isSettled: true,
}

function SetupFrame({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <SetupWizardShell phase="setup" summary={SUMMARY} currentStepId={STEP_ID} onSkip={null}>
            <SetupAccountingStep />
        </SetupWizardShell>
    )
}

export default function SetupScreen() {
    const access = useBooksAccess()
    const isNonAdmin = access.isReady && !access.isAdmin
    return (
        <>
            <NonAdminView isVisible={isNonAdmin} />
            <SetupFrame isVisible={!isNonAdmin} />
        </>
    )
}
