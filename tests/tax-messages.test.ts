import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    ACCOUNT_ACTIVE_AGENCY,
    ACCOUNT_AGENCY_TYPE,
    AGENCY_ACCOUNT_INACTIVE,
    AGENCY_ACCOUNT_MISSING,
    AGENCY_ACCOUNT_REQUIRED,
    AGENCY_ACCOUNT_TYPE,
    accountUsedByAgenciesMessage,
    agencyActiveRatesMessage,
    agencyDuplicateNameMessage,
    agencyHasRatesMessage,
    BUNDLE_NOT_TAXABLE,
    DEFAULT_HELP,
    DEFAULT_INACTIVE,
    DEFAULT_TAX_INACTIVE,
    DEFAULT_TAX_MISSING,
    EMPTY_HINT,
    EMPTY_QUESTION,
    EMPTY_READ_ONLY,
    EXEMPTION_REASON_REQUIRED,
    GROUP_COMPONENT_IS_GROUP,
    GROUP_COMPONENT_MISSING,
    GROUP_HAS_OWN,
    GROUP_REPEATED,
    GROUP_TOO_FEW,
    GROUP_TOO_MANY,
    GROUPS_HINT,
    GROUPS_NEED_RATES,
    groupComponentInactiveMessage,
    NAME_REQUIRED,
    NAME_TOO_LONG,
    NO_ACTIVE_RATES,
    NO_LIABILITY_ACCOUNT,
    NO_RATES,
    RATE_AGENCY_INACTIVE,
    RATE_AGENCY_MISSING,
    RATE_AGENCY_REQUIRED,
    RATE_HAS_COMPONENTS,
    RATE_INVALID,
    rateInActiveGroupsMessage,
    rateInGroupsMessage,
    TAX_IS_DEFAULT,
    TAX_TYPE_FIXED,
    TAXES_LOAD_ERROR,
    taxDuplicateNameMessage,
} from '../tinycld/books/lib/tax-messages'

// Read inside the test, so a missing server file fails the drift test only.
function serverSource(file: string) {
    return readFileSync(join(__dirname, '..', 'server', file), 'utf8')
}

// goConst reads the text of one Go string constant by its name, so each client
// copy is compared with the const it copies, not with any text in the file.
function goConst(file: string, name: string) {
    const match = serverSource(file).match(new RegExp(`\\b${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`))
    expect(match, `${name} in server/${file}`).not.toBeNull()
    return JSON.parse(`"${match?.[1] ?? ''}"`) as string
}

