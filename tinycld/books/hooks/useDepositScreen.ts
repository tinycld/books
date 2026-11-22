import { log } from '@tinycld/core/lib/logger'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { depositScreenState } from '../lib/deposit-screen-state'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'
import { useDepositRecord } from './useDepositRecord'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

/**
 * Every read of the deposit screen (bank deposit spec §3.9): access, settings, the deposit
 * at `id` with its items and lines, and the original of `?replaces`. Returns which surface
 * to show (depositScreenState) and one Retry over every failed read (merged recoveries).
 * `id` is null at `books/deposits/new`. No save holds a deposit yet: the form and its save
 * store arrive with the form, so `isHeld` is false here.
 */
export function useDepositScreen(id: string | null, replaces?: string) {
    const access = useBooksAccess()
    const settings = useBooksSettings()
    const record = useDepositRecord(id ?? '')
    const original = useDepositRecord(id === null ? (replaces ?? '') : '')
    const accessRecovery: LiveRecovery = access.isError
        ? { queries: [access.collection], sources: [] }
        : NO_RECOVERY
    const recovery = mergeRecoveries([
        accessRecovery,
        settings.recovery,
        record.recovery,
        original.recovery,
    ])
    const isError = access.isError || settings.hasLoadError || record.isError || original.isError
    const isReady = access.isReady && settings.isReady && record.isReady && original.isReady
    const state = depositScreenState({
        isReady,
        isError,
        canWrite: access.canWrite,
        isNew: id === null,
        status: record.deposit?.status ?? null,
        isHeld: false,
        replacesStatus: replaces ? (original.deposit?.status ?? null) : undefined,
        replacesReady: original.isReady,
        replacesError: original.isError,
    })
    const retry = () => {
        void recoverLiveQueries({
            ...recovery,
            onError: err => log.error('books.deposit', err),
        })
    }
    return {
        state,
        record,
        canWrite: access.canWrite,
        currency: settings.settings?.currency ?? 'USD',
        retry,
    }
}
