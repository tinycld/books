import { type RecordKind, recordFormHelpers } from './record-form-helpers'

// Shared by the customer-form e2e specs: the record-form helpers bound to customers.

export {
    afterNextFrames,
    backgroundOf,
    boxOf,
    CLASSIC_SCROLLBARS,
    contentArea,
    DESKTOP,
    edges,
    effectiveOpacity,
    expectTextInsideCell,
    fieldCellsOutOfOrder,
    holdLoads,
    inputKinds,
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
    sideBySide,
    stacked,
    stampDigits,
    TABLET,
    takesClickAtCenter,
    textLeft,
    textTop,
    uniqueName,
    WIDE,
} from './record-form-helpers'

export const CUSTOMER_KIND: RecordKind = {
    recordPrefix: 'customer',
    listPrefix: 'customers',
    pathSegment: 'customers',
    collection: 'books_customers',
    listCard: 'books-list-card-customers',
    newTitle: 'New customer',
    deleteTitle: 'Delete customer',
    discardMessage: 'This customer has changes that are not saved.',
}

const customers = recordFormHelpers(CUSTOMER_KIND)

// For the spec bindings that pass a customer-only argument (a refusal text, a field key).
export const customerHelpers = customers

export type NewCustomerValues = Parameters<typeof customers.create>[1]

export const customerEntries = customers.entries
export const customerEntry = customers.entry
export const customerSurface = customers.surface
export const openCustomersList = customers.openList
export const searchCustomers = customers.search
export const customerIdOf = customers.idOf
export const openCustomer = customers.open
export const field = customers.field
export const openNewCustomer = customers.openNew
export const createCustomer = customers.create
export const discardDialog = customers.discardDialog
export const customersBase = customers.base
export const holdRecordWrite = customers.holdRecordWrite
export const pressEscapeOutsideInputs = customers.pressEscapeOutsideInputs
export const isRecordUrl = customers.isRecordUrl
export const isRecordsUrl = customers.isRecordsUrl
export const patchAnswered = customers.patchAnswered
export const insertAnswered = customers.insertAnswered
export const tableScroll = customers.tableScroll
export const headerRowWidth = customers.headerRowWidth
export const expectEntriesInOrder = customers.expectEntriesInOrder
export const panelPlacement = customers.panelPlacement
export const listSpansContent = customers.listSpansContent
export const watchForNotFoundAndDiscard = customers.watchForNotFoundAndDiscard
export const seenNotFoundOrDiscard = customers.seenNotFoundOrDiscard
export const recordUrl = customers.recordUrl
export const openButton = customers.openButton
export const menuItem = customers.menuItem
export const openMenu = customers.openMenu
export const closeMenu = customers.closeMenu
export const chooseFromMenu = customers.chooseFromMenu
export const inactiveLabel = customers.inactiveLabel
