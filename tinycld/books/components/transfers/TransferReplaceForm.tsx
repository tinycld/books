import { useState } from 'react'
import { useBackToEntries } from '../../hooks/useBackToEntries'
import { useTransferAfterSave } from '../../hooks/useTransferAfterSave'
import { useTransferDetail } from '../../hooks/useTransferDetail'
import { replaceTargetState, type TransferFormValues } from '../../lib/transfer'
import { EntryNotice } from '../entries/EntryNotice'
import { TransferForm } from './TransferForm'
import { TransferLoadError } from './TransferLoadError'
import { TransferLoading } from './TransferLoading'

interface HeldOriginal {
    number: string
    currency: string
    initial: TransferFormValues
}

// A correction of a posted transfer. The correction's post voids the original while this
// screen is still up, so what the form starts from is taken once; a later change to the
// original must not unmount it. Until it is taken the screen shows loading, an error or
// "cannot be edited", never a blank new form, so an edit can never post a second transfer
// beside the original. The correction's lines are new rows: the original's line ids are
// never reused.
export function TransferReplaceForm({ replaces }: { replaces: string }) {
    const detail = useTransferDetail(replaces)
    const onSaved = useTransferAfterSave()
    const { onBack } = useBackToEntries()
    const [held, setHeld] = useState<HeldOriginal | null>(null)
    const state = replaceTargetState({
        isReady: detail.viewState !== 'loading',
        entry: detail.entry,
    })
    if (!held && detail.viewState === 'ready' && state === 'ready') {
        setHeld({
            number: detail.entry.number,
            currency: detail.currency,
            initial: {
                from: detail.from,
                to: detail.to,
                amount: detail.amount,
                date: detail.entry.date,
                memo: detail.entry.memo,
            },
        })
    }
    if (held) {
        return (
            <TransferForm
                initial={held.initial}
                currency={held.currency}
                accounts={detail.accounts}
                replaces={replaces}
                replacesNumber={held.number}
                title={`Edit ${held.number}`}
                onSaved={onSaved}
                onCancel={onBack}
            />
        )
    }
    if (detail.viewState === 'error') return <TransferLoadError onRetry={detail.onRetry} />
    if (state === 'loading') return <TransferLoading />
    return <EntryNotice testID="transfer-cannot-edit" message="This transfer cannot be edited" />
}
