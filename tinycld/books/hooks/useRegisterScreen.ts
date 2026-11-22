import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { NEW_ACTIONS } from '../lib/new-actions'
import {
    buildRegister,
    defaultOrder,
    entryDetail,
    type Register,
    type RegisterOrder,
    toggleOrder,
} from '../lib/register'
import { REGISTER_TABLE_MIN_WIDTH } from '../lib/register-layout'
import {
    defaultRangePreset,
    isOtherPresetSelected,
    type RangePreset,
    rangeForPreset,
    todayIso,
} from '../lib/register-range'
import { newEntryVisible, registerViewState } from '../lib/register-state'
import { isNewActionAvailable } from '../lib/shell-nav'
import { transferButtonVisible } from '../lib/transfer'
import { useRegisterStore } from '../stores/register-store'
import { useBackToChart } from './useBackToChart'
import { useBooksAccess } from './useBooksAccess'
import { useFitsTable } from './useFitsTable'
import { useRegisterQuery } from './useRegisterQuery'

const NEW_ENTRY_ACTION = 'journal-entry'

const EMPTY_REGISTER: Register = {
    rows: [],
    openingBalance: 0,
    endingBalance: 0,
    showOpeningRow: false,
}

export function useRegisterScreen(accountId: string) {
    const [preset, setPreset] = useState<RangePreset>(defaultRangePreset)
    const [order, setOrder] = useState<RegisterOrder>(defaultOrder)
    const today = todayIso()
    const query = useRegisterQuery(accountId, month => rangeForPreset(preset, today, month))
    // Until the settings load there is no range; the January default only feeds the empty header.
    const range = query.range ?? rangeForPreset(preset, today, 1)
    const access = useBooksAccess()
    const breakpoint = useBreakpoint()
    const orgHref = useOrgHref()
    const onBack = useBackToChart()
    const selected = useRegisterStore(s => s.selected)
    const anchor = useRegisterStore(s => s.anchor)
    const openEntry = useRegisterStore(s => s.openEntry)
    const fit = useFitsTable(REGISTER_TABLE_MIN_WIDTH)
    // Leaving the register drops its selection and its anchor, so a later visit starts closed and
    // at the top. A focus cleanup, not an unmount cleanup: a push (the sidebar, "Open entry")
    // keeps this screen mounted and hidden, and the next register of the account would inherit
    // the anchor. The guard reads the anchor: `close` has cleared the selection already when the
    // drawer was closed or closed itself on a navigation.
    useFocusEffect(
        useCallback(
            () => () => {
                const { anchor: current, reset } = useRegisterStore.getState()
                if (current?.accountId === accountId) reset()
            },
            [accountId]
        )
    )

    const { account } = query
    const register = account
        ? buildRegister({
              accountType: account.type,
              lines: query.lines,
              priorTotals: query.priorTotals,
              range,
              order,
          })
        : EMPTY_REGISTER
    const selectedEntryId = selected?.accountId === accountId ? selected.entryId : null
    const anchorEntryId = anchor?.accountId === accountId ? anchor.entryId : null
    const selectedLine = register.rows.find(row => row.entryId === selectedEntryId)
    const selectedEntry = selectedLine ? entryDetail(selectedLine.source, accountId) : null
    const state = registerViewState({
        isReady: query.isReady,
        isError: query.isError,
        hasAccount: account !== undefined,
        hasRows: register.rows.length > 0,
        hasAnyActivity: query.hasAnyActivity,
    })
    const newEntryHref = orgHref(
        NEW_ACTIONS.find(action => action.id === NEW_ENTRY_ACTION)?.href ?? ''
    )

    return {
        state,
        account,
        accountId,
        currency: account?.currency ?? 'USD',
        register,
        preset,
        isOtherPresetSelected: isOtherPresetSelected(preset),
        range,
        onPreset: (next: RangePreset) => {
            useRegisterStore.getState().reset()
            setPreset(next)
        },
        order,
        onToggleOrder: () => setOrder(toggleOrder),
        hasSubAccounts: query.hasSubAccounts,
        isNewEntryVisible: newEntryVisible({
            canWrite: access.canWrite,
            isAvailable: isNewActionAvailable(NEW_ENTRY_ACTION),
        }),
        newEntryHref,
        onNewEntry: () => router.push(newEntryHref),
        isTransferVisible: transferButtonVisible({
            canWrite: access.canWrite,
            accountType: account?.type,
            inactive: account?.inactive ?? false,
        }),
        onTransfer: () =>
            router.push(orgHref(`books/transfers/new?from=${encodeURIComponent(accountId)}`)),
        onRetry: query.retry,
        onBack,
        selectedEntryId,
        anchorEntryId,
        selectedEntry,
        onCloseEntry: useRegisterStore.getState().close,
        onOpenEntry: (entryId: string) => openEntry(accountId, entryId),
        // Table or cards: by the list's own width (`register-main`), less the inline drawer.
        showCards: fit.showCards,
        onMainLayout: fit.onLayout,
        onTableGutter: fit.onGutter,
        // They place the entry drawer (EntryDrawer); they no longer choose table or cards.
        isWide: breakpoint !== 'mobile',
        isTablet: breakpoint === 'tablet',
    }
}

export type RegisterScreenModel = ReturnType<typeof useRegisterScreen>
