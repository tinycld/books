import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// A missing topic reads as empty, so each assertion fails on its own phrase rather than the
// whole file failing to load.
function readHelp(name: string): string {
    const file = path.resolve(__dirname, '../help', name)
    return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

const source = readHelp('reports.md')
const navigatingSource = readHelp('navigating-books.md')
const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source)
const frontmatter = match?.[1] ?? ''
const body = match?.[2] ?? ''

// The body under `heading`, up to the next second-level heading.
function section(heading: string): string {
    const start = body.indexOf(`${heading}\n`)
    if (start < 0) return ''
    const rest = body.slice(start + heading.length)
    const next = rest.search(/^## /m)
    return next < 0 ? rest : rest.slice(0, next)
}

describe('help/reports.md', () => {
    it('has a title and a summary in its frontmatter', () => {
        expect(match).not.toBeNull()
        expect(frontmatter).toMatch(/^title:\s*\S+/m)
        expect(frontmatter).toMatch(/^summary:\s*\S+/m)
    })

    it.each([
        '## Open Books reports',
        '## Read the Trial Balance',
        '## Who sees Books reports',
        '## Build your own Books report',
        '## See the transactions behind an amount',
        '## Download or email a report',
        '## Read the Customer Balance report',
        '## Read the A/R Aging report',
        '## Read the sales reports',
        '## Read the A/P Aging report',
        '## Read the Vendor Balance report',
    ])('has the heading "%s"', heading => {
        expect(body).toMatch(new RegExp(`^${heading}$`, 'm'))
    })

    it('"Download or email a report" links the core section', () => {
        expect(section('## Download or email a report')).toContain(
            '[Download or email a report](help://core:reports)'
        )
    })

    it('links the core reports topic', () => {
        expect(body).toContain('(help://core:reports)')
    })

    it('links the Audit Log topic', () => {
        expect(body).toContain('(help://books:audit-log)')
    })

    it.each([
        'Rows',
        'Non-zero',
        'Active',
        'All',
        'Accounts',
        'retained earnings',
        'End of last month',
        'Custom',
        'Expand all',
    ])('names "%s"', phrase => {
        expect(body).toContain(phrase)
    })

    it('says that a user who has been offboarded has no share (D3)', () => {
        const sentences = section('## Who sees Books reports').split(/(?<=[.!?])\s+/)
        const offboarded = sentences.filter(sentence => /offboarded/i.test(sentence))
        expect(offboarded.length).toBeGreaterThan(0)
        expect(
            offboarded.some(
                sentence =>
                    /\b(no|not|none|never|loses?)\b/i.test(sentence) && /share/i.test(sentence)
            )
        ).toBe(true)
    })

    describe('the "Read the General Ledger" section', () => {
        const ledger = section('## Read the General Ledger')

        it('has the heading', () => {
            expect(body).toMatch(/^## Read the General Ledger$/m)
        })

        it.each([
            ['sections', /\bsections?\b/i],
            ['Beginning balance', /Beginning balance/],
            ["the running balance by the account's normal side", /normal side/i],
            ['Split', /\bSplit\b/],
            ['Rows', /\bRows\b/],
            ['Period', /\bPeriod\b/],
            ['All dates', /All dates/],
            ['sorting by a heading', /\bsort/i],
            ['folding a section', /\bfold/i],
        ])('names %s', (_name, phrase) => {
            expect(ledger).toMatch(phrase)
        })

        // "To open it" (opening the report) and "one section for each account" each
        // match a bare word; only one sentence that names both pins opening a section.
        it('says the sections are open, in one sentence', () => {
            const sentences = ledger.split(/(?<=[.!?])\s+/)
            expect(sentences.some(s => /\bsections?\b/i.test(s) && /\bopen\b/i.test(s))).toBe(true)
        })

        it('says the running balance follows the normal side in one sentence', () => {
            const sentences = ledger.split(/(?<=[.!?])\s+/)
            expect(sentences.some(s => /\bbalance\b/i.test(s) && /normal side/i.test(s))).toBe(true)
        })

        it('says a press on a column heading sorts the lines', () => {
            const sentences = ledger.split(/(?<=[.!?])\s+/)
            expect(sentences.some(s => /\bheading\b/i.test(s) && /\bsort/i.test(s))).toBe(true)
        })
    })

    describe('the "Read the Balance Sheet" section', () => {
        const sheet = section('## Read the Balance Sheet')
        const sentences = sheet.split(/(?<=[.!?])\s+/)
        const inOneSentence = (...phrases: RegExp[]) =>
            sentences.some(s => phrases.every(phrase => phrase.test(s)))

        it('has the heading, right after "Read the General Ledger"', () => {
            expect(body).toMatch(/^## Read the Balance Sheet$/m)
            const headings = [...body.matchAll(/^## .*$/gm)].map(m => m[0])
            const ledger = headings.indexOf('## Read the General Ledger')
            expect(ledger).toBeGreaterThanOrEqual(0)
            expect(headings[ledger + 1]).toBe('## Read the Balance Sheet')
        })

        it.each([
            ['Assets', /\bAssets\b/],
            ['Liabilities', /\bLiabilities\b/],
            ['Equity', /\bEquity\b/],
            ['Prior year', /Prior year/],
            ['Change', /\bChange\b/],
            ['% change', /% change/],
            ['Retained earnings', /Retained earnings/i],
            ['Net income', /Net income/i],
            ['the fiscal year', /fiscal year/i],
            ['Rows', /\bRows\b/],
            ['Non-zero', /Non-zero/],
            ['Active', /\bActive\b/],
        ])('names %s', (_name, phrase) => {
            expect(sheet).toMatch(phrase)
        })

        it("says every figure is a balance by the account's normal side, in one sentence", () => {
            expect(inOneSentence(/\bbalances?\b/i, /normal side/i)).toBe(true)
        })

        it('says Prior year is the same day a year earlier, in one sentence', () => {
            expect(inOneSentence(/Prior year/, /same day/i, /\byear (earlier|before)\b/i)).toBe(
                true
            )
        })

        it('says how the fiscal year splits Retained earnings and Net income', () => {
            expect(inOneSentence(/Retained earnings/i, /fiscal year/i)).toBe(true)
            expect(inOneSentence(/Net income/i, /fiscal year/i)).toBe(true)
        })

        it('says pressing an account opens its lines, in one sentence', () => {
            expect(inOneSentence(/\b(press|tap|click)\b/i, /\baccount\b/i, /\blines?\b/i)).toBe(
                true
            )
        })

        it('says why Total assets equals Total liabilities and equity', () => {
            expect(sheet).toMatch(/Total assets/i)
            expect(sheet).toMatch(/Total liabilities and equity/i)
            expect(
                inOneSentence(
                    /Total assets/i,
                    /Total liabilities and equity/i,
                    /\b(equals?|same|match(es)?)\b/i
                )
            ).toBe(true)
            // The reason: every posted entry balances (its debits equal its credits).
            expect(
                inOneSentence(/\b(because|since)\b/i, /\bentr(y|ies)\b/i, /\b(balances?|debits)\b/i)
            ).toBe(true)
        })
    })

    describe('the "Read the Journal" section', () => {
        const journal = section('## Read the Journal')
        const sentences = journal.split(/(?<=[.!?])\s+/)
        const oneSentence = (...phrases: RegExp[]) =>
            sentences.some(sentence => phrases.every(phrase => phrase.test(sentence)))

        it('has the heading, after "Read the General Ledger"', () => {
            expect(body).toMatch(/^## Read the Journal$/m)
            expect(body.indexOf('## Read the Journal\n')).toBeGreaterThan(
                body.indexOf('## Read the General Ledger\n')
            )
        })

        it('says each posted entry is a block headed by its number and type', () => {
            expect(oneSentence(/\bblocks?\b/i, /\bentry\b/i)).toBe(true)
            expect(oneSentence(/\bnumber\b/i, /\btype\b/i)).toBe(true)
            expect(journal).toContain('JE-41 · Journal entry')
            expect(journal).toContain('TR-7 · Transfer')
        })

        it.each([
            ['the date', /\bdate\b/i],
            ['Account', /\bAccount\b/],
            ['Name', /\bName\b/],
            ['Description', /\bDescription\b/],
            ['Debit', /\bDebit\b/],
            ['Credit', /\bCredit\b/],
        ])('names the line column %s', (_name, phrase) => {
            expect(journal).toMatch(phrase)
        })

        it("says each block's total row and the report's Total have equal Debit and Credit", () => {
            expect(oneSentence(/\bblock\b/i, /\btotal\b/i, /Debit/, /Credit/, /\bequal/i)).toBe(
                true
            )
            expect(oneSentence(/\bTotal\b/, /\breport\b/i, /\bequal/i)).toBe(true)
        })

        it('says only posted entries show, never drafts, and a void shows with its void reversal', () => {
            expect(oneSentence(/\bposted\b/i, /\bshow/i)).toBe(true)
            expect(oneSentence(/\bdrafts?\b/i, /\b(no|not|never)\b/i)).toBe(true)
            expect(oneSentence(/\bvoided entry\b/i, /\bvoid reversal\b/i, /\bboth\b/i)).toBe(true)
        })

        it('names the Period chip with All dates', () => {
            expect(journal).toMatch(/\bPeriod\b/)
            expect(journal).toContain('All dates')
            expect(journal).toContain('Custom')
        })

        it('says a press on a column heading sorts the lines inside each block', () => {
            expect(oneSentence(/\bheading\b/i, /\bsort/i, /\bblocks?\b/i)).toBe(true)
        })

        it('says a press on a block heading folds it, and names Collapse all and Expand all', () => {
            expect(oneSentence(/\bfold/i, /\bblock/i)).toBe(true)
            expect(journal).toContain('Collapse all')
            expect(journal).toContain('Expand all')
        })

        it('says a long period loads more blocks as you scroll', () => {
            expect(oneSentence(/\bload/i, /\bscroll/i)).toBe(true)
        })

        it('says how a line wraps on a phone and on a tablet', () => {
            expect(oneSentence(/\bphone\b/i, /\bthree lines\b/i)).toBe(true)
            expect(oneSentence(/\btablet\b/i, /\btwo lines\b/i)).toBe(true)
        })
    })

    describe('the "Read the Profit and Loss" section', () => {
        const pl = section('## Read the Profit and Loss')
        const sentences = pl.split(/(?<=[.!?])\s+/)
        const oneSentence = (...phrases: RegExp[]) =>
            sentences.some(sentence => phrases.every(phrase => phrase.test(sentence)))

        it('has the heading after the last statement section and before "Who sees Books reports"', () => {
            expect(body).toMatch(/^## Read the Profit and Loss$/m)
            const at = body.indexOf('## Read the Profit and Loss\n')
            const statements = ['## Read the Journal\n', '## Read the Balance Sheet\n']
                .map(heading => body.indexOf(heading))
                .filter(index => index >= 0)
            expect(statements.length).toBeGreaterThan(0)
            expect(at).toBeGreaterThan(Math.max(...statements))
            expect(at).toBeLessThan(body.indexOf('## Who sees Books reports\n'))
        })

        it('names the statement in its order, with the four computed rows', () => {
            const order = [
                'Income',
                'Cost of goods sold',
                'Gross profit',
                'Expenses',
                'Net operating income',
                'Other income',
                'Other expenses',
                'Net other income',
                'Net income',
            ]
            let from = 0
            const missing: string[] = []
            for (const name of order) {
                const found = pl.slice(from).search(new RegExp(`\\b${name}\\b`))
                if (found < 0) {
                    missing.push(name)
                    continue
                }
                from += found + name.length
            }
            expect(missing).toEqual([])
        })

        it("says amounts read by the account's normal side, so a discount account reads negative", () => {
            expect(oneSentence(/\bamounts?\b/i, /normal side/i)).toBe(true)
            expect(oneSentence(/\bdiscount/i, /\bnegative\b/i)).toBe(true)
        })

        it('says % of income divides by Total Income, and Other income is not counted', () => {
            expect(oneSentence(/% of income/, /Total Income/)).toBe(true)
            expect(oneSentence(/Other income/, /\b(not|never)\b/i)).toBe(true)
        })

        it('names the Period chip with its default, its presets and Custom', () => {
            expect(pl).toMatch(/\bPeriod\b/)
            expect(pl).toContain('This fiscal year to date')
            expect(oneSentence(/\bpreset/i, /\bThis month\b/, /\bLast quarter\b/)).toBe(true)
            expect(pl).toContain('Custom')
        })

        it('names the Rows chip with Non-zero and Active', () => {
            expect(pl).toMatch(/\bRows\b/)
            expect(pl).toContain('Non-zero')
            expect(pl).toMatch(/\bActive\b/)
        })

        it('says a press on an account opens its lines', () => {
            expect(oneSentence(/\bpress/i, /\baccount\b/i, /\blines\b/i)).toBe(true)
        })

        it('names the Profit and Loss by Month: every month shown, a month with no line at 0.00, at most 36 months', () => {
            expect(pl).toContain('Profit and Loss by Month')
            expect(oneSentence(/Profit and Loss by Month/, /\bevery month\b/i)).toBe(true)
            expect(oneSentence(/\bmonth with no line\b/i, /\b0\.00\b/)).toBe(true)
            expect(oneSentence(/\b36\b/, /\bmonths?\b/i)).toBe(true)
        })

        it('no longer says the P&L is on the accrual basis', () => {
            expect(pl).not.toMatch(/on the accrual basis/i)
        })
    })

    describe('the "Accrual and cash basis" section', () => {
        const basis = section('## Accrual and cash basis')
        const sentences = basis.split(/(?<=[.!?])\s+/)
        const oneSentence = (...phrases: RegExp[]) =>
            sentences.some(sentence => phrases.every(phrase => phrase.test(sentence)))

        it('has the heading', () => {
            expect(body).toMatch(/^## Accrual and cash basis$/m)
        })

        it('names the five reports with a Method chip', () => {
            expect(basis).toMatch(/\bProfit and Loss\b(?! by Month)/)
            expect(basis).toContain('Profit and Loss by Month')
            expect(basis).toContain('Balance Sheet')
            expect(basis).toContain('Transaction Detail by Account')
            expect(basis).toContain('Sales Tax Liability')
        })

        it('says bills and invoices count when paid on the cash basis', () => {
            expect(oneSentence(/\bbills?\b/i, /\binvoices?\b/i, /\bpaid\b/i, /\bcash\b/i)).toBe(
                true
            )
        })

        // Vendor credit spec §3.11, §3.13: on Cash a vendor credit counts as it is applied
        // to bills; on Accrual on its credit date.
        it('names vendor credits: on Cash they count when applied to a bill', () => {
            expect(oneSentence(/\bvendor credits?\b/i, /\bappl(y|ied|ies)\b/i, /\bcash\b/i)).toBe(
                true
            )
        })

        it('says a vendor credit counts on its credit date on Accrual', () => {
            expect(oneSentence(/\bvendor credits?\b/i, /\bcredit date\b/i, /\bAccrual\b/)).toBe(
                true
            )
        })

        // Vendor refund spec §3.10, §3.12: on Cash a vendor refund counts as a payment of the
        // vendor credit on the refund date.
        it('names vendor refunds: on Cash a refund counts on its refund date', () => {
            expect(oneSentence(/\bvendor refunds?\b/i, /\bcash\b/i)).toBe(true)
            expect(oneSentence(/\bvendor refunds?\b/i, /\brefund date\b|\bthe day\b/i)).toBe(true)
        })

        it("says voiding a payment can move another payment's share by a cent", () => {
            expect(
                oneSentence(/\bvoid/i, /\bpayments?\b/i, /\bshare\b/i, /\b(a|one) cent\b/i)
            ).toBe(true)
        })
    })

    describe('the "Read the Sales Tax Liability report" section', () => {
        const liability = section('## Read the Sales Tax Liability report')
        const sentences = liability.split(/(?<=[.!?])\s+/)
        const oneSentence = (...phrases: RegExp[]) =>
            sentences.some(sentence => phrases.every(phrase => phrase.test(sentence)))

        it('has the heading', () => {
            expect(body).toMatch(/^## Read the Sales Tax Liability report$/m)
        })

        // pay-bills spec §3.10 (Q3): the report has the Method chip, Accrual or Cash.
        it('names the Method chip with Accrual and Cash', () => {
            expect(oneSentence(/\bMethod\b/, /\bAccrual\b/, /\bCash\b/)).toBe(true)
        })

        it('no longer says the report is on the accrual basis only', () => {
            expect(liability).not.toBe('')
            expect(liability).not.toMatch(/on the accrual basis/i)
            expect(liability).not.toContain('This report has no cash basis.')
        })

        it('says posted invoices and sales receipts count, and a draft or a void does not', () => {
            expect(
                oneSentence(
                    /\bposted\b/i,
                    /\binvoices?\b/i,
                    /\bsales receipts?\b/i,
                    /\bdrafts?\b/i,
                    /\bvoid(s|ed)?\b/i,
                    /\b(no|not|never)\b/i
                )
            ).toBe(true)
        })

        it('says the agency total shows only the tax, and why: a sale taxed by two rates of one agency', () => {
            expect(oneSentence(/\btotal\b/i, /\bagency\b/i, /\bonly\b/i, /\btax\b/i)).toBe(true)
            expect(oneSentence(/\btwo rates\b/i, /\bagency\b/i, /\b(twice|double)/i)).toBe(true)
        })

        it('says to press a rate to see its documents', () => {
            expect(oneSentence(/\bpress\b/i, /\brate\b/i, /\bdocuments?\b/i)).toBe(true)
        })

        it('says a press on a document row opens the invoice or sales receipt', () => {
            expect(
                oneSentence(
                    /\b(press|tap|click)\b/i,
                    /\bdocument row\b/i,
                    /\bopens?\b/i,
                    /\binvoice\b/i,
                    /\bsales receipt\b/i
                )
            ).toBe(true)
        })

        it('says a sale with no tax rate is not in the report', () => {
            expect(oneSentence(/\bno tax rate\b/i, /\b(not|never)\b/i, /\breport\b/i)).toBe(true)
        })

        it("says the liability account's balance on the Balance Sheet also holds payments and adjustments", () => {
            expect(
                oneSentence(
                    /\bliability account\b/i,
                    /\bBalance Sheet\b/,
                    /\bpayments?\b/i,
                    /\badjustments?\b/i
                )
            ).toBe(true)
        })
    })

    describe('the "Read the Customer Balance report" section', () => {
        const balance = section('## Read the Customer Balance report')
        const sentences = balance.split(/(?<=[.!?])\s+/)
        const oneSentence = (...phrases: RegExp[]) =>
            sentences.some(sentence => phrases.every(phrase => phrase.test(sentence)))

        it.each([
            ['Accounts receivable', /Accounts receivable/],
            ['As of', /\bAs of\b/],
            ['Balance Sheet', /\bBalance Sheet\b/],
            ['No customer', /\bNo customer\b/],
            ['(inactive)', /\(inactive\)/],
            ['Rows', /\bRows\b/],
            ['Non-zero', /\bNon-zero\b/],
            ['With activity', /\bWith activity\b/],
            ['Order', /\bOrder\b/],
            ['Largest balance', /\bLargest balance\b/],
        ])('names %s', (_name, phrase) => {
            expect(balance).toMatch(phrase)
        })

        it("says a row equals the Open figure on the customer's page, with a link to it", () => {
            expect(balance).toContain('(help://books:customer-pages)')
            expect(oneSentence(/\bOpen\b/, /\(help:\/\/books:customer-pages\)/)).toBe(true)
        })

        it('says a family of sub-customers ends in its Total', () => {
            expect(oneSentence(/\bTotal\b/, /\bsub-customers?\b/i)).toBe(true)
        })

        it('names the Customer filter with its "All … sub-customers" pick', () => {
            // "Customer" alone also matches "Customer Balance"; the filter is named where
            // the section says how to add it.
            expect(oneSentence(/\bAdd filter\b/, /\bthen Customer\b/)).toBe(true)
            expect(oneSentence(/\bAll\b/, /\bsub-customers\b/)).toBe(true)
        })

        it('says a credit balance is negative', () => {
            expect(oneSentence(/\bcredit\b/i, /\bnegative\b/i)).toBe(true)
        })

        it('says a customer row opens into its transactions, and a transaction opens its document', () => {
            expect(oneSentence(/\bopens?\b/i, /\bcustomer\b/i, /\btransactions\b/i)).toBe(true)
            expect(oneSentence(/\btransaction\b/i, /\bopens?\b/i, /\bdocument\b/i)).toBe(true)
        })

        it('says a transaction with no description ends after its number (Amendment 3)', () => {
            expect(balance).toContain('A transaction with no description ends after its number.')
        })

        it('has "customer balance" in the frontmatter tags', () => {
            const tags = (/^tags:\s*\[(.*)\]\s*$/m.exec(frontmatter)?.[1] ?? '')
                .split(',')
                .map(tag => tag.trim().replace(/^["']|["']$/g, ''))
            expect(tags).toContain('customer balance')
        })
    })

    // A/R Aging checkpoint 4 (spec §3 "Help").
    describe('the "Read the A/R Aging report" section', () => {
        const aging = section('## Read the A/R Aging report')
        const sentences = aging.split(/(?<=[.!?])\s+/)
        const oneSentence = (...phrases: RegExp[]) =>
            sentences.some(sentence => phrases.every(phrase => phrase.test(sentence)))

        it('comes directly after "Read the Customer Balance report"', () => {
            const headings = [...body.matchAll(/^## .*$/gm)].map(m => m[0])
            const balance = headings.indexOf('## Read the Customer Balance report')
            expect(balance).toBeGreaterThanOrEqual(0)
            expect(headings[balance + 1]).toBe('## Read the A/R Aging report')
        })

        it.each([
            ['open item', /\bopen items?\b/i],
            ['due date', /\bdue date\b/i],
            ['Current', /\bCurrent\b/],
            ['1 - 30', /\b1 - 30\b/],
            ['91 and over', /\b91 and over\b/],
            ['As of', /\bAs of\b/],
            ['Customer Balance', /\bCustomer Balance\b/],
            ['Balance Sheet', /\bBalance Sheet\b/],
            ['No customer', /\bNo customer\b/],
            ['(inactive)', /\(inactive\)/],
        ])('names %s', (_name, phrase) => {
            expect(aging).toMatch(phrase)
        })

        it('says a credit is a negative figure, in one sentence', () => {
            expect(oneSentence(/\bcredits?\b/i, /\bnegative\b/i)).toBe(true)
        })

        it('names the Order choice with Largest balance, in one sentence', () => {
            expect(oneSentence(/\bOrder\b/, /\bLargest balance\b/)).toBe(true)
        })

        it('names the Customer filter with its sub-customers pick, in one sentence', () => {
            // "Customer" alone also matches "Customer Balance" and "No customer".
            expect(oneSentence(/\bCustomer\b(?! Balance)/, /\bsub-customers\b/)).toBe(true)
        })

        it('says a customer opens into its items, an item into its invoice and payments, and a line opens its document', () => {
            expect(oneSentence(/\bcustomer\b/i, /\bopens?\b/i, /\bitems\b/i)).toBe(true)
            expect(oneSentence(/\bitem\b/i, /\binvoice\b/i, /\bpayments\b/i)).toBe(true)
            expect(oneSentence(/\bline\b/i, /\bopens?\b/i, /\bdocument\b/i)).toBe(true)
        })

        // Apply credit checkpoint 2 (spec §3.8 "A/R Aging" and "Help").
        it('says an applied credit lowers the invoice from the apply date, in one sentence', () => {
            expect(
                oneSentence(
                    /\bappl(?:y|ied)\b/i,
                    /\bcredit\b/i,
                    /\binvoice\b/i,
                    /\blowers?\b/i,
                    /\bapply date\b/i
                )
            ).toBe(true)
        })

        it('says a credit memo then shows only its unapplied rest, in one sentence', () => {
            expect(
                oneSentence(/\bcredit memo\b/i, /\bonly\b/i, /\bunapplied\b/i, /\bappl(?:y|ied)\b/i)
            ).toBe(true)
        })

        it('says that on a phone the Total is on the first line of figures', () => {
            expect(oneSentence(/\bphone\b/i, /\bTotal\b/, /\bfirst line of figures\b/i)).toBe(true)
        })

        it('has "a/r aging" in the frontmatter tags', () => {
            const tags = (/^tags:\s*\[(.*)\]\s*$/m.exec(frontmatter)?.[1] ?? '')
                .split(',')
                .map(tag => tag.trim().replace(/^["']|["']$/g, ''))
            expect(tags).toContain('a/r aging')
        })
    })

    // Sales reports checkpoint 3 (spec §3 "Help").
    describe('the "Read the sales reports" section', () => {
        const sales = section('## Read the sales reports')
        const sentences = sales.split(/(?<=[.!?])\s+/)
        const oneSentence = (...phrases: RegExp[]) =>
            sentences.some(sentence => phrases.every(phrase => phrase.test(sentence)))

        // A/R Aging checkpoint 4 put "Read the A/R Aging report" directly after the
        // Customer Balance section, so the sales reports section comes directly after it.
        it('comes directly after "Read the A/R Aging report"', () => {
            const headings = [...body.matchAll(/^## .*$/gm)].map(m => m[0])
            const aging = headings.indexOf('## Read the A/R Aging report')
            expect(aging).toBeGreaterThanOrEqual(0)
            expect(headings[aging + 1]).toBe('## Read the sales reports')
        })

        it('starts with the task: open Reports and choose a sales report', () => {
            const first = sentences.find(sentence => sentence.trim() !== '') ?? ''
            expect(first).toMatch(/\bReports\b/)
            expect(first).toMatch(/\bSales by Customer\b/)
            expect(first).toMatch(/\bSales by Product\/Service\b/)
        })

        it.each([
            ['Sales by Customer', /\bSales by Customer\b/],
            ['Sales by Product/Service', /\bSales by Product\/Service\b/],
            ['posted invoices', /\bposted invoices\b/i],
            ['sales receipts', /\bsales receipts\b/i],
            ['credit memos', /\bcredit memos?\b/i],
            ['before sales tax', /\bbefore sales tax\b/i],
            ['% of sales', /% of sales/],
            ['No customer', /\bNo customer\b/],
            ['Discount', /\bDiscount\b/],
            ['Period', /\bPeriod\b/],
            ['Order', /\bOrder\b/],
            ['Largest sales', /\bLargest sales\b/],
        ])('names %s', (_name, phrase) => {
            expect(sales).toMatch(phrase)
        })

        it("says a sale counts on its document's date, and posted credit memos lower sales", () => {
            expect(oneSentence(/\bdocument['’]s date\b/i)).toBe(true)
            expect(oneSentence(/\bcredit memos?\b/i, /\b(less|lowers?|subtract(s|ed)?)\b/i)).toBe(
                true
            )
        })

        it("says the two reports' Totals are equal and equal the documents' Subtotals", () => {
            expect(oneSentence(/\bTotals?\b/, /\b(equal|same)\b/i, /\bboth\b|\btwo\b/i)).toBe(true)
            expect(oneSentence(/\bSubtotals?\b/, /\bTotals?\b/)).toBe(true)
        })

        it('says what % of sales is: a share of the Total', () => {
            expect(oneSentence(/% of sales/, /\bTotal\b/)).toBe(true)
        })

        it('says the reports are on the accrual basis, so they can differ from a cash-basis Profit and Loss', () => {
            expect(oneSentence(/\baccrual basis\b/i)).toBe(true)
            expect(oneSentence(/\bcash[- ]basis\b/i, /\bProfit and Loss\b/)).toBe(true)
        })

        it('says how a family reads: a header, its sub-customers and its total', () => {
            expect(oneSentence(/\bsub-customers?\b/i, /\bTotal\b/)).toBe(true)
        })

        it('says the No customer row holds sales receipts with no customer', () => {
            expect(oneSentence(/\bNo customer\b/, /\bsales receipts?\b/i)).toBe(true)
        })

        it("says a percent line counts on its own product's row, with no quantity and no average price", () => {
            expect(oneSentence(/\b(percent line|discount)\b/i, /\bown\b/i, /\bproduct\b/i)).toBe(
                true
            )
            expect(
                oneSentence(
                    /\b(percent line|discount)\b/i,
                    /\b(no )?quantity\b/i,
                    /\b(average price|Avg price)\b/i
                )
            ).toBe(true)
        })

        it('says why the Total has no Quantity and no Avg price', () => {
            expect(
                oneSentence(/\bTotal\b/, /\bQuantity\b/i, /\b(Avg price|average price)\b/i)
            ).toBe(true)
            expect(sales).toMatch(/\b(do not|don['’]t) add up\b|\bunits\b/i)
        })

        it('says a row opens into its sale lines, and a sale line opens its document', () => {
            expect(oneSentence(/\bopens?\b/i, /\brow\b/i, /\bsale lines\b/i)).toBe(true)
            expect(oneSentence(/\bsale line\b/i, /\bopens?\b/i, /\bdocument\b/i)).toBe(true)
        })

        it('names the Customer and Product filters', () => {
            expect(oneSentence(/\bfilters?\b/i, /\bCustomer\b/, /\bProduct\b(?!\/)/)).toBe(true)
        })

        it('names the Order choice with Largest sales', () => {
            expect(oneSentence(/\bOrder\b/, /\bLargest sales\b/)).toBe(true)
        })

        it("names the lists' entry points: the Reports button and the Sales report button", () => {
            expect(oneSentence(/\bReports\b/, /\bCustomers list\b/)).toBe(true)
            expect(oneSentence(/\bSales report\b/, /\bProducts and services\b/i)).toBe(true)
        })

        it('writes no "Ctrl" and no hand-written host name', () => {
            expect(sales).not.toBe('')
            expect(sales).not.toMatch(/\bCtrl\b/)
            expect(sales).not.toMatch(/\b[a-z0-9-]+\.(com|org|net|io|app)\b/i)
            expect(sales).not.toMatch(/\blocalhost\b/)
        })
    })

    it('"Who sees Books reports" names the Sales Tax Liability', () => {
        expect(section('## Who sees Books reports')).toContain('Sales Tax Liability')
    })

    it('"Who sees Books reports" names the A/R Aging', () => {
        expect(section('## Who sees Books reports')).toContain('A/R Aging')
    })

    // A/P Aging checkpoint 5 (spec §3 "Help").
    it('"Who sees Books reports" names the A/P Aging', () => {
        expect(section('## Who sees Books reports')).toContain('the A/P Aging')
    })

    // A/P Aging checkpoint 5 (spec §3 "Help", §2 the Vendors list's Reports menu).
    describe('the "Read the A/P Aging report" section', () => {
        const payables = section('## Read the A/P Aging report')
        const sentences = payables.split(/(?<=[.!?])\s+/)
        const oneSentence = (...phrases: RegExp[]) =>
            sentences.some(sentence => phrases.every(phrase => phrase.test(sentence)))

        // The sales reports stay directly after the A/R Aging; the A/P Aging comes after them.
        it('comes directly after "Read the sales reports"', () => {
            const headings = [...body.matchAll(/^## .*$/gm)].map(m => m[0])
            const sales = headings.indexOf('## Read the sales reports')
            expect(sales).toBeGreaterThanOrEqual(0)
            expect(headings[sales + 1]).toBe('## Read the A/P Aging report')
        })

        it('names open items', () => {
            expect(payables).toMatch(/\bopen items?\b/i)
        })

        it('says age is counted from the due date', () => {
            expect(payables).toMatch(/\bdue date\b/i)
        })

        // "Due date" is also a column name and "As of" is also in the heading example, so the
        // age rule is held as one sentence.
        it('says age is the days from the due date to the As of day, in one sentence', () => {
            expect(oneSentence(/\bage\b/i, /\bdue date\b/i, /\bAs of day\b/)).toBe(true)
        })

        it('says a vendor opens into its open items, an item into its lines, and a line opens its document', () => {
            expect(
                oneSentence(/\bpress the vendor row\b/i, /\bopens into\b/i, /\bopen item\b/i)
            ).toBe(true)
            expect(oneSentence(/\bpress the item row\b/i, /\blines of an item\b/i)).toBe(true)
            expect(oneSentence(/\bpress the line\b/i, /\bdocument\b/i, /\bopens\b/i)).toBe(true)
        })

        it('says a vendor credit is a negative figure', () => {
            expect(payables).toMatch(/\bnegative\b/i)
        })

        it("says a vendor's Total equals its page's Open balance", () => {
            expect(payables).toMatch(/\bOpen balance\b/)
        })

        it("says the report's Total equals the Balance Sheet", () => {
            expect(payables).toMatch(/\bBalance Sheet\b/)
        })

        it('names the As of day', () => {
            expect(payables).toMatch(/\bAs of\b/)
        })

        it('names the Order choice Largest balance', () => {
            expect(payables).toMatch(/\bLargest balance\b/)
        })

        it('names the No vendor row', () => {
            expect(payables).toMatch(/\bNo vendor\b/)
        })

        it("names the Vendors list's Reports menu in one sentence", () => {
            expect(oneSentence(/\bReports\b/, /\bVendors list\b/, /\bA\/P Aging\b/)).toBe(true)
        })
    })

    // The live reports over journal lines (Shipped.Live in server/) stay
    // current, and a saved change or a copy of one does not.
    describe('the "Reports that you refresh" section', () => {
        const sentences = section('## Reports that you refresh').split(/(?<=[.!?])\s+/)
        const sentenceWith = (phrase: string) =>
            (sentences.find(s => s.includes(phrase)) ?? '').toLowerCase()
        const reports = [
            'the Profit and Loss',
            'the Customer Balance',
            'the Vendor Balance',
            'the Audit Log',
        ]
        // The stay-current sentence names the statements together ("the two
        // statement reports").
        const live = [...reports, 'Statement: Balance Forward']

        it.each(reports)('says %s stays current', name => {
            expect(sentenceWith('stay current: they run again')).toContain(name.toLowerCase())
        })

        it.each(live)('says a saved change to %s stops its updates', name => {
            expect(sentenceWith('When someone saves a change')).toContain(name.toLowerCase())
        })

        it.each(live)('says a copy of %s does not update', name => {
            expect(sentenceWith('A copy that you keep with Save as')).toContain(name.toLowerCase())
        })
    })

    // Vendor Balance checkpoint 4 (spec §3 "Help").
    it('"Who sees Books reports" names the Vendor Balance', () => {
        expect(section('## Who sees Books reports')).toContain('the Vendor Balance')
    })

    // Vendor Balance checkpoint 4 (spec §3 "Help", §2 the Vendors list's Reports menu).
    describe('the "Read the Vendor Balance report" section', () => {
        const balances = section('## Read the Vendor Balance report')
        const sentences = balances.split(/(?<=[.!?])\s+/)
        const oneSentence = (...phrases: RegExp[]) =>
            sentences.some(sentence => phrases.every(phrase => phrase.test(sentence)))

        it('comes directly after "Read the A/P Aging report"', () => {
            const headings = [...body.matchAll(/^## .*$/gm)].map(m => m[0])
            const payables = headings.indexOf('## Read the A/P Aging report')
            expect(payables).toBeGreaterThanOrEqual(0)
            expect(headings[payables + 1]).toBe('## Read the Vendor Balance report')
        })

        it('says what counts: posted transactions on Accounts payable accounts', () => {
            expect(balances).toMatch(/\bAccounts payable\b/)
        })

        it('names the As of day', () => {
            expect(balances).toMatch(/\bAs of\b/)
        })

        it("says a row equals the vendor page's Open balance, with a link to the vendor page", () => {
            expect(balances).toMatch(/\bOpen balance\b/)
            expect(balances).toContain('(help://books:vendor-pages)')
        })

        it("says a row equals the vendor's Total in the A/P Aging, in one sentence", () => {
            expect(oneSentence(/\bA\/P Aging\b/, /\bTotal\b/)).toBe(true)
        })

        it("says the report's Total equals the Balance Sheet", () => {
            expect(balances).toMatch(/\bBalance Sheet\b/)
        })

        it('names the No vendor row', () => {
            expect(balances).toMatch(/\bNo vendor\b/)
        })

        it('says a vendor row opens into its transactions', () => {
            expect(oneSentence(/\bpress the vendor row\b/i, /\btransactions\b/i)).toBe(true)
        })

        it('says a transaction opens its document', () => {
            expect(oneSentence(/\bpress\b/i, /\btransaction\b/i, /\bopens\b/i)).toBe(true)
        })

        it('names the Rows choices Non-zero and With activity', () => {
            expect(balances).toMatch(/\bNon-zero\b/)
            expect(balances).toMatch(/\bWith activity\b/)
        })

        it('names the Order choice Largest balance', () => {
            expect(balances).toMatch(/\bLargest balance\b/)
        })

        it('says a negative figure is money the vendor owes the business', () => {
            expect(oneSentence(/\bnegative\b/i, /\bowes\b/i)).toBe(true)
        })

        it('says to read the A/P Aging for open bills with their due dates', () => {
            expect(oneSentence(/\bA\/P Aging\b/, /\bdue dates?\b/i)).toBe(true)
        })

        it('says an inactive vendor is marked "(inactive)"', () => {
            expect(balances).toMatch(/\(inactive\)/)
        })

        it("names the Vendors list's Reports menu in one sentence", () => {
            expect(oneSentence(/\bReports\b/, /\bVendors list\b/, /\bVendor Balance\b/)).toBe(true)
        })

        it('has "vendor balance" in the frontmatter tags', () => {
            const tags = (/^tags:\s*\[(.*)\]\s*$/m.exec(frontmatter)?.[1] ?? '')
                .split(',')
                .map(tag => tag.trim().replace(/^["']|["']$/g, ''))
            expect(tags).toContain('vendor balance')
        })
    })

    // Expenses by Vendor checkpoint 4 (spec §3 "Help").
    describe('the "Read the Expenses by Vendor report" section', () => {
        const expenses = section('## Read the Expenses by Vendor report')
        const sentences = expenses.split(/(?<=[.!?])\s+/)
        const oneSentence = (...phrases: RegExp[]) =>
            sentences.some(sentence => phrases.every(phrase => phrase.test(sentence)))

        it('comes directly after "Read the Vendor Balance report"', () => {
            const headings = [...body.matchAll(/^## .*$/gm)].map(m => m[0])
            const balances = headings.indexOf('## Read the Vendor Balance report')
            expect(balances).toBeGreaterThanOrEqual(0)
            expect(headings[balances + 1]).toBe('## Read the Expenses by Vendor report')
        })

        it('says what counts: Cost of goods sold, Expense and Other expense accounts, in one sentence', () => {
            expect(oneSentence(/\bCost of goods sold\b/, /\bExpense\b/, /\bOther expense\b/)).toBe(
                true
            )
        })

        it('names the period and the basis', () => {
            expect(expenses).toMatch(/\bperiod\b/i)
            expect(expenses).toMatch(/\bAccrual\b/)
            expect(expenses).toMatch(/\bCash\b/)
        })

        it("says a vendor credit lowers the vendor's figure, in one sentence", () => {
            expect(oneSentence(/\bvendor credits?\b/i, /\b(lowers?|reduces?|below zero)\b/i)).toBe(
                true
            )
        })

        it('says the Total equals the expense sections of the Profit and Loss, in one sentence', () => {
            expect(oneSentence(/\bTotal\b/, /\bProfit and Loss\b/, /\b(equals?|same)\b/i)).toBe(
                true
            )
        })

        it('names the No vendor row', () => {
            expect(expenses).toMatch(/\bNo vendor\b/)
        })

        it('names % of expenses', () => {
            expect(expenses).toContain('% of expenses')
        })

        it('says a vendor row opens into its lines', () => {
            expect(oneSentence(/\bpress\b/i, /\bvendor\b/i, /\b(lines?|transactions?)\b/i)).toBe(
                true
            )
        })

        it('says a transaction opens its document', () => {
            expect(oneSentence(/\bpress\b/i, /\b(line|transaction)\b/i, /\bopens?\b/i)).toBe(true)
        })

        it('names the Rows choice With activity and the Order choice Largest expenses', () => {
            expect(expenses).toMatch(/\bWith activity\b/)
            expect(expenses).toMatch(/\bLargest expenses\b/)
        })

        it('says to read the Vendor Balance for what is still owed', () => {
            expect(oneSentence(/\bVendor Balance\b/, /\b(owe|owed|owes)\b/i)).toBe(true)
        })

        it('says that on Cash an opened vendor also shows the rows that take an unpaid bill out', () => {
            expect(
                oneSentence(
                    /\bCash\b/,
                    /\bunpaid bills?\b/i,
                    /\b(take|takes|taken|taking)\b[^.]*\bout\b/i
                )
            ).toBe(true)
        })

        // Fix round 1: a write-off line (No vendor, Cash "Write-off (cash basis)") and a
        // vendor refund's Cash row open their own documents too (server/entry_routes.json).
        it("lists a vendor refund and a write-off among the documents a line's press opens", () => {
            expect(
                oneSentence(
                    /\bpress\b/i,
                    /\bline\b/i,
                    /\bopens\b/i,
                    /\bvendor refund\b/i,
                    /\bwrite-off\b/i
                )
            ).toBe(true)
        })

        it('the Cash paragraph names the "paid by vendor credit (cash basis)" row of a bill', () => {
            const cash = expenses
                .split(/\n\s*\n/)
                .find(paragraph => paragraph.includes('Unpaid bill (cash basis)'))
            expect(cash, 'the Cash paragraph of the section').toBeDefined()
            expect(cash).toMatch(/\bBill \d+ paid by vendor credit \(cash basis\)/)
        })

        // Fix round 1: a line's label ends with lineDescriptionFormula() (the journal line's
        // memo, else the entry's memo); a bill posts no line memo, so its lines show the bill's.
        it("the open-a-vendor paragraph says a line shows its memo, or the entry's memo when it has none", () => {
            const opened = expenses
                .split(/\n\s*\n/)
                .find(paragraph => /\bpress the vendor row\b/i.test(paragraph))
            expect(opened, 'the open-a-vendor paragraph of the section').toBeDefined()
            const openedSentences = (opened ?? '').split(/(?<=[.!?])\s+/)
            expect(
                openedSentences.some(
                    sentence =>
                        /\bline'?s? memo\b|\bits memo\b|\bline memo\b/i.test(sentence) &&
                        /\b(entry|transaction)(?:'s)? memo\b/i.test(sentence) &&
                        /\b(no|none|not|empty|without)\b/i.test(sentence)
                ),
                "a sentence that names the line's memo, and the entry's memo when the line has none"
            ).toBe(true)
        })
    })

    it('"Who sees Books reports" names the Expenses by Vendor', () => {
        expect(section('## Who sees Books reports')).toContain('the Expenses by Vendor')
    })

    it.each([
        'Sales tax lines',
        'Tax agencies',
        'Tax rates',
        'Sales documents',
    ])('"Build your own Books report" names the source "%s"', label => {
        expect(section('## Build your own Books report')).toContain(label)
    })

    // Credit memo §3.10 (Q19): "Sales documents" holds credit memos with the Kind "Credit
    // memo" and their positive totals, so a report that adds totals across kinds filters by
    // Kind.
    describe('credit memos in "Build your own Books report"', () => {
        const sentences = section('## Build your own Books report').split(/(?<=[.!?])\s+/)
        const oneSentence = (...phrases: RegExp[]) =>
            sentences.some(sentence => phrases.every(phrase => phrase.test(sentence)))

        it('names the Kind "Credit memo" of Sales documents', () => {
            expect(oneSentence(/Sales documents/, /\bKind\b/, /"?Credit memo"?/)).toBe(true)
        })

        it('says to filter by Kind when adding totals across kinds', () => {
            expect(oneSentence(/\bfilter/i, /\bKind\b/, /\btotals?\b/i)).toBe(true)
        })
    })

    // Refund receipt §3.13 (Q10, Q11): a plain refund lowers sales and sales tax; a payout of
    // a credit memo brings back the memo on the Cash method on the refund date.
    describe('refund receipts', () => {
        const sentences = body.split(/(?<=[.!?])\s+/)
        const oneSentence = (...phrases: RegExp[]) =>
            sentences.some(sentence => phrases.every(phrase => phrase.test(sentence)))

        it('names refund receipts in a sentence on what they lower', () => {
            expect(
                oneSentence(/\brefund receipts?\b/i, /\b(less|lowers?|subtract(s|ed)?)\b/i)
            ).toBe(true)
        })

        it('no longer says that Books cannot yet refund a credit', () => {
            expect(body).not.toMatch(/\bcannot yet\b[^.]*\brefund/i)
        })
    })

    it('"Who sees Books reports" names the Profit and Loss, the Profit and Loss by Month and Transaction Detail by Account', () => {
        const who = section('## Who sees Books reports')
        expect(who).toContain('Profit and Loss by Month')
        expect(who.replaceAll('Profit and Loss by Month', '')).toContain('Profit and Loss')
        expect(who).toContain('Transaction Detail by Account')
    })

    describe('the "See the transactions behind an amount" section', () => {
        const see = section('## See the transactions behind an amount')
        const sentences = see.split(/(?<=[.!?])\s+/)
        const oneSentence = (...phrases: RegExp[]) =>
            sentences.some(sentence => phrases.every(phrase => phrase.test(sentence)))

        // "Profit and Loss by Month" holds "Profit and Loss", so the P&L is looked for in
        // the text without it.
        it('names "Profit and Loss" apart from "Profit and Loss by Month"', () => {
            expect(see.replaceAll('Profit and Loss by Month', '')).toContain('Profit and Loss')
        })

        it.each([
            'Profit and Loss by Month',
            'Balance Sheet',
            'Trial Balance',
            'Transaction Detail by Account',
            'Open as full report',
            'Close',
            'Back',
            'Period',
            'Accounts',
            'Reports',
        ])('names "%s"', phrase => {
            expect(see).toContain(phrase)
        })

        it("says in one sentence that the opened report's total equals the figure", () => {
            expect(
                oneSentence(/\btotal\b/i, /\b(equals?|same as|matches)\b/i, /\b(figure|amount)\b/i)
            ).toBe(true)
        })

        it('says where the transactions show: beside the statement, else as their own report', () => {
            expect(oneSentence(/\bbeside\b/i)).toBe(true)
            expect(oneSentence(/\bown (report|screen)\b/i)).toBe(true)
        })

        it('says in one sentence that a line opens its transaction', () => {
            expect(oneSentence(/\blines?\b/i, /\bopens?\b/i, /\btransaction\b/i)).toBe(true)
        })

        it('says that accounts of different types added by hand add their normal-side amounts', () => {
            expect(oneSentence(/normal side/i, /\btypes?\b/i)).toBe(true)
        })

        it('writes no shortcut as "Ctrl" or "Cmd"', () => {
            expect(see).not.toBe('')
            expect(body).not.toMatch(/\b(Ctrl|Cmd)\b/)
        })
    })

    it.each([
        '## Read the Trial Balance',
        '## Read the Balance Sheet',
        '## Read the Profit and Loss',
    ])('"%s" points to "See the transactions behind an amount"', heading => {
        expect(section(heading)).toContain('See the transactions behind an amount')
    })

    it.each([
        '## Read the General Ledger',
        '## Read the Journal',
    ])('"%s" says in one sentence that a line opens its transaction', heading => {
        const sentences = section(heading).split(/(?<=[.!?])\s+/)
        expect(
            sentences.some(
                sentence =>
                    /\blines?\b/i.test(sentence) &&
                    /\bopens?\b/i.test(sentence) &&
                    /\btransaction\b/i.test(sentence)
            )
        ).toBe(true)
    })

    it('"Who sees Books reports" names the Journal with the Trial Balance and the General Ledger', () => {
        const sentences = section('## Who sees Books reports').split(/(?<=[.!?])\s+/)
        expect(
            sentences.some(
                sentence =>
                    sentence.includes('Trial Balance') &&
                    sentence.includes('General Ledger') &&
                    /\bJournal\b/.test(sentence)
            )
        ).toBe(true)
    })

    it('drops the Books shell: no Accrual or Cash section and no Show rows', () => {
        expect(body).not.toMatch(/^## Choose Accrual or Cash$/m)
        expect(body).not.toContain('Show rows')
    })
})

// Write-off checkpoint 4 (write-off spec §3.6 Help): one paragraph on a write-off in reports.
describe('help/reports.md (write-offs)', () => {
    it('names a write-off or the Written off status', () => {
        expect(body).toMatch(/\bwrite-offs?\b|\bWritten off\b/i)
    })
})

// Statements spec §3.11: the reports topic names the two statement reports and links the
// statements topic.
describe('help/reports.md (statements)', () => {
    it('names the two statement reports', () => {
        expect(body).toContain('Statement: Balance Forward')
        expect(body).toContain('Statement: Open Items')
    })

    it('links the statements topic', () => {
        expect(body).toContain('(help://books:statements)')
    })
})

describe('help/navigating-books.md', () => {
    it('links the Books reports topic', () => {
        expect(navigatingSource).toContain('help://books:reports')
    })

    it('says Reports opens with only Books reports shown', () => {
        expect(navigatingSource).toContain('it opens Reports with only Books reports shown')
    })
})
