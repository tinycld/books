// The sales tax texts. The server copies mirror the refusals in
// server/sales_tax.go, server/accounts.go, server/products.go and
// server/customers.go, which alone check them; the screens show the server's
// refusal on its field or in the root summary. tests/tax-messages.test.ts
// fails if the server wording drifts. A server refusal the server could not
// send is lib/refusal.ts SERVER_UNREACHED.

// Client-only texts.

export const TAXES_LOAD_ERROR = 'Sales tax could not be loaded.'

// A record form's sales tax picker while its rates load: a stored choice has no label yet.
export const TAX_OPTIONS_LOADING = 'Loading…'

export const NAME_REQUIRED = 'Enter a name.'

export const NAME_TOO_LONG = 'A name has at most 200 characters.'

export const RATE_INVALID = 'Enter a rate from 0 to 100 with at most four decimals.'

export const NO_LIABILITY_ACCOUNT = 'Your chart has no sales tax liability account.'

export const DEFAULT_HELP =
    'Invoices and sales receipts start with this tax unless the customer has its own default.'

export const EMPTY_QUESTION = 'Which agencies do you collect sales tax for?'

export const EMPTY_HINT =
    'Add each state, county or city agency you file sales tax with. Then add the rates it charges.'

export const EMPTY_READ_ONLY = 'No sales tax is set up yet.'

export const NO_RATES = 'No rates yet.'

export const NO_ACTIVE_RATES = 'No active rates.'

export const GROUPS_NEED_RATES = 'Add at least two rates to combine them.'

export const GROUPS_HINT = 'Rates charged together as one choice'

// server/sales_tax.go: agencies.

// msgAgencyDuplicateName
export function agencyDuplicateNameMessage(name: string): string {
    return `An agency named “${name}” already exists.`
}

// msgAgencyAccountRequired
export const AGENCY_ACCOUNT_REQUIRED = 'Choose a liability account.'

// msgAgencyAccountMissing
export const AGENCY_ACCOUNT_MISSING = 'The liability account does not exist.'

// msgAgencyAccountInactive
export const AGENCY_ACCOUNT_INACTIVE = 'The liability account is inactive.'

// msgAgencyAccountType
export const AGENCY_ACCOUNT_TYPE =
    'The liability account must be an Other current liability account.'

// msgAgencyHasOneRate (1) and msgAgencyHasRates (several).
export function agencyHasRatesMessage(count: number): string {
    if (count === 1) {
        return 'This agency has 1 tax rate. Delete it or move it to another agency first.'
    }
    return `This agency has ${count} tax rates. Delete them or move them to another agency first.`
}

// msgAgencyOneActiveRate (1) and msgAgencyActiveRates (several).
export function agencyActiveRatesMessage(count: number): string {
    if (count === 1) {
        return 'Make its 1 active rate inactive first.'
    }
    return `Make its ${count} active rates inactive first.`
}

// server/sales_tax.go: rates and groups.

// msgTaxDuplicateName
export function taxDuplicateNameMessage(name: string): string {
    return `A tax rate or group named “${name}” already exists.`
}

// msgTaxTypeFixed
export const TAX_TYPE_FIXED = 'A tax rate stays a rate and a group stays a group.'

// msgRateAgencyRequired
export const RATE_AGENCY_REQUIRED = 'Choose an agency.'

// msgRateAgencyMissing
export const RATE_AGENCY_MISSING = 'The agency does not exist.'

// msgRateAgencyInactive
export const RATE_AGENCY_INACTIVE = 'The agency is inactive.'

// msgRateHasComponents
export const RATE_HAS_COMPONENTS = 'A tax rate holds no other rates.'

// msgGroupHasOwn
export const GROUP_HAS_OWN = 'A group has no rate or agency of its own.'

// msgGroupTooFew
export const GROUP_TOO_FEW = 'Choose at least two rates.'

// msgGroupTooMany
export const GROUP_TOO_MANY = 'A group holds at most ten rates.'

// msgGroupRepeated
export const GROUP_REPEATED = 'Each rate can be in a group once.'

// msgGroupComponentMissing
export const GROUP_COMPONENT_MISSING = 'A rate in this group does not exist.'

// msgGroupComponentIsGroup
export const GROUP_COMPONENT_IS_GROUP = 'A group cannot contain another group.'

// msgGroupComponentInactive
export function groupComponentInactiveMessage(name: string): string {
    return `“${name}” is inactive.`
}

// msgDefaultInactive
export const DEFAULT_INACTIVE = 'Only an active rate or group can be the default.'

// msgTaxIsDefault
export const TAX_IS_DEFAULT = 'This is the default for new sales. Choose another default first.'

// msgRateInGroup (one group, by name) and msgRateInGroups (several, by count).
export function rateInGroupsMessage(groups: readonly string[]): string {
    if (groups.length === 1) {
        return `This rate is in the group “${groups[0]}”. Remove it from the group first.`
    }
    return `This rate is in ${groups.length} groups. Remove it from them first.`
}

// msgRateInActiveGroup (one group, by name) and msgRateInActiveGroups
// (several, by count).
export function rateInActiveGroupsMessage(groups: readonly string[]): string {
    if (groups.length === 1) {
        return `Remove it from the group “${groups[0]}” or make the group inactive first.`
    }
    return `Remove it from its ${groups.length} active groups or make them inactive first.`
}

// server/accounts.go.

// msgAccountUsedByOneAgency (1) and msgAccountUsedByAgencies (several).
export function accountUsedByAgenciesMessage(count: number): string {
    if (count === 1) {
        return 'This account is the liability account of 1 tax agency and cannot be deleted. Choose another account for the agency first.'
    }
    return `This account is the liability account of ${count} tax agencies and cannot be deleted. Choose another account for them first.`
}

// msgAccountActiveAgency
export const ACCOUNT_ACTIVE_AGENCY =
    'This account is the liability account of an active tax agency. Choose another account for the agency or make the agency inactive first.'

// msgAccountAgencyType
export const ACCOUNT_AGENCY_TYPE =
    'This account is the liability account of a tax agency, so it stays an Other current liability account.'

// server/products.go.

// msgBundleNotTaxable
export const BUNDLE_NOT_TAXABLE = 'A bundle has no tax setting of its own; each item in it has one.'

// server/customers.go.

// msgExemptionReasonRequired
export const EXEMPTION_REASON_REQUIRED = 'Choose an exemption reason.'

// msgDefaultTaxMissing
export const DEFAULT_TAX_MISSING = 'The default sales tax does not exist.'

// msgDefaultTaxInactive
export const DEFAULT_TAX_INACTIVE = 'The default sales tax is inactive.'
