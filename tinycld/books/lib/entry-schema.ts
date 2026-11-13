import { type useForm, z, zodResolver } from '@tinycld/core/ui/form'
import { type EntryFormLine, isBlankLine, maxLines, parseAmountText, sumLines } from './entry-lines'
import { LINE_BOTH_PARTIES } from './entry-messages'
import { isIsoDay, nextMonthStart } from './register-range'

export type EntryFormValues = {
    date: string
    memo: string
    autoReverseOn: string
    lines: EntryFormLine[]
}

export type ReverseValues = { date: string; memo: string }

export function emptyLine(): EntryFormLine {
    return { id: '', account: '', debit: '', credit: '', memo: '', customer: '', vendor: '' }
}

export function newEntryDefaults(today: string): EntryFormValues {
    return { date: today, memo: '', autoReverseOn: '', lines: [emptyLine(), emptyLine()] }
}

const dayRule = z.string().refine(isIsoDay, 'Enter a date as YYYY-MM-DD')

// The server's limits of an entry's memo and a line's memo, in characters (PocketBase
// counts runes). A longer text is stopped here: the server's own refusal of a line's memo
// names the field `memo`, which is the entry's Memo on this form.
const ENTRY_MEMO_MAX = 4000
const LINE_MEMO_MAX = 1000
export const ENTRY_MEMO_TOO_LONG = `A memo can have at most ${ENTRY_MEMO_MAX} characters`
export const LINE_MEMO_TOO_LONG = `A line memo can have at most ${LINE_MEMO_MAX} characters`

const entryMemoRule = z
    .string()
    .refine(text => Array.from(text).length <= ENTRY_MEMO_MAX, ENTRY_MEMO_TOO_LONG)
const lineMemoRule = z
    .string()
    .refine(text => Array.from(text).length <= LINE_MEMO_MAX, LINE_MEMO_TOO_LONG)

// The currency makes an amount typed in another currency invalid.
function buildSchemas(currency?: string) {
    const lineSchema = z
        .object({
            id: z.string(),
            account: z.string(),
            debit: z.string(),
            credit: z.string(),
            memo: lineMemoRule,
            customer: z.string(),
            vendor: z.string(),
        })
        .superRefine((line, ctx) => {
            if (isBlankLine(line)) return
            if (line.account === '') {
                ctx.addIssue({ code: 'custom', path: ['account'], message: 'Choose an account' })
            }
            if (line.customer !== '' && line.vendor !== '') {
                ctx.addIssue({ code: 'custom', path: ['customer'], message: LINE_BOTH_PARTIES })
            }
            const debit = parseAmountText(line.debit, currency)
            const credit = parseAmountText(line.credit, currency)
            if (debit === null) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['debit'],
                    message: 'Enter an amount like 1,234.50',
                })
            }
            if (credit === null) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['credit'],
                    message: 'Enter an amount like 1,234.50',
                })
            }
            for (const [side, cents] of [
                ['debit', debit],
                ['credit', credit],
            ] as const) {
                if ((cents ?? 0) < 0) {
                    ctx.addIssue({
                        code: 'custom',
                        path: [side],
                        message: 'Amounts cannot be negative',
                    })
                }
            }
            if ((debit ?? 0) !== 0 && (credit ?? 0) !== 0) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['credit'],
                    message: 'Use a debit or a credit on a line, not both',
                })
            }
        })

    const saveDraftSchema = z
        .object({
            date: dayRule,
            memo: entryMemoRule,
            autoReverseOn: z.string(),
            lines: z
                .array(lineSchema)
                .max(maxLines, `An entry can have at most ${maxLines} lines.`),
        })
        .superRefine((values, ctx) => {
            if (values.autoReverseOn === '') return
            if (!isIsoDay(values.autoReverseOn)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['autoReverseOn'],
                    message: 'Enter a date as YYYY-MM-DD',
                })
                return
            }
            if (isIsoDay(values.date) && values.autoReverseOn <= values.date) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['autoReverseOn'],
                    message: 'The auto-reverse date must be after the entry date',
                })
            }
        })
        .superRefine((values, ctx) => {
            if (sumLines(values.lines, currency).isTooLarge) {
                ctx.addIssue({ code: 'custom', path: ['lines'], message: 'Too large' })
            }
        })

    const postSchema = saveDraftSchema.superRefine((values, ctx) => {
        const totals = sumLines(values.lines, currency)
        if (totals.hasInvalid || totals.isTooLarge) return
        const withAmount = values.lines.filter(
            line =>
                (parseAmountText(line.debit, currency) ?? 0) !== 0 ||
                (parseAmountText(line.credit, currency) ?? 0) !== 0
        )
        if (withAmount.length < 2) {
            ctx.addIssue({
                code: 'custom',
                path: ['lines'],
                message: 'Enter an amount on at least two lines',
            })
        }
        if (!totals.isBalanced) {
            ctx.addIssue({
                code: 'custom',
                path: ['lines'],
                message: 'Debits and credits must be equal before this entry can be posted.',
            })
        }
    })
    return { saveDraftSchema, postSchema }
}

export const { saveDraftSchema, postSchema } = buildSchemas()

type EntryResolver = NonNullable<
    NonNullable<Parameters<typeof useForm<EntryFormValues>>[0]>['resolver']
>

// One useForm serves Save draft and Post; the button sets the mode before submit.
export function entryResolver(getMode: () => 'draft' | 'post', currency?: string): EntryResolver {
    const schemas = buildSchemas(currency)
    return (values, context, options) =>
        zodResolver(getMode() === 'post' ? schemas.postSchema : schemas.saveDraftSchema)(
            values,
            context,
            options
        )
}

export function reverseSchema(entryDate: string) {
    return z.object({
        date: dayRule.refine(
            date => !isIsoDay(date) || date >= entryDate,
            'The reversal cannot be dated before the entry'
        ),
        memo: entryMemoRule,
    })
}

export function defaultReverseDate(entryDate: string, today: string): string {
    const next = nextMonthStart(entryDate)
    return today > next ? today : next
}
