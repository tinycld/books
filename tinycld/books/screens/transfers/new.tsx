import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useLocalSearchParams } from 'expo-router'
import { EntryNotice } from '../../components/entries/EntryNotice'
import { TransferForm } from '../../components/transfers/TransferForm'
import { TransferLoadError } from '../../components/transfers/TransferLoadError'
import { TransferLoading } from '../../components/transfers/TransferLoading'
import { TransferReplaceForm } from '../../components/transfers/TransferReplaceForm'
import { useBackToEntries } from '../../hooks/useBackToEntries'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useBooksSettings } from '../../hooks/useBooksSettings'
import { useTransferAccounts } from '../../hooks/useTransferAccounts'
import { useTransferAfterSave } from '../../hooks/useTransferAfterSave'
import { todayIso } from '../../lib/register-range'
import { mergeRecoveries } from '../../lib/report-state'
import { newTransferValues } from '../../lib/transfer'

function NewTransferScreen({ from }: { from?: string }) {
    const settings = useBooksSettings()
    const accounts = useTransferAccounts()
    const onSaved = useTransferAfterSave(from)
    const { onBack } = useBackToEntries()
    if (settings.hasLoadError || accounts.isError) {
        // One call recovers exactly the reads that failed.
        const onRetry = () => {
            void recoverLiveQueries({
                ...mergeRecoveries([settings.recovery, accounts.recovery]),
                onError: err => log.error('books.transfer', err),
            })
        }
        return <TransferLoadError onRetry={onRetry} />
    }
    if (!settings.isReady || !accounts.isReady) return <TransferLoading />
    return (
        <TransferForm
            initial={newTransferValues(todayIso(), from)}
            currency={settings.settings?.currency ?? 'USD'}
            accounts={accounts}
            title="New transfer"
            onSaved={onSaved}
            onCancel={onBack}
        />
    )
}

export default function NewTransferRoute() {
    const access = useBooksAccess()
    const { from, replaces } = useLocalSearchParams<{ from?: string; replaces?: string }>()
    if (access.isError) return <TransferLoadError onRetry={access.retry} />
    if (!access.isReady) return <TransferLoading />
    if (!access.canWrite) {
        return (
            <EntryNotice
                testID="transfer-no-access"
                message="You need bookkeeper access to create transfers"
            />
        )
    }
    // A correction never falls back to the blank form, not even for an empty `replaces`: that
    // could post a second transfer beside the original.
    if (replaces !== undefined) return <TransferReplaceForm key={replaces} replaces={replaces} />
    return <NewTransferScreen from={from} />
}
