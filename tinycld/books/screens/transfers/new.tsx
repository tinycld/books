import { LoadingState } from '@tinycld/core/components/LoadingState'
import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { router, useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'
import { EntryNotice } from '../../components/entries/EntryNotice'
import { TransferForm } from '../../components/transfers/TransferForm'
import { TransferLoadError } from '../../components/transfers/TransferLoadError'
import { useBackToEntries } from '../../hooks/useBackToEntries'
import { useBooksAccess } from '../../hooks/useBooksAccess'
import { useBooksSettings } from '../../hooks/useBooksSettings'
import type { SaveOutcome } from '../../hooks/useEntrySubmit'
import { useTransferAccounts } from '../../hooks/useTransferAccounts'
import { todayIso } from '../../lib/register-range'
import { mergeRecoveries } from '../../lib/report-state'
import { newTransferValues } from '../../lib/transfer'

// Replacing keeps the unsaved form out of the back stack. A post opens the read view, a
// draft its own form, and Post & new a fresh form that keeps the register's account.
function useAfterSave(from: string | undefined) {
    const orgHref = useOrgHref()
    return (id: string, outcome: SaveOutcome) => {
        if (outcome === 'post-new') {
            router.replace(
                orgHref(
                    from
                        ? `books/transfers/new?from=${encodeURIComponent(from)}`
                        : 'books/transfers/new'
                )
            )
            return
        }
        router.replace(orgHref(`books/transfers/${id}`))
    }
}

function TransferLoading() {
    return (
        <View testID="transfer-loading" className="flex-1 bg-background">
            <LoadingState />
        </View>
    )
}

function NewTransferScreen() {
    const { from } = useLocalSearchParams<{ from?: string }>()
    const settings = useBooksSettings()
    const accounts = useTransferAccounts()
    const onSaved = useAfterSave(from)
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
    return <NewTransferScreen />
}
