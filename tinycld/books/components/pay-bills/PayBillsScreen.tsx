import { type ScopeOwner, ScopeProvider, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import {
    type PayBillsScreenData,
    type PayBillsScreenInput,
    usePayBillsScreen,
} from '../../hooks/usePayBillsScreen'
import { usePayBillsStore } from '../../stores/pay-bills-store'
import { DocumentChromeContext } from '../documents/document-chrome'
import { PayBillsForm } from './PayBillsForm'
import { PayBillsStateNotice } from './PayBillsStateNotice'

interface PayBillsSurfaceProps {
    screen: PayBillsScreenData
    scopeOwner: ScopeOwner
}

// The form once every read is ready, and through a running Pay whatever the reads do
// meanwhile (the store's hold, set before the batch): swapping the form out would lose a
// refusal and the typed values. Else the state notice.
function PayBillsSurface({ screen, scopeOwner }: PayBillsSurfaceProps) {
    const isHolding = usePayBillsStore(s => s.holding)
    const { state } = screen
    if (state.kind === 'ready' || isHolding) {
        return <PayBillsForm screen={screen} scopeOwner={scopeOwner} />
    }
    return <PayBillsStateNotice state={state} title={screen.title} onRetry={screen.retry} />
}

/**
 * Pay Bills at `books/pay-bills` (spec §2, §3): the shared document chrome reads
 * PAY_BILLS_CHROME, and the screen's `compose` scope holds the form's keys. `?vendor`
 * sets the Vendor filter; `?bill` pays that bill and filters to its vendor.
 */
export function PayBillsScreen(input: PayBillsScreenInput) {
    const scopeOwner = useShortcutScope('compose')
    const screen = usePayBillsScreen(input)
    return (
        <DocumentChromeContext.Provider value={screen.chrome}>
            <ScopeProvider owner={scopeOwner}>
                <PayBillsSurface screen={screen} scopeOwner={scopeOwner} />
            </ScopeProvider>
        </DocumentChromeContext.Provider>
    )
}
