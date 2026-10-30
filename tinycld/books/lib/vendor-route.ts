import {
    newRecordPath,
    type OpenRecord,
    openRecordFromPath,
    type RecordRoute,
    recordPath,
} from './record-route'

export const VENDORS_PATH = 'books/vendors'

export function vendorPath(id: string): RecordRoute {
    return recordPath(VENDORS_PATH, id)
}

export function newVendorPath(): RecordRoute {
    return newRecordPath(VENDORS_PATH)
}

export function openVendorFromPath(pathname: string): OpenRecord {
    return openRecordFromPath(VENDORS_PATH, pathname)
}
