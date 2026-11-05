import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { View } from 'react-native'
import { useBackToEntries } from '../../hooks/useBackToEntries'
import type { SaveOutcome } from '../../hooks/useEntrySubmit'
import type { ReadyTransferDetail, TransferDetail } from '../../hooks/useTransferDetail'
import type { TransferFormValues, TransferLineIds } from '../../lib/transfer'
import { TransferForm } from './TransferForm'
import { TransferReadView } from './TransferReadView'

// What a draft screen is built from; it is taken once, from the first ready draft.
export type HeldTransferDraft = {
    entryId: string
    currency: string
    initial: TransferFormValues
    savedIds: TransferLineIds
    // Set on a saved correction draft: the number of the posted transfer it replaces.
    replacesNumber?: string
}

interface TransferDraftScreenProps {
    held: HeldTransferDraft
    // Set once the status left `draft` while this screen is held (a post not yet
    // confirmed): the read view then shows over the hidden form, which keeps its typed
    // values so a refused post can show its refusal there.
    flipped: ReadyTransferDetail | null
    // The detail's own accounts query, whose load the screen already waits on: a second
    // query here would have a load state nothing gates, so the pickers could show stored
    // accounts as unpicked with a zero balance while it loads.
    accounts: TransferDetail['accounts']
}

function FlippedReadView({ detail }: { detail: ReadyTransferDetail | null }) {
    if (!detail) return null
    return <TransferReadView detail={detail} />
}

export function TransferDraftScreen({ held, flipped, accounts }: TransferDraftScreenProps) {
    const orgHref = useOrgHref()
    const { onBack } = useBackToEntries()
    // A save stays on this screen, a post flips it to the read view, and only Post & new
    // moves on.
    const onSaved = (_id: string, outcome: SaveOutcome) => {
        if (outcome === 'post-new') router.replace(orgHref('books/transfers/new'))
    }
    return (
        <>
            <View className="flex-1" style={flipped ? { display: 'none' } : undefined}>
                <TransferForm
                    initial={held.initial}
                    currency={held.currency}
                    accounts={accounts}
                    entryId={held.entryId}
                    savedIds={held.savedIds}
                    replacesNumber={held.replacesNumber}
                    title="Draft transfer"
                    isHeaderVisible={flipped === null}
                    onSaved={onSaved}
                    onCancel={onBack}
                />
            </View>
            <FlippedReadView detail={flipped} />
        </>
    )
}
