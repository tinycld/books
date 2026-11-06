import type { BooksTaxAgencies, BooksTaxRates } from '../types'
import { defaultLiabilityAccount, type LiabilityAccount } from './liability-accounts'
import { formatMoney } from './money'
import { parseRatePercent, ratePercentText, taxOn } from './sales-tax'
import type { AgencyValues, RateValues } from './tax-schemas'

type StoredAgency = Pick<BooksTaxAgencies, 'name' | 'account'>
type StoredRate = Pick<BooksTaxRates, 'name' | 'rate_ppm' | 'agency'>

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
