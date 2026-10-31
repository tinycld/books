import { router } from 'expo-router'
import { PRODUCTS_PATH } from '../lib/product-route'
import type { ProductType } from '../lib/product-types'
import {
    useIsShowingNewRecord,
    useIsShowingRecord,
    useRecordNavigation,
} from './useRecordNavigation'

export function useProductNavigation() {
    const nav = useRecordNavigation(PRODUCTS_PATH)
    return {
        open: nav.open,
        openNew: (type?: ProductType) => nav.openNew(type ? { type } : undefined),
        leave: nav.leave,
        // On the new product route, the form of another type: the route keys its form by
        // `?type=`, so the form starts again from that type's values. It replaces the
        // param and adds no history entry.
        switchNewType: (type: ProductType) => router.setParams({ type }),
    }
}

export const useIsShowingProduct = () => useIsShowingRecord(PRODUCTS_PATH)

export const useIsShowingNewProduct = () => useIsShowingNewRecord(PRODUCTS_PATH)
