import { router } from 'expo-router'
import { useState } from 'react'
import type { BankingScreenModel } from '../../hooks/useBankingScreen'
import { useBankingUIStore } from '../../stores/banking-ui-store'
import { CloseOnMount } from './CloseOnMount'
import { ConnectAccountDialog } from './ConnectAccountDialog'
import { DisconnectDialog } from './DisconnectDialog'
import { RemoveBankFileDialog } from './RemoveBankFileDialog'

function ignoreConnected() {}

// Keeps the row the Disconnect dialog opened with, because the optimistic delete takes
// it out of the page's rows before the server answers (and a refusal puts it back).
function DisconnectHost({
    connectionId,
    model,
    onClose,
}: {
    connectionId: string
    model: BankingScreenModel
    onClose(): void
}) {
    const live = model.rows.find(row => row.id === connectionId)
    const [opened] = useState(live)
    const connection = live ?? opened
    if (!connection) return <CloseOnMount onClose={onClose} />
    // Only the selected connection's files are in the store; another's were never loaded.
    const fileIds = connection.id === model.selected?.id ? model.files.map(file => file.id) : []
    const onDone = () => {
        onClose()
        router.setParams({ account: undefined })
    }
    return (
        <DisconnectDialog
            connection={connection}
            fileIds={fileIds}
            isGone={!live}
            onDone={onDone}
            onClose={onClose}
        />
    )
}

// The one open dialog of the Banking page, read from the store.
export function BankingDialogs({ model }: { model: BankingScreenModel }) {
    const dialog = useBankingUIStore(s => s.dialog)
    const closeDialog = useBankingUIStore(s => s.closeDialog)
    const connectedAccountIds = new Set(model.rows.map(row => row.account))

    if (dialog.kind === 'connect') {
        const onConnected = (id: string) => {
            closeDialog()
            model.onSelect(id)
        }
        return (
            <ConnectAccountDialog
                mode="connect"
                connectedAccountIds={connectedAccountIds}
                isWide={model.isWide}
                onConnected={onConnected}
                onClose={closeDialog}
            />
        )
    }
    if (dialog.kind === 'disconnect') {
        return (
            <DisconnectHost
                key={dialog.connectionId}
                connectionId={dialog.connectionId}
                model={model}
                onClose={closeDialog}
            />
        )
    }
    if (dialog.kind === 'remove') {
        // A file that left the list, or that an import moved past `uploaded`, can no
        // longer be removed.
        const isGone = !model.files.some(
            file => file.id === dialog.fileId && file.status === 'uploaded'
        )
        return (
            <RemoveBankFileDialog
                key={dialog.fileId}
                fileId={dialog.fileId}
                fileName={dialog.fileName}
                isGone={isGone}
                onClose={closeDialog}
            />
        )
    }
    if (dialog.kind !== 'edit') return null
    const connection = model.rows.find(row => row.id === dialog.connectionId)
    if (!connection) return <CloseOnMount onClose={closeDialog} />
    return (
        <ConnectAccountDialog
            key={connection.id}
            mode="edit"
            connection={connection}
            connectedAccountIds={connectedAccountIds}
            isWide={model.isWide}
            onConnected={ignoreConnected}
            onClose={closeDialog}
        />
    )
}
