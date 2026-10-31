import { PRODUCTS_PATH } from '../lib/product-route'
import type { ProductType } from '../lib/product-types'
import { useIsShowingRecord, useRecordNavigation } from './useRecordNavigation'

export function useProductNavigation() {
    const nav = useRecordNavigation(PRODUCTS_PATH)
    return {
        open: nav.open,
        openNew: (type?: ProductType) => nav.openNew(type ? { type } : undefined),
        leave: nav.leave,
    }
}

export const useIsShowingProduct = () => useIsShowingRecord(PRODUCTS_PATH)
