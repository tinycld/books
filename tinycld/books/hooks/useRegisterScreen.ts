import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { router } from 'expo-router'
import { useState } from 'react'
import {
    buildRegister,
    defaultOrder,
    type Register,
    type RegisterOrder,
    toggleOrder,
} from '../lib/register'
import {
    defaultRangePreset,
    isOtherPresetSelected,
    type RangePreset,
    rangeForPreset,
    todayIso,
} from '../lib/register-range'
import { newEntryVisible, registerViewState } from '../lib/register-state'
import { isNewActionAvailable, NEW_ACTIONS } from '../lib/shell-nav'
import { useRegisterStore } from '../stores/register-store'
import { useBackToChart } from './useBackToChart'
import { useBooksAccess } from './useBooksAccess'
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
    const openEntry = useRegisterStore(s => s.openEntry)

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
        onPreset: setPreset,
        order,
        onToggleOrder: () => setOrder(toggleOrder),
        hasSubAccounts: query.hasSubAccounts,
        isNewEntryVisible: newEntryVisible({
            canWrite: access.canWrite,
            isAvailable: isNewActionAvailable(NEW_ENTRY_ACTION),
        }),
        newEntryHref,
        onNewEntry: () => router.push(newEntryHref),
        onRetry: query.retry,
        onBack,
        selectedEntryId: selected?.accountId === accountId ? selected.entryId : null,
        onOpenEntry: (entryId: string) => openEntry(accountId, entryId),
        isWide: breakpoint !== 'mobile',
        isTablet: breakpoint === 'tablet',
    }
}

export type RegisterScreenModel = ReturnType<typeof useRegisterScreen>
