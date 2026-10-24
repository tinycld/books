import type { Transaction } from '@tanstack/react-db'
import { useLiveQuery } from '@tanstack/react-db'
import { errorToString } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { performMutations, useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { newRecordId } from 'pbtsdb/core'
import { useRef, useState } from 'react'
import { planChart } from '../lib/setup-plan'
import type { SetupValues } from '../lib/setup-schema'
import { starterChart } from '../lib/starter-chart'
import { useBooksAccess } from './useBooksAccess'

export type SetupOutcome =
    | { ok: true; created: number }
    | { ok: false; failedAccount: string; message: string }
    | { ok: false; busy: true }

export const SETTINGS_LABEL = 'Business settings'

type Progress = { done: number; total: number }

// Carries the name of the write that failed, because the mutation machinery
// does not report which yielded write was refused.
class SetupStepError extends Error {
    failedAccount: string
    constructor(failedAccount: string, cause: unknown) {
        super(errorToString(cause), { cause })
        this.failedAccount = failedAccount
    }
}

async function step(name: string, write: () => Transaction<Record<string, unknown>>) {
    try {
        await performMutations(function* () {
            yield write()
        })
    } catch (error) {
        throw new SetupStepError(name, error)
    }
}

type RunVariables = {
    values: SetupValues
    withChart: boolean
}

export function useBooksSetup() {
    const [settingsCollection, accountsCollection] = useStore('books_settings', 'books_accounts')
    const access = useBooksAccess()
    const settingsQuery = useLiveQuery(query => query.from({ settings: settingsCollection }))
    const accountsQuery = useLiveQuery(query =>
        query
            .from({ account: accountsCollection })
            .select(({ account }) => ({ id: account.id, number: account.number }))
    )
    const [progress, setProgress] = useState<Progress | null>(null)
    // A ref, because two presses in one tick both see the same stale state.
    const inFlight = useRef(false)

    const settings = settingsQuery.data?.[0]
    const accounts = accountsQuery.data
    const accountCount = accountsQuery.isReady ? accounts?.length : undefined
    const isReady = settingsQuery.isReady && accountsQuery.isReady && access.isReady
    // A business name without the done mark is a batch left half done.
    const isResuming = !!settings && !settings.setup_completed && settings.business_name !== ''

    const run = useMutation({
        // `execute` turns a failure into the returned outcome and logs it; core's
        // default handler would add a second toast and a second Sentry event.
        onError: () => {},
        mutationFn: async ({ values, withChart }: RunVariables) => {
            if (!settings)
                throw new SetupStepError(SETTINGS_LABEL, 'The Books settings could not be found')
            const existing = new Map((accounts ?? []).map(a => [a.number, a.id]))
            const wholeChart = starterChart(values.ownership)
            const levels =
                withChart && (existing.size === 0 || isResuming)
                    ? planChart(values.ownership, existing)
                    : []
            const planned = levels.reduce((sum, level) => sum + level.length, 0)
            const ids = new Map(
                wholeChart.flatMap(a => {
                    const id = existing.get(a.number)
                    return id ? [[a.key, id] as const] : []
                })
            )
            const updateSettings = (fields: Partial<SetupValues> & { done?: true }) =>
                step(SETTINGS_LABEL, () =>
                    settingsCollection.update(settings.id, draft => {
                        if (fields.business_name !== undefined) {
                            draft.business_name = fields.business_name
                        }
                        if (fields.fiscal_year_start_month !== undefined) {
                            draft.fiscal_year_start_month = fields.fiscal_year_start_month
                        }
                        if (fields.done) draft.setup_completed = true
                    })
                )

            if (planned === 0) {
                await updateSettings({ ...values, done: true })
                return 0
            }

            const total = wholeChart.length
            let done = total - planned
            setProgress({ done, total })
            await updateSettings({
                business_name: values.business_name,
                fiscal_year_start_month: values.fiscal_year_start_month,
            })
            for (const item of levels.flat()) {
                const parent = item.parent ? ids.get(item.parent) : ''
                if (parent === undefined) {
                    throw new SetupStepError(item.name, 'The parent account was not created')
                }
                const id = newRecordId()
                await step(item.name, () =>
                    accountsCollection.insert({
                        id,
                        name: item.name,
                        number: item.number,
                        type: item.type,
                        detail_type: item.detail_type,
                        parent,
                        description: '',
                        inactive: false,
                    })
                )
                ids.set(item.key, id)
                done += 1
                setProgress({ done, total })
            }
            await updateSettings({ done: true })
            return planned
        },
    })

    const execute = async (values: SetupValues, withChart: boolean): Promise<SetupOutcome> => {
        if (inFlight.current || !isReady) return { ok: false, busy: true }
        inFlight.current = true
        try {
            const created = await run.mutateAsync({ values, withChart })
            return { ok: true, created }
        } catch (error) {
            log.error('books.setup', error)
            return {
                ok: false,
                failedAccount:
                    error instanceof SetupStepError ? error.failedAccount : SETTINGS_LABEL,
                message: errorToString(error),
            }
        } finally {
            inFlight.current = false
            setProgress(null)
        }
    }

    const retryLoad = () => {
        void recoverLiveQueries({
            queries: [settingsQuery.collection, accountsQuery.collection],
            sources: [settingsCollection, accountsCollection],
            onError: error => log.error('books.setup', error),
        })
    }

    return {
        settings,
        isReady,
        hasLoadError: settingsQuery.isError || accountsQuery.isError,
        retryLoad,
        accountCount,
        existingNumbers: new Set((accounts ?? []).map(a => a.number)),
        isAdmin: access.isAdmin,
        isResuming,
        create: (values: SetupValues) => execute(values, true),
        skipChart: (values: SetupValues) => execute(values, false),
        progress,
    }
}
