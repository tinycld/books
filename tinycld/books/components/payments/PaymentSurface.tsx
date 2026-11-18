import { type ScopeOwner, ScopeProvider, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { type ComponentType, useState } from 'react'
import { View } from 'react-native'
import type { PaymentRecordView } from '../../hooks/usePaymentRecord'
import {
    type PaymentScreenData,
    type PaymentScreenInput,
    type PaymentScreenReads,
    usePaymentScreen,
} from '../../hooks/usePaymentScreen'
import type { PaymentWrites } from '../../hooks/usePaymentWrites'
import type { DepositAccountRow } from '../../lib/deposit-accounts'
import type { PaymentFlow } from '../../lib/payment-flow'
import type { PaymentCollectionName } from '../../lib/payment-read-actions'
import { readyApplicationsOf } from '../../lib/payment-start'
import { type PaymentRefusedSave, refusedSaveOf } from '../../stores/payment-save-store'
import { DocumentChromeContext } from '../documents/document-chrome'
import { PaymentCannotEditDraft } from './PaymentCannotEditDraft'
import { PaymentFlowReadBar, type PaymentReadBarProps } from './PaymentReadActions'
import { PaymentReadView } from './PaymentReadView'
import { PaymentStateNotice } from './PaymentStateNotice'

function accountLabelOf(accounts: readonly DepositAccountRow[], id: string): string {
    const account = accounts.find(row => row.id === id)
    if (!account) return ''
    return account.number ? `${account.number} ${account.name}` : account.name
}

// What a flow's form route receives once its lines are ready: the screen's reads, the
// route's input, a refusal a new form handed over, and the draft's lines and the posted
// original's, each with its document.
export interface PaymentFormRouteProps {
    screen: PaymentScreenData
    input: PaymentScreenInput
    refused: PaymentRefusedSave | null
    scopeOwner: ScopeOwner
    lines: PaymentRecordView['lines']
    originalLines: PaymentRecordView['lines']
}

// The original's lines widen the open balances only while it is posted: once another
// correction of it posts, it is void and its lines no longer hold any document's balance
// down.
function heldOriginalLines(screen: PaymentScreenData) {
    return screen.original?.status === 'posted' ? screen.originalLines : []
}

interface PaymentSurfaceBodyProps {
    flow: PaymentFlow
    collection: PaymentCollectionName
    screen: PaymentScreenData
    input: PaymentScreenInput
    refused: PaymentRefusedSave | null
    scopeOwner: ScopeOwner
    useWrites: () => PaymentWrites
    FormRoute: ComponentType<PaymentFormRouteProps>
    ReadBar: ComponentType<PaymentReadBarProps>
}

function PaymentSurfaceBody({
    flow,
    collection,
    screen,
    input,
    refused,
    scopeOwner,
    useWrites,
    FormRoute,
    ReadBar,
}: PaymentSurfaceBodyProps) {
    const lines = readyApplicationsOf(screen.lines)
    const originalLines = readyApplicationsOf(heldOriginalLines(screen))
    const isFormReady = lines !== null && originalLines !== null
    if (screen.state === 'form' && isFormReady) {
        return (
            <FormRoute
                screen={screen}
                input={input}
                refused={refused}
                scopeOwner={scopeOwner}
                lines={lines}
                originalLines={originalLines}
            />
        )
    }
    if (screen.state === 'read' && screen.payment) {
        const accountLabel = accountLabelOf(screen.depositAccounts, screen.payment.account)
        return (
            <PaymentReadView
                flow={flow}
                payment={screen.payment}
                lines={screen.lines}
                partyName={screen.partyName}
                accountLabel={accountLabel}
                currency={screen.currency}
                canWrite={screen.canWrite}
                scopeOwner={scopeOwner}
                collection={collection}
                ReadBar={ReadBar}
            />
        )
    }
    const draft = screen.payment?.status === 'draft' ? screen.payment : null
    if (screen.state === 'cannot-edit' && draft) {
        const lineIds = screen.lines.map(line => line.id)
        return (
            <PaymentCannotEditDraft
                flow={flow}
                useWrites={useWrites}
                draftId={draft.id}
                lineIds={lineIds}
                scopeOwner={scopeOwner}
                onRetry={screen.retry}
            />
        )
    }
    const notice = screen.state === 'read' || screen.state === 'form' ? 'loading' : screen.state
    return <PaymentStateNotice flow={flow} state={notice} onRetry={screen.retry} />
}

interface PaymentSurfaceProps {
    flow: PaymentFlow
    // The flow's own reads (module constants, called in a fixed order).
    reads: PaymentScreenReads
    // The flow's header collection, which the read view voids through.
    collection: PaymentCollectionName
    input: PaymentScreenInput
    // The flow's writes (a module-constant hook): the cannot-edit notice of a stored
    // draft deletes it through them, as the form does.
    useWrites: () => PaymentWrites
    // The flow's form, drawn once the screen is on the form and the lines are ready.
    FormRoute: ComponentType<PaymentFormRouteProps>
    // The read view's bar; by default the one the flow's descriptor alone describes.
    ReadBar?: ComponentType<PaymentReadBarProps>
}

/**
 * A payment flow's screen (vendor refund spec §3.1, §3.8): the shared document chrome
 * reads the flow's chrome, and the screen's `compose` scope holds the keys of the form or
 * the read view. Loading, a failed read with Retry, not found, no access and cannot edit
 * are PaymentStateNotice (a stored draft's cannot edit with Delete draft,
 * PaymentCannotEditDraft); a draft, a new form and a correction are the flow's form route;
 * a posted or void record is the read view.
 */
export function PaymentSurface({
    flow,
    reads,
    collection,
    input,
    useWrites,
    FormRoute,
    ReadBar = PaymentFlowReadBar,
}: PaymentSurfaceProps) {
    const scopeOwner = useShortcutScope('compose')
    const screen = usePaymentScreen(flow, input, reads)
    // A refusal the new form handed over when it moved to this draft's route.
    const [refused] = useState(() => refusedSaveOf(flow.key, input.id))
    // The root opts back into pointer events and draws its own background: a kind's child
    // stack (SalesKindLayout, the Payments one) turns pointer events off on web and draws
    // its screens over a transparent layer, so the list under it never takes the screen's
    // clicks. On a route with no child stack (vendor refunds) it changes nothing.
    return (
        <DocumentChromeContext.Provider value={flow.chrome}>
            <ScopeProvider owner={scopeOwner}>
                <View pointerEvents="auto" className="flex-1 bg-background">
                    <PaymentSurfaceBody
                        flow={flow}
                        collection={collection}
                        screen={screen}
                        input={input}
                        refused={refused}
                        scopeOwner={scopeOwner}
                        useWrites={useWrites}
                        FormRoute={FormRoute}
                        ReadBar={ReadBar}
                    />
                </View>
            </ScopeProvider>
        </DocumentChromeContext.Provider>
    )
}
