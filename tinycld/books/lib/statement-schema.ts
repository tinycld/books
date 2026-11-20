import { z } from 'zod'
import { isIsoDay } from './register-range'
import type { StatementBalanceFilter, StatementType } from './statement-texts'

// The create screen's one zod schema (statements spec §3.2, §3.3, §4.6). The date rules
// are the ones the Go create guard runs (server/statements.go, checkStatementDates), pinned
// by one case table for both (server/testdata/statement_date_cases.json). PocketBase adds a
// final period to the server's text; these texts have none.

export const MAX_STATEMENT_CUSTOMERS = 200

export const STATEMENT_MESSAGES = {
    dateRequired: 'Enter a date',
    dateInvalid: 'Enter a valid date',
    startAfterEnd: "Start date can't be after End date",
    endAfterStatement: "End date can't be after Statement date",
    invalidAddress: 'Enter a valid email address.',
    missingAddress: 'Enter an email address or clear the tick.',
    tooMany: 'Select at most 200 customers. Narrow the list with Customer balance.',
    noneTicked: 'Select at least one customer.',
} as const

export type StatementRecipientValue = { customer: string; ticked: boolean; email: string }

export type CreateStatementsValues = {
    type: StatementType
    statementDate: string
    startDate: string
    endDate: string
    balanceFilter: StatementBalanceFilter
    intent: 'save' | 'send'
    recipients: StatementRecipientValue[]
}

type StatementOptions = Pick<
    CreateStatementsValues,
    'type' | 'statementDate' | 'startDate' | 'endDate' | 'balanceFilter'
>

const optionsShape = {
    type: z.enum(['balance_forward', 'open_items']),
    statementDate: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    balanceFilter: z.enum(['open', 'overdue', 'all']),
}

// The message of one date field, or null when it holds a real day.
function dayMessage(day: string): string | null {
    if (day === '') return STATEMENT_MESSAGES.dateRequired
    return isIsoDay(day) ? null : STATEMENT_MESSAGES.dateInvalid
}

// Each field gets at most one issue. Start and End are read only for Balance forward: an
// Open items statement has no period, and the client sends none (hooks/useCreateStatements).
function checkOptions(options: StatementOptions, ctx: z.RefinementCtx) {
    const issue = (path: string, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message })
    const statementMessage = dayMessage(options.statementDate)
    if (statementMessage !== null) issue('statementDate', statementMessage)
    if (options.type !== 'balance_forward') return
    const startMessage = dayMessage(options.startDate)
    const endMessage = dayMessage(options.endDate)
    if (startMessage !== null) issue('startDate', startMessage)
    if (endMessage !== null) issue('endDate', endMessage)
    if (startMessage === null && endMessage === null && options.startDate > options.endDate) {
        issue('startDate', STATEMENT_MESSAGES.startAfterEnd)
    }
    if (
        endMessage === null &&
        statementMessage === null &&
        options.endDate > options.statementDate
    ) {
        issue('endDate', STATEMENT_MESSAGES.endAfterStatement)
    }
}

export const statementOptionsSchema = z.object(optionsShape).superRefine(checkOptions)

// The send route's bound: `sent_to` holds at most 320 characters (pb-migrations
// 2100000033_create_books_statements.js), and the route trims the address before its checks
// (server/statement_routes.go, sendStatement). The address cases of both are one table
// (server/testdata/statement_email_cases.json).
export const MAX_STATEMENT_ADDRESS_LENGTH = 320

const addressCheck = z.email().max(MAX_STATEMENT_ADDRESS_LENGTH)

// The address a run stores and sends: the typed one without its outer spaces.
export function statementAddress(email: string): string {
    return email.trim()
}

// The message of a ticked row's address, or null when it is taken. An empty address is
// taken on Save (the statement is stored with none); Save and send needs one (spec §3.4).
function addressMessage(email: string, intent: CreateStatementsValues['intent']): string | null {
    const address = statementAddress(email)
    if (address === '') return intent === 'send' ? STATEMENT_MESSAGES.missingAddress : null
    return addressCheck.safeParse(address).success ? null : STATEMENT_MESSAGES.invalidAddress
}

const runShape = z.object({
    ...optionsShape,
    intent: z.enum(['save', 'send']),
    recipients: z.array(z.object({ customer: z.string(), ticked: z.boolean(), email: z.string() })),
})

// At least one ticked customer and at most MAX_STATEMENT_CUSTOMERS (the routes' bound,
// server/statement_routes.go maxStatementsPerRequest).
function checkTickCount(values: CreateStatementsValues, ctx: z.RefinementCtx) {
    const tickedCount = values.recipients.filter(recipient => recipient.ticked).length
    if (tickedCount === 0) {
        ctx.addIssue({ code: 'custom', path: ['root'], message: STATEMENT_MESSAGES.noneTicked })
    } else if (tickedCount > MAX_STATEMENT_CUSTOMERS) {
        ctx.addIssue({ code: 'custom', path: ['root'], message: STATEMENT_MESSAGES.tooMany })
    }
}

// Save and Save and send: the options, each ticked row's address (by `intent`), the count.
export const createStatementsSchema: z.ZodType<CreateStatementsValues, CreateStatementsValues> =
    runShape.superRefine((values, ctx) => {
        checkOptions(values, ctx)
        values.recipients.forEach((recipient, index) => {
            if (!recipient.ticked) return
            const message = addressMessage(recipient.email, values.intent)
            if (message !== null) {
                ctx.addIssue({ code: 'custom', path: ['recipients', index, 'email'], message })
            }
        })
        checkTickCount(values, ctx)
    })

// Preview (spec §3.4): the PDF is made from the options on screen and the ticked customers,
// and no address is in it, so the addresses are not checked.
export const previewStatementsSchema: z.ZodType<CreateStatementsValues, CreateStatementsValues> =
    runShape.superRefine((values, ctx) => {
        checkOptions(values, ctx)
        checkTickCount(values, ctx)
    })

function pad(value: number, width: number): string {
    return String(value).padStart(width, '0')
}

// The same day of the month before, or that month's last day when it has no such day
// (2026-03-31 gives 2026-02-28).
function sameDayOfMonthBefore(day: string): string {
    const year = Number(day.slice(0, 4))
    const month = Number(day.slice(5, 7))
    const prefix = month === 1 ? `${pad(year - 1, 4)}-12-` : `${pad(year, 4)}-${pad(month - 1, 2)}-`
    let date = Number(day.slice(8, 10))
    while (date > 28 && !isIsoDay(`${prefix}${pad(date, 2)}`)) date -= 1
    return `${prefix}${pad(date, 2)}`
}

// Spec §3.2: Balance forward, Statement date and End date today, Start date the same day of
// the month before, Customer balance Open.
export function defaultStatementOptions(today: string): StatementOptions {
    return {
        type: 'balance_forward',
        statementDate: today,
        startDate: sameDayOfMonthBefore(today),
        endDate: today,
        balanceFilter: 'open',
    }
}
