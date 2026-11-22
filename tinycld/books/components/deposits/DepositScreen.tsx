import { type ScopeOwner, ScopeProvider, useShortcutScope } from '@tinycld/core/lib/shortcuts'
import { useState } from 'react'
import { View } from 'react-native'
import { useDepositScreen } from '../../hooks/useDepositScreen'
import { DEPOSIT_CHROME } from '../../lib/deposit-kind'
import { type DepositRefusedSave, refusedDepositSaveOf } from '../../stores/deposit-save-store'
import { LoadingPage } from '../documents/DocumentLoading'
import { DocumentChromeContext } from '../documents/document-chrome'
import { DepositForm } from './DepositForm'
import { DepositReadView } from './DepositReadView'
import { DepositStateNotice } from './DepositStateNotice'

type DepositScreenData = ReturnType<typeof useDepositScreen>

interface DepositScreenBodyProps {
    screen: DepositScreenData
    scopeOwner: ScopeOwner
    refused: DepositRefusedSave | null
}

function DepositScreenBody({ screen, scopeOwner, refused }: DepositScreenBodyProps) {
    const { state, record } = screen
    if (state === 'loading') return <LoadingPage testID="deposit-loading" />
    if (state === 'form') {
        return (
            <DepositForm
                deposit={record.deposit}
                items={record.items}
                lines={record.lines}
                replaces={screen.replaces}
                original={screen.original}
                accounts={screen.accounts}
                balanceOf={screen.balanceOf}
                currency={screen.currency}
                canWrite={screen.canWrite}
                refused={refused}
                scopeOwner={scopeOwner}
            />
        )
    }
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
    // A read state with no row left (it went away): not found.
    const kind = state === 'read' ? 'not-found' : state
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
 * keys of the form and the read view. Loading, a failed read with Retry, not found, no
 * access and cannot edit (`?replaces` of a deposit that is not posted) are
 * DepositStateNotice; a new deposit, a draft and a correction (`?replaces` of a posted
 * deposit) are the form (held through its own post by the save store); a posted or void
 * deposit is the read view.
 */
export function DepositScreen({ id, replaces }: DepositScreenProps) {
    const scopeOwner = useShortcutScope('compose')
    const screen = useDepositScreen(id, replaces)
    // A new deposit's refused save handed to this draft: read once, at the mount.
    const [refused] = useState(() => refusedDepositSaveOf(id))
    return (
        <DocumentChromeContext.Provider value={DEPOSIT_CHROME}>
            <ScopeProvider owner={scopeOwner}>
                <View pointerEvents="auto" className="flex-1 bg-background">
                    <DepositScreenBody screen={screen} scopeOwner={scopeOwner} refused={refused} />
                </View>
            </ScopeProvider>
        </DocumentChromeContext.Provider>
    )
}
