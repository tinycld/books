import type { Page } from '@playwright/test'
import { type RecordKind, recordFormHelpers } from './record-form-helpers'
import { recordIdFromUrl } from './record-key-helpers'

// Shared by the vendor-form e2e specs: the record-form helpers bound to vendors.
// Vendors are created by driving the form; a spec never edits a seeded vendor.

export {
    accentOf,
    afterNextFrames,
    backgroundOf,
    CLASSIC_SCROLLBARS,
    contentArea,
    DESKTOP,
    edges,
    effectiveOpacity,
    exactText,
    expectTextInsideCell,
    holdLoads,
    isDisabled,
    isPhone,
    leaveBooks,
    leftEdgeOf,
    navigateInApp,
    openBooks,
    openBooksPage,
    type PatchAnswer,
    PHONE,
    refusalToast,
    refusedWrites,
    returnToBooks,
    SETTINGS_URL,
    settle,
    stacked,
    stampDigits,
    TABLET,
    takesClickAtCenter,
    textLeft,
    textTop,
    uniqueName,
    viewportName,
    WIDE,
} from './record-form-helpers'

export const VENDOR_KIND: RecordKind = {
    recordPrefix: 'vendor',
    listPrefix: 'vendors',
    pathSegment: 'vendors',
    collection: 'books_vendors',
    listCard: 'books-list-card-vendors',
    newTitle: 'New vendor',
    deleteTitle: 'Delete vendor',
    discardMessage: 'This vendor has changes that are not saved.',
    afterSave: 'record',
    formTab: 'vendor-tab-details',
}

// For the spec bindings that pass a vendor-only argument (a refusal text, a field key).
export const vendorHelpers = recordFormHelpers(VENDOR_KIND)

export const vendorEntries = vendorHelpers.entries
export const vendorEntry = vendorHelpers.entry
export const vendorSurface = vendorHelpers.surface
export const openVendorsList = vendorHelpers.openList
export const searchVendors = vendorHelpers.search
export const vendorIdOf = vendorHelpers.idOf
export const openVendor = vendorHelpers.open
export const field = vendorHelpers.field
export const openNewVendor = vendorHelpers.openNew
export const createVendor = vendorHelpers.create
export const expectVendorEditSaved = vendorHelpers.expectEditSaved
export const vendorPageUrl = vendorHelpers.recordPageUrl

// One vendor's page, with or without a query (`?tab=details`).
export function vendorPath(id: string) {
    return new RegExp(`/books/vendors/${id}(\\?[^#]*)?$`)
}

// The id of the vendor whose page is open, read from the URL (its code, or its id).
export function openVendorId(page: Page) {
    return recordIdFromUrl(page, 'vendors')
}

export const discardDialog = vendorHelpers.discardDialog
export const vendorsBase = vendorHelpers.base
export const holdVendorWrite = vendorHelpers.holdRecordWrite
export const pressEscapeOutsideInputs = vendorHelpers.pressEscapeOutsideInputs
export const expectEntriesInOrder = vendorHelpers.expectEntriesInOrder
export const tableScroll = vendorHelpers.tableScroll
export const headerRowWidth = vendorHelpers.headerRowWidth
export const panelPlacement = vendorHelpers.panelPlacement
export const listSpansContent = vendorHelpers.listSpansContent
// The vendor form's one address block is the `address` field.
export const cityLineFits = (page: Page) => vendorHelpers.cityLineFits(page, 'address')
export const watchForNotFoundAndDiscard = vendorHelpers.watchForNotFoundAndDiscard
export const seenNotFoundOrDiscard = vendorHelpers.seenNotFoundOrDiscard
export const jumpToBooksHome = vendorHelpers.jumpToBooksHome
export const openButton = vendorHelpers.openButton
export const menuItem = vendorHelpers.menuItem
export const openMenu = vendorHelpers.openMenu
export const closeMenu = vendorHelpers.closeMenu
export const chooseFromMenu = vendorHelpers.chooseFromMenu
export const deleteDialog = vendorHelpers.deleteDialog
export const openDeleteDialog = vendorHelpers.openDeleteDialog
export const inactiveLabel = vendorHelpers.inactiveLabel
export const isRecordUrl = vendorHelpers.isRecordUrl
export const isRecordsUrl = vendorHelpers.isRecordsUrl
export const patchAnswered = vendorHelpers.patchAnswered
export const insertAnswered = vendorHelpers.insertAnswered
