import { eq, ilike } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import { PICKER_LIMIT } from '../../lib/customer-tree'
import { allOf } from '../../lib/document-list'
import { searchPieces } from '../../lib/list-search'
import { type LiveRecovery, mergeRecoveries } from '../../lib/live-recovery'
import { SearchPicker, useSearchPicker } from '../SearchPicker'

const ALL_CUSTOMERS = 'All customers'
const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

// Every customer, sub-customers and inactive ones included (no `where` on either), by
// display name; each typed piece must be in the name (`searchPieces`: a piece holds no
// wildcard, so the server matches it as plain text). It runs only while the picker is
// open. With no search typed it lists the first PICKER_LIMIT names; a search lists
// every match, as the other Books pickers do.
function useCustomerOptions(term: string, isOpen: boolean) {
    const [customersCollection] = useStore('books_customers')
    const pieces = searchPieces(term)
    const query = useLiveQuery({
        query: q => {
            if (!isOpen) return undefined
            const from = q.from({ c: customersCollection })
            if (pieces.length === 0) {
                return from.orderBy(({ c }) => c.display_name).limit(PICKER_LIMIT)
            }
            return from
                .where(({ c }) => allOf(pieces.map(piece => ilike(c.display_name, `%${piece}%`))))
                .orderBy(({ c }) => c.display_name)
        },
        queryKey: ['books.sales-lists.customer-filter', isOpen, ...pieces],
    })
    const options = (query.data ?? []).map(c => ({ id: c.id, label: c.display_name }))
    const isError = isOpen && query.isError
    return {
        options,
        isLoading: isOpen && !query.isReady && !query.isError,
        isError,
        recovery: isError
            ? { queries: [query.collection], sources: [customersCollection] }
            : NO_RECOVERY,
    }
}

// The chosen customer's display name, read by its own query, so the trigger names it
// while the picker is closed. A customer that is gone (deleted while chosen) is named so;
// All customers then removes the filter.
function useChosenLabel(customerId: string) {
    const [customersCollection] = useStore('books_customers')
    const hasCustomer = customerId !== ''
    const query = useLiveQuery({
        query: q => {
            if (!hasCustomer) return undefined
            return q
                .from({ c: customersCollection })
                .where(({ c }) => eq(c.id, customerId))
                .findOne()
        },
        queryKey: ['books.sales-lists.customer-filter-label', customerId],
    })
    const isError = hasCustomer && query.isError
    const recovery: LiveRecovery = isError
        ? { queries: [query.collection], sources: [customersCollection] }
        : NO_RECOVERY
    return { label: chosenLabel(hasCustomer, query, isError), isError, recovery }
}

function chosenLabel(
    hasCustomer: boolean,
    query: { data: { display_name: string } | undefined; isReady: boolean },
    isError: boolean
): string {
    if (!hasCustomer) return ALL_CUSTOMERS
    if (isError) return 'Customer could not load'
    if (!query.isReady) return 'Loading…'
    return query.data?.display_name ?? 'Customer not found'
}

interface DocumentCustomerFilterProps {
    value: string
    // The chosen customer's id, or '' for All customers.
    onChange(customerId: string): void
}

/**
 * The Sales list's customer filter (spec docs/specs/sales-lists-design.md §3): a search
 * picker over every customer, whose first item, All customers, removes the filter. Its
 * reads are its own: while they load the picker shows "Loading…", and when one fails it
 * shows "Could not load." with Retry, which restarts both. A reader has it too: a filter
 * is not a write.
 */
export function DocumentCustomerFilter({ value, onChange }: DocumentCustomerFilterProps) {
    const picker = useSearchPicker()
    const customers = useCustomerOptions(picker.debouncedTerm, picker.isOpen)
    const chosen = useChosenLabel(value)
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([customers.recovery, chosen.recovery]),
            onError: err => log.warn('books.sales-lists', 'retry failed', { err }),
        })
    }
    return (
        <SearchPicker
            picker={picker}
            title="Customer"
            triggerLabel={chosen.label}
            triggerAccessibilityLabel="Customer"
            triggerTestId="sales-customer"
            disabled={false}
            searchPlaceholder="Search customers"
            searchTestId="sales-customer-search"
            options={customers.options}
            optionTestIdPrefix="sales-customer-option"
            value={value}
            onChange={onChange}
            noneOption={{ label: ALL_CUSTOMERS, testID: 'sales-customer-all' }}
            isLoading={customers.isLoading}
            loadFailed={customers.isError || chosen.isError}
            onRetry={retry}
            emptyText="No customers match"
        />
    )
}
