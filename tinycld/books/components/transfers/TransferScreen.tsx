import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useFocusEffect, useIsFocused, useNavigation } from 'expo-router'
import { StackActions } from 'expo-router/react-navigation'
import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { useTransferDetail } from '../../hooks/useTransferDetail'
import { useTransferPostStore } from '../../stores/transfer-post-store'
import { EntryNotice } from '../entries/EntryNotice'
import { type HeldTransferDraft, TransferDraftScreen } from './TransferDraftScreen'
import { TransferLoadError } from './TransferLoadError'
import { TransferReadView } from './TransferReadView'

// An entry that is not a transfer someone made opens on the journal entry screen. A stack
// action changes only Books' own history: a queued router call or a <Redirect> could land
// after the user moved on and pull them back.
function WrongTypeMove({ entryId }: { entryId: string }) {
    const navigation = useNavigation()
    useFocusEffect(
        useCallback(() => {
            navigation.dispatch(StackActions.replace('entries/[id]', { id: entryId }))
        }, [navigation, entryId])
    )
    return <LoadingState />
}

// The draft form is keyed by the entry id only, and taken from the first ready draft a
// writer may edit. A reload of the live queries or the server's copy of a row this device
// wrote can make the detail blink to loading; remounting then would drop what the user
// typed. While a post runs (the store flag, set before the mutation) the form stays
// mounted whatever the optimistic status says, so a refusal lands on it. A screen left
// under another one is not held while loading, so it does not linger as a second copy.
export function TransferScreen({ entryId }: { entryId: string }) {
    const detail = useTransferDetail(entryId)
    const isPostPending = useTransferPostStore(s => s.isPostPending)
    const isFocused = useIsFocused()
    const [held, setHeld] = useState<HeldTransferDraft | null>(null)
    const isReady = detail.viewState === 'ready'
    const isDraftRow = isReady && detail.entry.status === 'draft'
    if (!held && isDraftRow && detail.canWrite) {
        setHeld({
            entryId: detail.entry.id,
            currency: detail.currency,
            initial: {
                from: detail.from,
                to: detail.to,
                amount: detail.amount,
                date: detail.entry.date,
                memo: detail.entry.memo,
            },
            savedIds: detail.ids,
            replacesNumber: detail.replacesNumber,
        })
    }
    const isLoadingHere = detail.viewState === 'loading' && isFocused
    if (held && (isPostPending || isDraftRow || isLoadingHere)) {
        return (
            <TransferDraftScreen
                key={held.entryId}
                held={held}
                flipped={isReady && !isDraftRow ? detail : null}
                accounts={detail.accounts}
            />
        )
    }
    if (detail.viewState === 'ready') return <TransferReadView detail={detail} />
    if (detail.viewState === 'error') return <TransferLoadError onRetry={detail.onRetry} />
    if (detail.viewState === 'not-found') {
        return <EntryNotice testID="transfer-not-found" message="This transfer does not exist" />
    }
    if (detail.viewState === 'wrong-type') return <WrongTypeMove entryId={entryId} />
    return (
        <View testID="transfer-loading" className="flex-1 bg-background">
            <LoadingState />
        </View>
    )
}
