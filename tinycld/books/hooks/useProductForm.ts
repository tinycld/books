import { useStore } from '@tinycld/core/lib/pocketbase'
import { useWatch } from '@tinycld/core/ui/form'
import { useMemo } from 'react'
import type { RecordChildState } from '../components/RecordChild'
import { PRODUCT_HOST_KEY } from '../forms/hosts'
import {
    EMPTY_PRODUCT_COLUMNS,
    EMPTY_PRODUCT_FIELDS,
    productColumnsFor,
} from '../lib/product-columns'
import { productTitle } from '../lib/product-display'
import { productDefinitionFor } from '../lib/product-form'
import { PRODUCT_SAVE_TEXTS } from '../lib/product-messages'
import { isProductType, type ProductType } from '../lib/product-types'
import { applyPatch } from '../lib/record-save'
import type { BooksProducts } from '../types'
import { useProductNavigation } from './useProductNavigation'
import { useRecordForm } from './useRecordForm'
import { useRecordSave } from './useRecordSave'

// A new product starts from its chosen type's values (the account defaults among them);
// the edited record is the row `useRecord` holds for the route.
export type ProductFormTarget =
    | { mode: 'new'; type: ProductType; createValues: Record<string, unknown> }
    | { mode: 'edit'; record: BooksProducts }

/** The open product's form, its fields and title following the type field. */
export function useProductForm(target: ProductFormTarget): RecordChildState {
    const record = target.mode === 'edit' ? target.record : undefined
    const base = useRecordForm({
        hostKey: PRODUCT_HOST_KEY,
        logContext: 'books.products',
        mode: target.mode,
        record,
        createValues: target.mode === 'new' ? target.createValues : EMPTY_PRODUCT_FIELDS,
    })
    // The visible fields and the title follow the type field as it changes.
    const watched = useWatch({ control: base.form.control, name: 'type' })
    const fallback = record?.type ?? (target.mode === 'new' ? target.type : 'service')
    const type = isProductType(watched) ? watched : fallback
    const { leave } = useProductNavigation()
    const [productsCollection] = useStore('books_products')
    const saver = useRecordSave(
        {
            columnsFrom: columns => productColumnsFor(type, columns),
            emptyColumns: EMPTY_PRODUCT_COLUMNS,
            insert: row => productsCollection.insert(row),
            update: (id, patch, fields) =>
                productsCollection.update(id, draft => applyPatch(draft, patch, fields)),
            ...PRODUCT_SAVE_TEXTS,
        },
        {
            mode: target.mode,
            create: base.create,
            edit: base.edit,
            recordId: record?.id ?? '',
            leave,
        }
    )
    const stored = base.definition
    const definition = useMemo(
        () => (stored ? productDefinitionFor(stored, type, base.host) : undefined),
        [stored, type, base.host]
    )
    return {
        ...base,
        ...saver,
        definition,
        title: productTitle(type, { mode: target.mode, canWrite: base.canWrite }),
    }
}
