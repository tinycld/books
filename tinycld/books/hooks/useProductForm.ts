import { tableRowsOf } from '@tinycld/core/lib/forms/table-rows'
import { notify } from '@tinycld/core/lib/notify/dispatcher'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useWatch } from '@tinycld/core/ui/form'
import { useMemo } from 'react'
import type { RecordChildState } from '../components/RecordChild'
import { PRODUCT_HOST_KEY } from '../forms/hosts'
import { bundleItemWrites } from '../lib/bundle-item-writes'
import { BUNDLE_ITEM_COLUMNS, BUNDLE_ITEM_MAPPER } from '../lib/bundle-items'
import {
    EMPTY_PRODUCT_COLUMNS,
    EMPTY_PRODUCT_FIELDS,
    productColumnsFor,
} from '../lib/product-columns'
import { productTitle } from '../lib/product-display'
import { productDefinitionFor } from '../lib/product-form'
import { bundlePartialMessage, PRODUCT_SAVE_TEXTS } from '../lib/product-messages'
import { isProductType, type ProductType } from '../lib/product-types'
import { refusalMessage } from '../lib/record-refusals'
import { applyPatch } from '../lib/record-save'
import { createTablePlans } from '../lib/table-writes'
import type { BooksProducts } from '../types'
import { useBundleItems } from './useBundleItems'
import { useIsShowingNewProduct, useProductNavigation } from './useProductNavigation'
import { SERVER_UNREACHED } from './useRecordActions'
import { useRecordForm } from './useRecordForm'
import { useRecordSave } from './useRecordSave'

// The product form's host tables: a bundle's item rows.
const BUNDLE_TABLES = { items: BUNDLE_ITEM_COLUMNS }

// A new product starts from its chosen type's values (the account defaults among them);
// the edited record is the row `useRecord` holds for the route.
export type ProductFormTarget =
    | { mode: 'new'; type: ProductType; createValues: Record<string, unknown> }
    | { mode: 'edit'; record: BooksProducts }

/** The open product's form, its fields and title following the type field. */
export function useProductForm(target: ProductFormTarget): RecordChildState {
    const record = target.mode === 'edit' ? target.record : undefined
    const bundleRows = useBundleItems(record?.id ?? '')
    const tables = bundleRows.isReady
        ? { items: tableRowsOf(bundleRows.rows, BUNDLE_ITEM_MAPPER) }
        : undefined
    const base = useRecordForm({
        hostKey: PRODUCT_HOST_KEY,
        logContext: 'books.products',
        mode: target.mode,
        record,
        createValues: target.mode === 'new' ? target.createValues : EMPTY_PRODUCT_FIELDS,
        tables,
    })
    // The visible fields and the title follow the type field as it changes.
    const watched = useWatch({ control: base.form.control, name: 'type' })
    const fallback = record?.type ?? (target.mode === 'new' ? target.type : 'service')
    const type = isProductType(watched) ? watched : fallback
    const navigation = useProductNavigation()
    const isShowingNew = useIsShowingNewProduct()
    const [productsCollection, itemsCollection] = useStore('books_products', 'books_bundle_items')
    const stored = base.definition
    const definition = useMemo(
        () => (stored ? productDefinitionFor(stored, type, base.host) : undefined),
        [stored, type, base.host]
    )
    const saver = useRecordSave(
        {
            columnsFrom: columns => productColumnsFor(type, columns),
            emptyColumns: EMPTY_PRODUCT_COLUMNS,
            insert: row => productsCollection.insert(row),
            update: (id, patch, fields) =>
                productsCollection.update(id, draft => applyPatch(draft, patch, fields)),
            ...PRODUCT_SAVE_TEXTS,
            rows: {
                createPlans: tables => createTablePlans(tables, BUNDLE_TABLES),
                writes: (recordId, plans) =>
                    bundleItemWrites(recordId, plans.items, {
                        insert: row => itemsCollection.insert(row),
                        update: (id, values) =>
                            itemsCollection.update(id, draft => Object.assign(draft, values)),
                        remove: id => itemsCollection.delete(id),
                    }),
                // The bundle is saved, so the user lands on it with the rows that were
                // written; one who left the new form meanwhile is not moved.
                onPartialCreate: (recordId, error) => {
                    const message = refusalMessage(error)
                    notify.emit({
                        event: 'mutation.error',
                        title: bundlePartialMessage(message ?? SERVER_UNREACHED),
                        data: { operation: 'books.products.save', error: message ?? '' },
                    })
                    if (isShowingNew()) navigation.open(recordId)
                },
            },
            // The next form starts from the type just saved, which a Service ↔
            // Non-inventory change can make differ from the route's.
            onSavedAndNew: columns => {
                if (target.mode === 'new' && columns.type && columns.type !== target.type) {
                    navigation.switchNewType(columns.type)
                }
            },
        },
        {
            mode: target.mode,
            create: base.create,
            edit: base.edit,
            recordId: record?.id ?? '',
            leave: navigation.leave,
            host: base.host,
            context: base.context,
            definition,
        }
    )
    return {
        ...base,
        ...saver,
        definition,
        title: productTitle(type, { mode: target.mode, canWrite: base.canWrite }),
    }
}
