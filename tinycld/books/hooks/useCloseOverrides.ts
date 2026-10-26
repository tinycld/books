import { eq, or } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { errorToString } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { useConnectivityStore } from '@tinycld/core/lib/stores/connectivity-store'
import { writesAvailability } from '@tinycld/core/lib/writes-available'
import { materialize } from 'pbtsdb'
import { newRecordId } from 'pbtsdb/core'
import { useMemo, useRef } from 'react'
import { expiryFrom, parseExpiry, splitOverrides, toPocketBaseTime } from '../lib/overrides'
import { messageOnlyRefusal } from '../lib/refusal'
import type { OverrideValues } from '../lib/settings-schema'
import { useClockTick } from './useClockTick'

export type GrantableUser = { id: string; name: string; email: string }
export type GrantOverride = (
    values: OverrideValues
) => Promise<{ ok: true } | { ok: false; message: string }>
export type RevokeOutcome = { ok: true } | { ok: false; message: string }

const ENDED_MESSAGE = 'This override has already ended.'

function refusalMessage(error: unknown) {
    return messageOnlyRefusal(error) ?? errorToString(error)
}

// grant and revoke return every failure as an outcome that the caller shows, so the default
// handler would add a toast and a Sentry event for an expected refusal. Any other failure is
// unexpected, so it is logged while the caller still shows its message. Offline, a failed
// save is expected rather than a bug, so it stays out of Sentry as in core's default handler.
function logUnexpected(error: unknown) {
    if (messageOnlyRefusal(error) !== null) return
    if (!writesAvailability(useConnectivityStore.getState()).available) {
        log.info('books.overrides', errorToString(error))
        return
    }
    log.error('books.overrides', error)
}

export type OverrideRow = NonNullable<ReturnType<typeof useCloseOverrides>['overrides']>[number]

export function useCloseOverrides() {
    const [overridesCollection, usersCollection, accessCollection] = useStore(
        'books_close_overrides',
        'users',
        'books_access'
    )

    const overridesQuery = useLiveQuery({
        query: query =>
            query
                .from({ override: overridesCollection })
                .orderBy(({ override }) => override.expires_at, 'desc')
                .select(({ override }) => ({
                    ...override,
                    person: materialize(
                        query
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, override.user))
                            .findOne()
                    ),
                    grantor: materialize(
                        query
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, override.granted_by))
                            .findOne()
                    ),
                })),
        queryKey: ['books', 'close-overrides'],
    })

    const grantableQuery = useLiveQuery({
        query: query =>
            query
                .from({ access: accessCollection })
                .where(({ access }) =>
                    or(eq(access.level, 'bookkeeper'), eq(access.level, 'admin'))
                )
                .select(({ access }) => ({
                    id: access.user,
                    person: materialize(
                        query
                            .from({ u: usersCollection })
                            .where(({ u }) => eq(u.id, access.user))
                            .findOne()
                    ),
                })),
        queryKey: ['books', 'grantable-users'],
    })

    // The type system only resolves a materialized row after the query, so the names flatten here.
    const overrides = useMemo(
        () =>
            overridesQuery.data?.map(({ person, grantor, ...override }) => ({
                ...override,
                userName: person?.name,
                grantedByName: grantor?.name,
            })),
        [overridesQuery.data]
    )
    const now = useClockTick((overrides ?? []).map(row => parseExpiry(row.expires_at)))
    const { active, past } = splitOverrides(overrides ?? [], new Date(now))
    const grantableUsers: GrantableUser[] = (grantableQuery.data ?? []).flatMap(({ id, person }) =>
        person ? [{ id, name: person.name, email: person.email }] : []
    )

    const inFlight = useRef(new Map<string, Promise<RevokeOutcome>>())

    const grantMutation = useMutation({
        mutationFn: function* ({
            user,
            reason,
            expires_at,
        }: Pick<OverrideValues, 'user' | 'reason'> & { expires_at: string }) {
            yield overridesCollection.insert({ id: newRecordId(), user, reason, expires_at })
        },
        onError: logUnexpected,
    })

    const revokeMutation = useMutation({
        mutationFn: function* ({ id, expires_at }: { id: string; expires_at: string }) {
            yield overridesCollection.update(id, draft => {
                draft.expires_at = expires_at
            })
        },
        onError: logUnexpected,
    })

    // A repeat call with the same key shares the first call's promise, so it settles with the same outcome.
    const once = (key: string, run: () => Promise<RevokeOutcome>) => {
        const pending = inFlight.current.get(key)
        if (pending) return pending
        const promise = run().finally(() => inFlight.current.delete(key))
        inFlight.current.set(key, promise)
        return promise
    }

    const grant: GrantOverride = ({ user, reason, lasts }) =>
        once(`grant:${user}:${lasts}:${reason}`, async () => {
            try {
                const expires_at = expiryFrom(lasts, new Date())
                await grantMutation.mutateAsync({ user, reason, expires_at })
                return { ok: true }
            } catch (error) {
                return { ok: false, message: refusalMessage(error) }
            }
        })

    const revoke = (id: string): Promise<RevokeOutcome> =>
        once(`revoke:${id}`, async () => {
            try {
                const now = new Date()
                const stored = overridesCollection.get(id)
                if (stored && parseExpiry(stored.expires_at) <= now.getTime()) {
                    return { ok: false, message: ENDED_MESSAGE }
                }
                await revokeMutation.mutateAsync({ id, expires_at: toPocketBaseTime(now) })
                return { ok: true }
            } catch (error) {
                return { ok: false, message: refusalMessage(error) }
            }
        })

    const retryLoad = () => {
        void recoverLiveQueries({
            queries: [overridesQuery.collection, grantableQuery.collection],
            sources: [overridesCollection, accessCollection],
            onError: error => log.error('books.overrides', error),
        })
    }

    return {
        overrides,
        active,
        past,
        grantableUsers,
        isReady: overridesQuery.isReady && grantableQuery.isReady,
        hasLoadError: overridesQuery.isError || grantableQuery.isError,
        retryLoad,
        grant,
        revoke,
    }
}
