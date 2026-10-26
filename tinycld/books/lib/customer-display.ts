import type { TreeCustomer } from './customer-tree'

// The company under the display name, only when it says something the name does not.
export function companyLine(customer: Pick<TreeCustomer, 'display_name' | 'company'>): string {
    const company = customer.company ?? ''
    if (company === customer.display_name) return ''
    return company
}

export function customerLabel(
    customer: Pick<TreeCustomer, 'display_name'>,
    parent?: Pick<TreeCustomer, 'display_name'>
): string {
    if (!parent) return customer.display_name
    return `${parent.display_name} : ${customer.display_name}`
}

// The space around the text: the card centres its text in a fixed height (its 1 px bottom
// border included). With the name line it makes a name-only card 44 px tall at font
// scale 1, the touch target.
const CARD_PADDING = 24
// text-sm line height.
const CARD_NAME_LINE_HEIGHT = 20
// text-xs line height.
const CARD_MUTED_LINE_HEIGHT = 16

// A missing field and an empty one both draw no line.
export function isShownLine(value: string | undefined): value is string {
    return typeof value === 'string' && value !== ''
}

// The windowed card list needs every card's height before it renders, so the card is
// drawn at exactly this height. The name line and the muted lines grow with the native
// font scale and the padding does not, so a card is never shorter than its text.
export function customerCardHeight(customer: TreeCustomer, fontScale = 1): number {
    const lines = [companyLine(customer), customer.email, customer.phone].filter(isShownLine)
    const textHeight = CARD_NAME_LINE_HEIGHT + lines.length * CARD_MUTED_LINE_HEIGHT
    return CARD_PADDING + textHeight * fontScale
}

export const CUSTOMER_INDENT = 24

// Shared by the header and every row, so the columns line up. Name and Email shrink
// with an ellipsis but keep a minimum width, so neither collapses to blank.
export const CUSTOMER_COLUMNS = {
    name: { flexGrow: 3, flexShrink: 1, flexBasis: 0, minWidth: 180 },
    email: { flexGrow: 2, flexShrink: 1, flexBasis: 0, minWidth: 140 },
    phone: { width: 150, flexShrink: 0 },
    menu: { width: 44, flexShrink: 0 },
} as const

// Below this the table scrolls sideways.
export const CUSTOMERS_TABLE_MIN_WIDTH = 540

export const CUSTOMER_ROW_HEIGHT = 56

export function customerTitle({
    mode,
    isSubCustomer,
    canWrite,
}: {
    mode: 'new' | 'edit'
    isSubCustomer: boolean
    canWrite: boolean
}): string {
    if (!canWrite) return 'Customer'
    if (mode === 'edit') return 'Edit customer'
    return isSubCustomer ? 'New sub-customer' : 'New customer'
}
