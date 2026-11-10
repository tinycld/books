import { and, eq, inArray } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { recoverLiveQueries } from '@tinycld/core/lib/recover-live-queries'
import type { PressableInstance } from 'react-native'
import { type LiveRecovery, mergeRecoveries } from '../../lib/live-recovery'
import { PRODUCT_PICKER_LIMIT, productPickerOptions } from '../../lib/product-list'
import type { BooksProducts } from '../../types'
import { SearchPicker, useSearchPicker } from '../SearchPicker'

type ProductType = BooksProducts['type']

// The types a bundle item may hold: today's picker.
const BUNDLE_ITEM_TYPES: readonly ProductType[] = ['service', 'non_inventory']

const NO_RECOVERY: LiveRecovery = { queries: [], sources: [] }

interface ProductPickerProps {
    value: string
    onChange: (id: string) => void
    disabled: boolean
    // The accessible name of the trigger, such as the table cell's column and row.
    label: string
    testID: string
    // The product types listed; default the bundle item types.
    types?: readonly ProductType[]
    // A table cell's focus ref and row focus notes.
    triggerRef?: (node: PressableInstance | null) => void
    onFocus?: () => void
    onBlur?: () => void
    // After a pick: the caller moves focus on (a line's next cell).
    onPicked?: () => void
}

// Active products of the given types. The name and SKU search runs on the client
// (`productPickerOptions`): it was written when pbtsdb could not push `ilike`, and
// pbtsdb 2.1.0 pushes it as PocketBase `~`, so it can move to the server later. The
// server limit applies only while not searching: a limit pushed during a search would
// cut matches before the filter sees them.
function usePickerProducts(isOpen: boolean, isSearching: boolean, types: readonly ProductType[]) {
    const [productsCollection] = useStore('books_products')
    const typeKey = types.join(',')
    const query = useLiveQuery({
        query: q => {
            if (!isOpen) return null
            const base = q
                .from({ p: productsCollection })
                .where(({ p }) => and(inArray(p.type, [...types]), eq(p.inactive, false)))
                .orderBy(({ p }) => p.name)
            return isSearching ? base : base.limit(PRODUCT_PICKER_LIMIT)
        },
        queryKey: ['books.products.picker', isOpen, isSearching, typeKey],
    })
    return { query, productsCollection }
}

// The chosen product by id, with its load error (useRecord has none): the trigger
// names it, inactive ones included.
function useChosenProduct(
    productsCollection: ReturnType<typeof usePickerProducts>['productsCollection'],
    id: string
) {
    return useLiveQuery({
        query: q =>
            id
                ? q
                      .from({ p: productsCollection })
                      .where(({ p }) => eq(p.id, id))
                      .findOne()
                : null,
        queryKey: ['books.products.chosen', id],
    })
}

type ChosenQuery = ReturnType<typeof useChosenProduct>

// The trigger's text: the placeholder with no value; `…` while the chosen row loads;
// "Unknown product" when its read failed or it no longer exists (the id is kept).
function chosenNameOf(value: string, chosen: ChosenQuery): string {
    if (!value) return 'Choose a product or service'
    if (chosen.isError) return 'Unknown product'
    if (chosen.data) return chosen.data.name
    return chosen.isLoading ? '…' : 'Unknown product'
}

/**
 * A searchable menu of active products of `types` (default Service and Non-inventory,
 * the bundle items' picker), 50 at a time, searched by name or SKU. The trigger names
 * the chosen product, with "(inactive)" when it was made inactive after it was chosen.
 */
export function ProductPicker({
    value,
    onChange,
    disabled,
    label,
    testID,
    types = BUNDLE_ITEM_TYPES,
    triggerRef,
    onFocus,
    onBlur,
    onPicked,
}: ProductPickerProps) {
    const picker = useSearchPicker()
    const isSearching = picker.debouncedTerm.trim() !== ''
    const { query, productsCollection } = usePickerProducts(picker.isOpen, isSearching, types)
    const chosen = useChosenProduct(productsCollection, value)
    const options = productPickerOptions(query.data ?? [], picker.debouncedTerm).map(p => ({
        id: p.id,
        label: p.name,
    }))
    const chosenName = chosenNameOf(value, chosen)
    const triggerSuffix = chosen.data?.inactive ? '(inactive)' : undefined
    const accessibilityLabel = `${label}: ${value ? chosenName : 'none'}`
    const isLoading = picker.isOpen && !query.isError && query.isLoading
    const listRecovery: LiveRecovery = query.isError
        ? { queries: [query.collection], sources: [productsCollection] }
        : NO_RECOVERY
    const chosenRecovery: LiveRecovery = chosen.isError
        ? { queries: [chosen.collection], sources: [productsCollection] }
        : NO_RECOVERY
    const retry = () => {
        void recoverLiveQueries({
            ...mergeRecoveries([listRecovery, chosenRecovery]),
            onError: err => log.error('books.products.picker', err),
        })
    }
    return (
        <SearchPicker
            picker={picker}
            title="Product or service"
            triggerLabel={chosenName}
            isPlaceholder={!value}
            triggerSuffix={triggerSuffix}
            triggerAccessibilityLabel={accessibilityLabel}
            triggerTestId={testID}
            disabled={disabled}
            searchPlaceholder="Search products and services"
            searchTestId={`${testID}-search`}
            options={options}
            optionTestIdPrefix={`${testID}-option`}
            value={value}
            onChange={onChange}
            isLoading={isLoading}
            loadFailed={query.isError}
            onRetry={retry}
            triggerRef={triggerRef}
            onTriggerFocus={onFocus}
            onTriggerBlur={onBlur}
            onPicked={onPicked}
        />
    )
}
