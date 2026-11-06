import type { BooksTaxAgencies, BooksTaxRates } from '../types'
import { defaultLiabilityAccount, type LiabilityAccount } from './liability-accounts'
import { formatMoney } from './money'
import { groupPpm, groupTax, parseRatePercent, ratePercentText, taxOn } from './sales-tax'
import type { AgencyValues, GroupValues, RateValues } from './tax-schemas'

type StoredAgency = Pick<BooksTaxAgencies, 'name' | 'account'>
type StoredRate = Pick<BooksTaxRates, 'name' | 'rate_ppm' | 'agency'>
type StoredGroup = Pick<BooksTaxRates, 'name' | 'components'>

// An edit starts from the stored values, an inactive account included: the server
// checks the account only when it changes.
export function agencyFormDefaults(
    stored: StoredAgency | undefined,
    accounts: readonly LiabilityAccount[]
): AgencyValues {
    if (stored) return { name: stored.name, account: stored.account }
    return { name: '', account: defaultLiabilityAccount(accounts) }
}

// Only the changed fields, so an unchanged inactive account is not checked again.
export function agencyPatch(stored: StoredAgency, values: AgencyValues): Partial<StoredAgency> {
    const patch: Partial<StoredAgency> = {}
    if (values.name !== stored.name) patch.name = values.name
    if (values.account !== stored.account) patch.account = values.account
    return patch
}

export function rateFormDefaults(stored: StoredRate | undefined, agencyId: string): RateValues {
    if (!stored) return { name: '', rate: '', agency: agencyId }
    return {
        name: stored.name,
        rate: ratePercentText(stored.rate_ppm).replace('%', ''),
        agency: stored.agency,
    }
}

// The rate compares as ppm, so "8.8750" against a stored 88 750 is no change.
export function ratePatch(stored: StoredRate, values: RateValues): Partial<StoredRate> {
    const patch: Partial<StoredRate> = {}
    const ppm = parseRatePercent(values.rate)
    if (values.name !== stored.name) patch.name = values.name
    if (ppm !== null && ppm !== stored.rate_ppm) patch.rate_ppm = ppm
    if (values.agency !== stored.agency) patch.agency = values.agency
    return patch
}

const PREVIEW_AMOUNT_CENTS = 10_000

// The live line under the rate; blank while the rate is not a valid one.
export function ratePreview(text: string, currency: string): string {
    const ppm = parseRatePercent(text)
    if (ppm === null) return ''
    return `Tax on $100.00: ${formatMoney(taxOn(PREVIEW_AMOUNT_CENTS, ppm), currency)}`
}

// An edit starts from every stored rate, an inactive one included: the server checks
// only the rates a change adds.
export function groupFormDefaults(stored: StoredGroup | undefined): GroupValues {
    if (!stored) return { name: '', components: [] }
    return { name: stored.name, components: [...stored.components] }
}

function sameMembers(a: readonly string[], b: readonly string[]) {
    const inA = new Set(a)
    return inA.size === new Set(b).size && b.every(id => inA.has(id))
}

// Only the changed fields. The rates compare as a set, since the checklist saves them
// in its own order.
export function groupPatch(stored: StoredGroup, values: GroupValues): Partial<StoredGroup> {
    const patch: Partial<StoredGroup> = {}
    if (values.name !== stored.name) patch.name = values.name
    if (!sameMembers(stored.components, values.components)) patch.components = values.components
    return patch
}

// The live line under the checklist: each rate is rounded on its own, then added, as
// every document with the group computes it.
export function groupLine(ppms: readonly number[], currency: string): string {
    if (ppms.length === 0) return ''
    const total = groupTax(PREVIEW_AMOUNT_CENTS, ppms).reduce((sum, cents) => sum + cents, 0)
    const percent = ratePercentText(groupPpm(ppms))
    return `Combined rate: ${percent} · Tax on $100.00: ${formatMoney(total, currency)}`
}
