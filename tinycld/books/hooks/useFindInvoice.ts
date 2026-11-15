import { and, eq, gt, inArray, queryOnce } from '@tanstack/db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { type FindMatch, type FindResult, findOutcome } from '../lib/payment-find'

/**
 * Find invoice no. with no customer chosen (spec §3.5, §4.4): one bounded read of the
 * posted invoices with an open balance that carry the number (at most two, enough to tell
 * one match from several), then the customers of the matches by id. Two matches cannot
 * happen while numbers are unique per sequence: the hook logs them and answers a miss.
 * A rejected read answers `failed`.
 */
export function useFindInvoice() {
    const [invoicesCollection, customersCollection] = useStore('books_invoices', 'books_customers')

    const readMatches = async (number: string): Promise<FindMatch[]> => {
        const invoices = await queryOnce({
            query: q =>
                q
                    .from({ invoice: invoicesCollection })
                    .where(({ invoice }) =>
                        and(
                            eq(invoice.number, number),
                            eq(invoice.status, 'posted'),
                            gt(invoice.balance, 0)
                        )
                    )
                    .orderBy(({ invoice }) => invoice.id)
                    .limit(2)
                    .select(({ invoice }) => ({
                        id: invoice.id,
                        number: invoice.number,
                        date: invoice.date,
                        due_date: invoice.due_date,
                        total: invoice.total,
                        balance: invoice.balance,
                        customer: invoice.customer,
                    })),
        })
        if (invoices.length === 0) return []
        const ids = [...new Set(invoices.map(invoice => invoice.customer))]
        const customers = await queryOnce({
            query: q =>
                q
                    .from({ customer: customersCollection })
                    .where(({ customer }) => inArray(customer.id, ids))
                    .select(({ customer }) => ({
                        id: customer.id,
                        name: customer.display_name,
                        inactive: customer.inactive,
                    })),
        })
        const byId = new Map(customers.map(customer => [customer.id, customer]))
        return invoices.flatMap(invoice => {
            const customer = byId.get(invoice.customer)
            if (!customer) return []
            return [
                {
                    invoice: {
                        id: invoice.id,
                        number: invoice.number,
                        date: invoice.date.slice(0, 10),
                        due_date: invoice.due_date.slice(0, 10),
                        total: invoice.total,
                        open: invoice.balance,
                    },
                    customer: {
                        id: customer.id,
                        name: customer.name,
                        active: !customer.inactive,
                    },
                },
            ]
        })
    }

    const find = async (number: string): Promise<FindResult> => {
        try {
            const matches = await readMatches(number)
            if (matches.length > 1) {
                log.warn('books.payment', 'two open invoices share a number', { number })
            }
            return findOutcome(matches)
        } catch (err) {
            log.error('books.payment', err, { number })
            return { kind: 'failed' }
        }
    }

    return { find }
}
