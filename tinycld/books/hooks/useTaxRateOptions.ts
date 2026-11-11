import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { materialize } from 'pbtsdb'
import type { TaxOptionAgency, TaxOptionRate } from '../lib/tax-rate-options'
import type { BooksTaxRates } from '../types'

// The rows a record form's sales tax picker offers: every rate and group, inactive ones
// too, so a stored inactive choice can still be shown, each rate with its agency for the
// headings. Tens of rows: the whole collection loads. Each row keeps `is_default`, which
// a new invoice's Tax starts from.
export function useTaxRateOptions(): {
    rows: (TaxOptionRate & Pick<BooksTaxRates, 'is_default'>)[]
    agencies: TaxOptionAgency[]
    isReady: boolean
    isError: boolean
    retry: () => void
} {
    const [ratesCollection, agenciesCollection] = useStore('books_tax_rates', 'books_tax_agencies')
    const query = useLiveQuery({
        query: q =>
            q.from({ rate: ratesCollection }).select(({ rate }) => ({
                ...rate,
                agencyRow: materialize(
                    q
                        .from({ agency: agenciesCollection })
                        .where(({ agency }) => eq(agency.id, rate.agency))
                        .findOne()
                ),
            })),
        queryKey: ['books.form.taxRates'],
    })
    // A failed live query does not recover on a reload of its collection. A source is
    // cleaned only when it failed itself, so a ready collection keeps its rows for every
    // other reader.
    const retry = () => {
        void recoverLiveQueries({
            queries: [query.collection],
            sources: [ratesCollection, agenciesCollection],
            onError: err => log.error('books.form.taxRates', err),
        })
    }
    const rows = query.data ?? []
    // A group has no agency, and several rates share one: each agency once.
    const agencies = new Map(
        rows.flatMap(row => (row.agencyRow ? [[row.agencyRow.id, row.agencyRow] as const] : []))
    )
    return {
        rows,
        agencies: [...agencies.values()],
        isReady: query.isReady,
        isError: query.isError,
        retry,
    }
}
