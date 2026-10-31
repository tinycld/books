import { isProductType, type ProductType } from './product-types'
import {
    newRecordPath,
    type OpenRecord,
    openRecordFromPath,
    RECORD_DETAIL_SCREENS,
    type RecordRoute,
    recordPath,
} from './record-route'

export const PRODUCTS_PATH = 'books/products'

export function productPath(id: string): RecordRoute {
    return recordPath(PRODUCTS_PATH, id)
}

export function newProductPath(type?: ProductType): RecordRoute {
    if (!type) return newRecordPath(PRODUCTS_PATH)
    return newRecordPath(PRODUCTS_PATH, { type })
}

export function openProductFromPath(pathname: string): OpenRecord {
    return openRecordFromPath(PRODUCTS_PATH, pathname)
}

export const PRODUCT_DETAIL_SCREENS = RECORD_DETAIL_SCREENS

// The type a `?type=` link chose. A reader never skips the chooser (its rows are
// disabled), and a repeated or unknown param chooses nothing.
export function chosenProductType(param: unknown, canWrite: boolean): ProductType | null {
    if (!canWrite || !isProductType(param)) return null
    return param
}