// Each Go const, the client text it must read as (with %s / %d filled the way
// the client fills them), and the text of the plan Decisions.
const SERVER_COPIES: { file: string; name: string; fill?: string; client: string; text: string }[] =
    [
        {
            file: 'sales_tax.go',
            name: 'msgAgencyDuplicateName',
            fill: 'Colorado DOR',
            client: agencyDuplicateNameMessage('Colorado DOR'),
            text: 'An agency named “Colorado DOR” already exists.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgAgencyAccountRequired',
            client: AGENCY_ACCOUNT_REQUIRED,
            text: 'Choose a liability account.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgAgencyAccountMissing',
            client: AGENCY_ACCOUNT_MISSING,
            text: 'The liability account does not exist.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgAgencyAccountInactive',
            client: AGENCY_ACCOUNT_INACTIVE,
            text: 'The liability account is inactive.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgAgencyAccountType',
            client: AGENCY_ACCOUNT_TYPE,
            text: 'The liability account must be an Other current liability account.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgAgencyHasOneRate',
            client: agencyHasRatesMessage(1),
            text: 'This agency has 1 tax rate. Delete it or move it to another agency first.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgAgencyHasRates',
            fill: '3',
            client: agencyHasRatesMessage(3),
            text: 'This agency has 3 tax rates. Delete them or move them to another agency first.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgAgencyOneActiveRate',
            client: agencyActiveRatesMessage(1),
            text: 'Make its 1 active rate inactive first.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgAgencyActiveRates',
            fill: '2',
            client: agencyActiveRatesMessage(2),
            text: 'Make its 2 active rates inactive first.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgTaxDuplicateName',
            fill: 'Denver city',
            client: taxDuplicateNameMessage('Denver city'),
            text: 'A tax rate or group named “Denver city” already exists.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgTaxTypeFixed',
            client: TAX_TYPE_FIXED,
            text: 'A tax rate stays a rate and a group stays a group.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgRateAgencyRequired',
            client: RATE_AGENCY_REQUIRED,
            text: 'Choose an agency.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgRateAgencyMissing',
            client: RATE_AGENCY_MISSING,
            text: 'The agency does not exist.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgRateAgencyInactive',
            client: RATE_AGENCY_INACTIVE,
            text: 'The agency is inactive.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgRateHasComponents',
            client: RATE_HAS_COMPONENTS,
            text: 'A tax rate holds no other rates.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgGroupHasOwn',
            client: GROUP_HAS_OWN,
            text: 'A group has no rate or agency of its own.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgGroupTooFew',
            client: GROUP_TOO_FEW,
            text: 'Choose at least two rates.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgGroupTooMany',
            client: GROUP_TOO_MANY,
            text: 'A group holds at most ten rates.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgGroupRepeated',
            client: GROUP_REPEATED,
            text: 'Each rate can be in a group once.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgGroupComponentMissing',
            client: GROUP_COMPONENT_MISSING,
            text: 'A rate in this group does not exist.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgGroupComponentIsGroup',
            client: GROUP_COMPONENT_IS_GROUP,
            text: 'A group cannot contain another group.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgGroupComponentInactive',
            fill: 'Retired rate',
            client: groupComponentInactiveMessage('Retired rate'),
            text: '“Retired rate” is inactive.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgDefaultInactive',
            client: DEFAULT_INACTIVE,
            text: 'Only an active rate or group can be the default.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgTaxIsDefault',
            client: TAX_IS_DEFAULT,
            text: 'This is the default for new sales. Choose another default first.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgRateInGroup',
            fill: 'Metro',
            client: rateInGroupsMessage(['Metro']),
            text: 'This rate is in the group “Metro”. Remove it from the group first.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgRateInGroups',
            fill: '2',
            client: rateInGroupsMessage(['A', 'B']),
            text: 'This rate is in 2 groups. Remove it from them first.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgRateInActiveGroup',
            fill: 'Metro',
            client: rateInActiveGroupsMessage(['Metro']),
            text: 'Remove it from the group “Metro” or make the group inactive first.',
        },
        {
            file: 'sales_tax.go',
            name: 'msgRateInActiveGroups',
            fill: '3',
            client: rateInActiveGroupsMessage(['A', 'B', 'C']),
            text: 'Remove it from its 3 active groups or make them inactive first.',
        },
        {
            file: 'accounts.go',
            name: 'msgAccountUsedByOneAgency',
            client: accountUsedByAgenciesMessage(1),
            text: 'This account is the liability account of 1 tax agency and cannot be deleted. Choose another account for the agency first.',
        },
        {
            file: 'accounts.go',
            name: 'msgAccountUsedByAgencies',
            fill: '2',
            client: accountUsedByAgenciesMessage(2),
            text: 'This account is the liability account of 2 tax agencies and cannot be deleted. Choose another account for them first.',
        },
        {
            file: 'accounts.go',
            name: 'msgAccountActiveAgency',
            client: ACCOUNT_ACTIVE_AGENCY,
            text: 'This account is the liability account of an active tax agency. Choose another account for the agency or make the agency inactive first.',
        },
        {
            file: 'accounts.go',
            name: 'msgAccountAgencyType',
            client: ACCOUNT_AGENCY_TYPE,
            text: 'This account is the liability account of a tax agency, so it stays an Other current liability account.',
        },
        {
            file: 'products.go',
            name: 'msgBundleNotTaxable',
            client: BUNDLE_NOT_TAXABLE,
            text: 'A bundle has no tax setting of its own; each item in it has one.',
        },
        {
            file: 'customers.go',
            name: 'msgExemptionReasonRequired',
            client: EXEMPTION_REASON_REQUIRED,
            text: 'Choose an exemption reason.',
        },
        {
            file: 'customers.go',
            name: 'msgDefaultTaxMissing',
            client: DEFAULT_TAX_MISSING,
            text: 'The default sales tax does not exist.',
        },
        {
            file: 'customers.go',
            name: 'msgDefaultTaxInactive',
            client: DEFAULT_TAX_INACTIVE,
            text: 'The default sales tax is inactive.',
        },
    ]

