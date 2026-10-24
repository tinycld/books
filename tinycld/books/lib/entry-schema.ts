import { type useForm, z, zodResolver } from '@tinycld/core/ui/form'
import { type EntryFormLine, isBlankLine, maxLines, parseAmountText, sumLines } from './entry-lines'
import { nextMonthStart } from './register-range'

export type EntryFormValues = {
    date: string
    memo: string
    autoReverseOn: string
    lines: EntryFormLine[]
}

export type ReverseValues = { date: string; memo: string }

export function emptyLine(): EntryFormLine {
    return { id: '', account: '', debit: '', credit: '', memo: '' }
}

export function newEntryDefaults(today: string): EntryFormValues {
    return { date: today, memo: '', autoReverseOn: '', lines: [emptyLine(), emptyLine()] }
}

const isoDayPattern = /^\d{4}-\d{2}-\d{2}$/

function isRealDay(text: string): boolean {
    if (!isoDayPattern.test(text)) return false
    const [year, month, day] = text.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    )
}

const dayRule = z.string().refine(isRealDay, 'Enter a date as YYYY-MM-DD')

const entryFormLineSchema = z
    .object({
        id: z.string(),
        account: z.string(),
        debit: z.string(),
        credit: z.string(),
        memo: z.string(),
    })
    .superRefine((line, ctx) => {
        if (isBlankLine(line)) return
        if (line.account === '') {
            ctx.addIssue({ code: 'custom', path: ['account'], message: 'Choose an account' })
        }
        const debit = parseAmountText(line.debit)
        const credit = parseAmountText(line.credit)
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

export const saveDraftSchema = z
    .object({
        date: dayRule,
        memo: z.string(),
        autoReverseOn: z.string(),
        lines: z
            .array(entryFormLineSchema)
            .max(maxLines, `An entry can have at most ${maxLines} lines.`),
    })
    .superRefine((values, ctx) => {
        if (values.autoReverseOn === '') return
        if (!isRealDay(values.autoReverseOn)) {
            ctx.addIssue({
                code: 'custom',
                path: ['autoReverseOn'],
                message: 'Enter a date as YYYY-MM-DD',
            })
            return
        }
        if (isRealDay(values.date) && values.autoReverseOn <= values.date) {
            ctx.addIssue({
                code: 'custom',
                path: ['autoReverseOn'],
                message: 'The auto-reverse date must be after the entry date',
            })
        }
    })
    .superRefine((values, ctx) => {
        if (sumLines(values.lines).isTooLarge) {
            ctx.addIssue({ code: 'custom', path: ['lines'], message: 'Too large' })
        }
    })

export const postSchema = saveDraftSchema.superRefine((values, ctx) => {
    const totals = sumLines(values.lines)
    if (totals.hasInvalid || totals.isTooLarge) return
    const withAmount = values.lines.filter(
        line =>
            (parseAmountText(line.debit) ?? 0) !== 0 || (parseAmountText(line.credit) ?? 0) !== 0
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
            message: 'Debits must equal credits',
        })
    }
})

type EntryResolver = NonNullable<
    NonNullable<Parameters<typeof useForm<EntryFormValues>>[0]>['resolver']
>

// One useForm serves Save draft and Post; the button sets the mode before submit.
export function entryResolver(getMode: () => 'draft' | 'post'): EntryResolver {
    return (values, context, options) =>
        zodResolver(getMode() === 'post' ? postSchema : saveDraftSchema)(values, context, options)
}

export function reverseSchema(entryDate: string) {
    return z.object({
        date: dayRule.refine(
            date => !isRealDay(date) || date >= entryDate,
            'The reversal cannot be dated before the entry'
        ),
        memo: z.string(),
    })
}

export function defaultReverseDate(entryDate: string, today: string): string {
    const next = nextMonthStart(entryDate)
    return today > next ? today : next
}
