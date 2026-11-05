import { LoadingState } from '@tinycld/core/components/LoadingState'
import { useFocusEffect, useNavigation } from 'expo-router'
import { StackActions } from 'expo-router/react-navigation'
import { useCallback } from 'react'
import { View } from 'react-native'
import { useTransferDetail } from '../../hooks/useTransferDetail'
import { EntryNotice } from '../entries/EntryNotice'
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

export function TransferScreen({ entryId }: { entryId: string }) {
    const detail = useTransferDetail(entryId)
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
