import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useAuth } from '@tinycld/core/lib/auth'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { materialize } from 'pbtsdb'
import { useMemo } from 'react'
import type { BooksLevel } from '../lib/access'
import type { OrgRole } from '../lib/access-levels'

export type AccessPerson = NonNullable<ReturnType<typeof useAccessList>['people']>[number]

export function useAccessList() {
    const [accessCollection, usersCollection] = useStore('books_access', 'users')
    const { user } = useAuth()

    const accessQuery = useLiveQuery({
        query: query =>
            query.from({ access: accessCollection }).select(({ access }) => ({
                id: access.id,
                level: access.level,
                person: materialize(
                    query
                        .from({ u: usersCollection })
                        .where(({ u }) => eq(u.id, access.user))
                        .findOne()
                ),
            })),
        queryKey: ['books', 'access-list'],
    })

    // A separate query from useCurrentRole's, so retryLoad can restart it; a failed users load shows as an error.
    const viewerQuery = useLiveQuery({
        query: query =>
            user?.id
                ? query
                      .from({ u: usersCollection })
                      .where(({ u }) => eq(u.id, user.id))
                      .findOne()
                : null,
        queryKey: ['books', 'access-viewer', user?.id ?? ''],
    })
    const role = viewerQuery.data?.role

    // The type system only resolves a materialized row after the query, so the user fields flatten here.
    const people = useMemo(
        () =>
            accessQuery.data
                ?.map(({ id, level, person }) => ({
                    id,
                    name: person?.name ?? '',
                    email: person?.email ?? '',
                    avatar: person?.avatar,
                    orgRole: (person?.role ?? 'guest') as OrgRole,
                    level: level as BooksLevel,
                }))
                .sort((a, b) => a.name.localeCompare(b.name)),
        [accessQuery.data]
    )

    const retryLoad = () => {
        void recoverLiveQueries({
            queries: [viewerQuery.collection, accessQuery.collection],
            sources: [accessCollection, usersCollection],
            onError: error => log.error('books.access', error),
        })
    }

    return {
        people,
        isReady: accessQuery.isReady && viewerQuery.isReady,
        hasLoadError: accessQuery.isError || viewerQuery.isError,
        retryLoad,
        viewerOrgRole: (role ?? 'guest') as OrgRole,
        viewerId: user?.id ?? '',
    }
}
