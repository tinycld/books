import { and, eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { errorToString } from '@tinycld/core/lib/errors'
import { log } from '@tinycld/core/lib/logger'
import { performMutations, useMutation } from '@tinycld/core/lib/mutations'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { newRecordId } from 'pbtsdb/core'
import { useRef } from 'react'
import type { BooksLevel } from '../lib/access'
import { type LevelWrite, levelPlan, type OrgRole } from '../lib/access-levels'
import { messageOnlyRefusal } from '../lib/refusal'

const RELOAD_FAILED_MESSAGE =
    'Access saved, but the list could not refresh. Reload to see the change.'

type Person = { id: string; orgRole: OrgRole; level: BooksLevel }
type Change = { level: BooksLevel; from: BooksLevel; writes: LevelWrite[] }

export function useAccessMutation(person: Person) {
    const [coreCollection, adminsCollection, accessCollection] = useStore(
        'org_pkg_access',
        'books_admins',
        'books_access'
    )

    // Live reads keep the row ids in the store, so the plan updates a row an earlier change inserted.
    const coreQuery = useLiveQuery({
        query: query =>
            query
                .from({ core: coreCollection })
                .where(({ core }) => and(eq(core.user, person.id), eq(core.pkg, 'books'))),
        queryKey: ['books', 'access-core', person.id],
    })
    const adminQuery = useLiveQuery({
        query: query =>
            query.from({ admin: adminsCollection }).where(({ admin }) => eq(admin.user, person.id)),
        queryKey: ['books', 'access-admin', person.id],
    })

    const inFlight = useRef(new Set<string>())

    const mutation = useMutation({
        mutationFn: async ({ writes, from, level }: Change) => {
            let failure: { error: unknown } | null = null
            try {
                await performMutations(function* () {
                    for (const write of writes) {
                        if (write.table === 'org_pkg_access' && write.op === 'insert') {
                            yield coreCollection.insert({
                                id: newRecordId(),
                                user: person.id,
                                pkg: 'books',
                                access: write.access,
                            })
                        } else if (write.table === 'org_pkg_access') {
                            yield coreCollection.update(write.id, draft => {
                                draft.access = write.access
                            })
                        } else if (write.op === 'insert') {
                            yield adminsCollection.insert({ id: newRecordId(), user: person.id })
                        } else {
                            yield adminsCollection.delete(write.id)
                        }
                    }
                })
            } catch (error) {
                failure = { error }
            }
            // books_access has no realtime, so it reloads whether the writes finished or stopped part-way.
            // A reload cut short by a concurrent sync run resolves with no data, so after a successful write
            // the refreshed row must show the new level; one more reload covers a cut-short first attempt.
            let reloadFailure: unknown = null
            try {
                await accessCollection.reload()
                if (!failure && accessCollection.get(person.id)?.level !== level) {
                    await accessCollection.reload()
                    if (accessCollection.get(person.id)?.level !== level) {
                        reloadFailure = new Error(
                            'books_access reload did not return the saved level'
                        )
                    }
                }
            } catch (error) {
                reloadFailure = error
            }
            if (reloadFailure) log.error('books.access', reloadFailure)
            if (failure) throw failure.error
            return { reloadFailed: reloadFailure !== null, from }
        },
        // Refusals show on the row's `error`; the default handler would add a toast and a Sentry event for an expected one.
        // Any other failure is unexpected, so it is logged here while the row still shows its message.
        onError: error => {
            if (messageOnlyRefusal(error) === null) log.error('books.access', error)
        },
        onSettled: () => {
            inFlight.current.delete(person.id)
        },
    })

    const readFailed = coreQuery.isError || adminQuery.isError
    const isReady = coreQuery.isReady && adminQuery.isReady && !readFailed

    const reloadFailed = mutation.data?.reloadFailed === true && mutation.data.from === person.level
    const chosenLevel = mutation.isPending || reloadFailed ? mutation.variables?.level : undefined
    const shownLevel = chosenLevel ?? person.level

    const setLevel = (level: BooksLevel) => {
        if (!isReady || level === shownLevel) return
        if (inFlight.current.has(person.id)) return
        inFlight.current.add(person.id)
        const coreRow = coreQuery.data?.[0]
        const adminRow = adminQuery.data?.[0]
        const writes = levelPlan({
            userId: person.id,
            level,
            targetOrgRole: person.orgRole,
            coreRow: coreRow && { id: coreRow.id, access: coreRow.access },
            adminRow: adminRow && { id: adminRow.id },
        })
        mutation.mutate({ level, from: person.level, writes })
    }

    // The refresh error and chosen level hold only until the live data moves off the level the change started from.
    const error = mutation.error
        ? (messageOnlyRefusal(mutation.error) ?? errorToString(mutation.error))
        : reloadFailed
          ? RELOAD_FAILED_MESSAGE
          : null

    return {
        setLevel,
        isReady,
        readFailed,
        shownLevel,
        isPending: mutation.isPending,
        error,
    }
}
