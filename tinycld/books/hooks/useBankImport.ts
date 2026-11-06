import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { materialize } from 'pbtsdb'
import { useMemo, useRef } from 'react'
import { bankDetailsText, connectionLabel } from '../lib/bank-connections'
import { type BankRow, bankContentRows } from '../lib/bank-import'
import { type BankImportPageState, bankImportPageState } from '../lib/bank-import-view'
import { type LiveRecovery, mergeRecoveries } from '../lib/live-recovery'
import type { BooksBankFiles } from '../types'
import { useBackToBanking } from './useBackToBanking'
import { useBooksAccess } from './useBooksAccess'
import { useBooksSettings } from './useBooksSettings'

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

export type BankImportData = {
    fileId: string
    fileName: string
    format: BooksBankFiles['format']
    connectionId: string
    accountLabel: string
    details: string
    currency: string
    columns: number
    rows: BankRow[]
    earlier: { id: string; lines: unknown }[]
}

// The header lines of the page, known as soon as the file and its account load: the
// unreadable state shows them too.
export type BankImportHeader = Pick<
    BankImportData,
    'fileName' | 'format' | 'accountLabel' | 'details'
>

// The reads of the import page and its state. The account is its own live query (not a
// nested materialize() or useRecord) so its load error shows the page's Retry.
export function useBankImport(fileId: string) {
    const [
        accessCollection,
        filesCollection,
        connectionsCollection,
        accountsCollection,
        contentsCollection,
        importsCollection,
    ] = useStore(
        'books_access',
        'books_bank_files',
        'books_bank_connections',
        'books_accounts',
        'books_bank_file_contents',
        'books_bank_imports'
    )
    const access = useBooksAccess()
    const settings = useBooksSettings()
    const isWide = useBreakpoint() !== 'mobile'

    const fileQuery = useLiveQuery({
        query: q => {
            if (!fileId) return undefined
            return q
                .from({ file: filesCollection })
                .where(({ file }) => eq(file.id, fileId))
                .select(({ file }) => ({
                    ...file,
                    connectionRow: materialize(
                        q
                            .from({ c: connectionsCollection })
                            .where(({ c }) => eq(c.id, file.connection))
                            .findOne()
                    ),
                }))
                .findOne()
        },
        queryKey: ['books.bankImport.file', fileId],
    })
    const file = fileId ? fileQuery.data : undefined
    const connection = file?.connectionRow
    const accountId = connection?.account ?? ''

    const accountQuery = useLiveQuery({
        query: q => {
            if (!accountId) return undefined
            return q
                .from({ account: accountsCollection })
                .where(({ account }) => eq(account.id, accountId))
                .select(({ account }) => ({
                    id: account.id,
                    number: account.number,
                    name: account.name,
                    type: account.type,
                }))
                .findOne()
        },
        queryKey: ['books.bankImport.account', accountId],
    })
    const account = accountId ? accountQuery.data : undefined

    const contentsQuery = useLiveQuery({
        query: q => {
            if (!fileId) return undefined
            return q
                .from({ contents: contentsCollection })
                .where(({ contents }) => eq(contents.file, fileId))
                .findOne()
        },
        queryKey: ['books.bankImport.contents', fileId],
    })
    const contents = fileId ? contentsQuery.data : undefined

    const earlierQuery = useLiveQuery({
        query: q => {
            if (!fileId) return undefined
            return q
                .from({ imp: importsCollection })
                .where(({ imp }) => eq(imp.file, fileId))
                .select(({ imp }) => ({ id: imp.id, lines: imp.lines }))
        },
        queryKey: ['books.bankImport.earlier', fileId],
    })

    // A disabled query reports ready, so each one is checked by what enables it. The file
    // query is ready only once its connection include's load has settled (TanStack DB marks
    // a live query ready when every join/include demand is settled:
    // @tanstack/db/dist/esm/query/live/collection-config-builder.js, `allDemandsSettled`),
    // so a ready file with no connection row means the connection is absent: not found.
    const fileReady = !fileId || (fileQuery.isEnabled && fileQuery.isReady)
    const accountReady = !accountId || (accountQuery.isEnabled && accountQuery.isReady)
    const contentsReady = !fileId || (contentsQuery.isEnabled && contentsQuery.isReady)
    const earlierReady = !fileId || (earlierQuery.isEnabled && earlierQuery.isReady)
    const isReady =
        access.isReady &&
        settings.isReady &&
        fileReady &&
        accountReady &&
        contentsReady &&
        earlierReady
    const isError =
        access.isError ||
        settings.hasLoadError ||
        fileQuery.isError ||
        accountQuery.isError ||
        contentsQuery.isError ||
        earlierQuery.isError

    // Parsed once per stored row, so the flow's preview (keyed on the rows) is not rebuilt
    // on every render.
    const storedRows: unknown = contents?.rows
    const hasContents = contents !== undefined
    const rows = useMemo(
        () => (hasContents ? bankContentRows(storedRows) : null),
        [hasContents, storedRows]
    )
    const hasFile = file !== undefined && connection !== undefined && account !== undefined
    const state: BankImportPageState = bankImportPageState({
        isError,
        isReady,
        canWrite: access.canWrite,
        hasFile,
        rows,
    })

    // Logged once per page, when the page first finds the contents unreadable.
    const loggedUnreadable = useRef(false)
    if (state === 'unreadable' && !loggedUnreadable.current) {
        loggedUnreadable.current = true
        log.error('books.banking', new Error('unreadable bank file contents'), { fileId })
    }

    const recoveryOf = (
        query: { isError: boolean; collection?: LiveRecovery['queries'][number] | null },
        sources: LiveRecovery['sources']
    ): LiveRecovery =>
        query.isError && query.collection ? { queries: [query.collection], sources } : NO_RECOVERY
    const onRetry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([
                recoveryOf(access, [accessCollection]),
                settings.recovery,
                recoveryOf(fileQuery, [filesCollection, connectionsCollection]),
                recoveryOf(accountQuery, [accountsCollection]),
                recoveryOf(contentsQuery, [contentsCollection]),
                recoveryOf(earlierQuery, [importsCollection]),
            ]),
            onError: err => log.error('books.banking', err),
        })
    }

    const backToBanking = useBackToBanking(file?.connection)
    const accountLabel = account ? connectionLabel(account.number, account.name) : ''
    const details = connection
        ? bankDetailsText({
              institution: connection.institution,
              accountMask: connection.account_mask,
          })
        : ''
    const header: BankImportHeader | null =
        file && account ? { fileName: file.name, format: file.format, accountLabel, details } : null
    const data: BankImportData | null =
        state === 'ready' && file && contents && rows
            ? {
                  fileId: file.id,
                  fileName: file.name,
                  format: file.format,
                  connectionId: file.connection,
                  accountLabel,
                  details,
                  currency: settings.settings?.currency || 'USD',
                  columns: contents.columns,
                  rows,
                  earlier: earlierQuery.data ?? [],
              }
            : null

    return { state, onRetry, backToBanking, isWide, header, data }
}

export type BankImportModel = ReturnType<typeof useBankImport>