function filled(goText: string, fill: string | undefined) {
    if (fill === undefined) return goText
    return goText.replace(/%[sd]/, fill)
}

describe('server drift', () => {
    it.each(SERVER_COPIES)('$name in server/$file reads as its client copy', copy => {
        expect(filled(goConst(copy.file, copy.name), copy.fill)).toBe(copy.client)
    })

    it.each(SERVER_COPIES)('$name is the text of the plan Decisions', copy => {
        expect(copy.client).toBe(copy.text)
    })
})

describe('messages with a value', () => {
    it('rateInGroupsMessage names one group and counts several', () => {
        expect(rateInGroupsMessage(['Metro'])).toBe(
            'This rate is in the group “Metro”. Remove it from the group first.'
        )
        expect(rateInGroupsMessage(['A', 'B'])).toBe(
            'This rate is in 2 groups. Remove it from them first.'
        )
    })

    it('rateInActiveGroupsMessage names one group and counts several', () => {
        expect(rateInActiveGroupsMessage(['Valley'])).toBe(
            'Remove it from the group “Valley” or make the group inactive first.'
        )
        expect(rateInActiveGroupsMessage(['A', 'B'])).toBe(
            'Remove it from its 2 active groups or make them inactive first.'
        )
    })

    it('the count messages are singular for one', () => {
        expect(agencyHasRatesMessage(1)).toBe(
            'This agency has 1 tax rate. Delete it or move it to another agency first.'
        )
        expect(agencyHasRatesMessage(2)).toBe(
            'This agency has 2 tax rates. Delete them or move them to another agency first.'
        )
        expect(agencyActiveRatesMessage(1)).toBe('Make its 1 active rate inactive first.')
        expect(agencyActiveRatesMessage(4)).toBe('Make its 4 active rates inactive first.')
        expect(accountUsedByAgenciesMessage(1)).toBe(
            'This account is the liability account of 1 tax agency and cannot be deleted. Choose another account for the agency first.'
        )
        expect(accountUsedByAgenciesMessage(3)).toBe(
            'This account is the liability account of 3 tax agencies and cannot be deleted. Choose another account for them first.'
        )
    })
})

describe('client-only texts', () => {
    it('are the texts of the plan Decisions', () => {
        expect(TAXES_LOAD_ERROR).toBe('Sales tax could not be loaded.')
        expect(NAME_REQUIRED).toBe('Enter a name.')
        expect(NAME_TOO_LONG).toBe('A name has at most 200 characters.')
        expect(RATE_INVALID).toBe('Enter a rate from 0 to 100 with at most four decimals.')
        expect(NO_LIABILITY_ACCOUNT).toBe('Your chart has no sales tax liability account.')
        expect(DEFAULT_HELP).toBe(
            'Invoices and sales receipts start with this tax unless the customer has its own default.'
        )
        expect(EMPTY_QUESTION).toBe('Which agencies do you collect sales tax for?')
        expect(EMPTY_HINT).toBe(
            'Add each state, county or city agency you file sales tax with. Then add the rates it charges.'
        )
        expect(EMPTY_READ_ONLY).toBe('No sales tax is set up yet.')
        expect(NO_RATES).toBe('No rates yet.')
        expect(GROUPS_NEED_RATES).toBe('Add at least two rates to combine them.')
        expect(GROUPS_HINT).toBe('Rates charged together as one choice')
    })

    it('tells an agency whose rates are all hidden that it has no active rates', () => {
        expect(NO_ACTIVE_RATES).toBe('No active rates.')
    })
})
