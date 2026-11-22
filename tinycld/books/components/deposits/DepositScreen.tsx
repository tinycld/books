import { type ScopeOwner, ScopeProvider, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { View } from 'react-native'
import { useDepositScreen } from '../../hooks/useDepositScreen'
import { DEPOSIT_CHROME } from '../../lib/deposit-kind'
import { LoadingPage } from '../documents/DocumentLoading'
import { DocumentChromeContext } from '../documents/document-chrome'
import { DepositReadView } from './DepositReadView'
import { DepositStateNotice } from './DepositStateNotice'

type DepositScreenData = ReturnType<typeof useDepositScreen>

function DepositScreenBody({
    screen,
    scopeOwner,
}: {
    screen: DepositScreenData
    scopeOwner: ScopeOwner
}) {
    const { state, record } = screen
    if (state === 'loading') return <LoadingPage testID="deposit-loading" />
    if (state === 'read' && record.deposit) {
        return (
            <DepositReadView
                deposit={record.deposit}
                items={record.items}
                lines={record.lines}
                currency={screen.currency}
                canWrite={screen.canWrite}
                scopeOwner={scopeOwner}
            />
        )
    }
    // The form (a new deposit and a draft) is not built yet: until it is, a draft's route
    // shows the not-found notice.
    const kind = state === 'form' || state === 'read' ? 'not-found' : state
    return <DepositStateNotice kind={kind} onRetry={screen.retry} />
}

interface DepositScreenProps {
    // The deposit's id; null at `books/deposits/new`.
    id: string | null
    // `?replaces`: the posted deposit a correction edits.
    replaces?: string
}

/**
 * The deposit screen at `books/deposits/<id>` (bank deposit spec §2, §3.8, §3.9): the
 * shared document chrome reads DEPOSIT_CHROME, and the screen's `compose` scope holds the
 * keys of the read view. Loading, a failed read with Retry, not found, no access and
 * cannot edit are DepositStateNotice; a posted or void deposit is the read view.
 */
export function DepositScreen({ id, replaces }: DepositScreenProps) {
    const scopeOwner = useShortcutScope('compose')
    const screen = useDepositScreen(id, replaces)
    return (
        <DocumentChromeContext.Provider value={DEPOSIT_CHROME}>
            <ScopeProvider owner={scopeOwner}>
                <View pointerEvents="auto" className="flex-1 bg-background">
                    <DepositScreenBody screen={screen} scopeOwner={scopeOwner} />
                </View>
            </ScopeProvider>
        </DocumentChromeContext.Provider>
    )
}
