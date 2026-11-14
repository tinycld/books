// The options of the bill's pickers (spec §3.3, §3.4): the Account cell of an account
// line, the Product or service cell of a product line and the Vendor field. Pure builders
// over rows, so their filters and the labels of a stored value are unit-tested; each
// picker narrows them by the typed term. A stored choice the list no longer offers (made
// inactive, or no longer purchased) is kept, marked, so a draft or a correction shows the
// value it holds.

import type { SearchPickerOption } from '../components/SearchPicker'
import type { BooksAccounts, BooksProducts, BooksVendors } from '../types'
import { accountOptionList } from './account-options'
import { BILL_ACCOUNT_TYPES } from './purchase-line-columns'

export const BILL_ACCOUNT_EMPTY_TEXT = 'No expense accounts'
export const PURCHASE_PRODUCT_EMPTY_TEXT = 'No purchased products or services'
export const VENDOR_PICKER_EMPTY_TEXT = 'No active vendors'

const INACTIVE_SUFFIX = '(inactive)'
const NOT_PURCHASED_SUFFIX = '(not purchased)'

export type BillAccountOption = SearchPickerOption & { indent: number }

// `type` is any text: an account type the list does not know is simply not offered.
type BillAccountRow = Pick<BooksAccounts, 'id' | 'name' | 'number' | 'parent' | 'inactive'> & {
    type: string
}

// Whether the Account picker of an account line lists the account: active, and of a type
// an account line may charge. A vendor pick, and a new form opened with `?vendor`, put the
// vendor's default expense account on the first account line only when this holds.
export function isBillAccountListed(
    account: Pick<BillAccountRow, 'inactive' | 'type'> | undefined
): boolean {
    return account !== undefined && !account.inactive && BILL_ACCOUNT_TYPES.has(account.type)
}

// The active accounts of a type an account line may charge, in chart order, indented by
// depth, labelled "<number> <name>". The stored account, when the list does not offer it,
// keeps its chart place, marked "(inactive)" when it is.
export function billAccountOptions(
    accounts: readonly BillAccountRow[],
    storedId: string
): BillAccountOption[] {
    const stored = accounts.find(account => account.id === storedId)
    const isStoredExtra = stored !== undefined && !isBillAccountListed(stored)
    // The walk offers active accounts only; the stored one walks as active to keep its place.
    const walked = isStoredExtra
        ? accounts.map(account =>
              account.id === storedId ? { ...account, inactive: false } : account
          )
        : accounts
    const { options } = accountOptionList(walked)
    const kept = new Set(accounts.filter(isBillAccountListed).map(account => account.id))
    return options
        .filter(option => kept.has(option.value) || (isStoredExtra && option.value === storedId))
        .map(option => ({
            id: option.value,
            label:
                option.value === storedId && stored?.inactive
                    ? `${option.label} ${INACTIVE_SUFFIX}`
                    : option.label,
            indent: option.indent,
        }))
}

type PurchaseProductRow = Pick<BooksProducts, 'id' | 'name' | 'type' | 'inactive' | 'purchases'>

const PURCHASE_PRODUCT_TYPES: ReadonlySet<string> = new Set(['service', 'non_inventory'])

function isPurchasable(product: PurchaseProductRow): boolean {
    return !product.inactive && product.purchases && PURCHASE_PRODUCT_TYPES.has(product.type)
}

// The mark of a product a bill line holds that the purchase list does not offer:
// "(inactive)" when it was made inactive, else "(not purchased)" when "I purchase this"
// is off; none for a product the list offers. Both the option label and the picker's
// trigger use it.
export function purchaseProductSuffix(
    product: Pick<PurchaseProductRow, 'inactive' | 'purchases'>
): string | undefined {
    if (product.inactive) return INACTIVE_SUFFIX
    if (!product.purchases) return NOT_PURCHASED_SUFFIX
    return undefined
}

function storedProductLabel(product: PurchaseProductRow): string {
    const suffix = purchaseProductSuffix(product)
    return suffix ? `${product.name} ${suffix}` : product.name
}

// The active Service and Non-inventory products with "I purchase this" on, in the order
// given (the picker's query sorts them by name). The stored product, when the list does
// not offer it, is added first, marked "(inactive)" or "(not purchased)".
export function purchaseProductOptions(
    products: readonly PurchaseProductRow[],
    storedId: string
): SearchPickerOption[] {
    const listed = products
        .filter(isPurchasable)
        .map(product => ({ id: product.id, label: product.name }))
    const stored = products.find(product => product.id === storedId)
    if (!stored || isPurchasable(stored)) return listed
    return [{ id: stored.id, label: storedProductLabel(stored) }, ...listed]
}

type VendorPickerRow = Pick<BooksVendors, 'id' | 'display_name' | 'inactive'>

// The active vendors by name. The stored vendor, when it is inactive, keeps its place by
// name, marked "(inactive)": a correction keeps its original's vendor.
export function vendorPickerOptions(
    vendors: readonly VendorPickerRow[],
    storedId: string
): SearchPickerOption[] {
    return vendors
        .filter(vendor => !vendor.inactive || vendor.id === storedId)
        .sort((a, b) => a.display_name.localeCompare(b.display_name))
        .map(vendor => ({
            id: vendor.id,
            label: vendor.inactive
                ? `${vendor.display_name} ${INACTIVE_SUFFIX}`
                : vendor.display_name,
        }))
}
