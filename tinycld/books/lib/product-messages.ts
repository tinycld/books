// The server texts mirror the refusals in server/products.go and
// server/accounts.go, which alone check them; the screens show the server's
// refusal on its field or in the root summary. tests/product-messages.test.ts
// fails if the server wording drifts.

export function duplicateProductNameMessage(name: string): string {
    return `A product or service named “${name}” already exists.`
}

export const BUNDLE_TYPE_FIXED = 'A bundle cannot change type.'

export const BUNDLE_ONLY_NEW = 'Only a new product can be a bundle.'

export const INCOME_ACCOUNT_REQUIRED = 'Choose an income account.'

export const INCOME_ACCOUNT_MISSING = 'The income account does not exist.'

export const INCOME_ACCOUNT_INACTIVE = 'The income account is inactive.'

export const INCOME_ACCOUNT_TYPE = 'The income account must be an Income or Other income account.'

export const EXPENSE_ACCOUNT_REQUIRED = 'Choose an expense account.'

export const PRODUCT_EXPENSE_ACCOUNT_LEDGER =
    "A product's expense account cannot be Accounts receivable or Accounts payable."

export const BUNDLE_HAS_NO_OWN = 'A bundle has no price, cost or accounts of its own.'

export const ITEM_NEEDS_BUNDLE = 'Items belong to a bundle.'

export const ITEM_STAYS_IN_BUNDLE = 'An item stays in its bundle.'

export const ITEM_PRODUCT_MISSING = 'The product or service does not exist.'

export const ITEM_IS_BUNDLE = 'A bundle cannot contain another bundle.'

export function inactiveItemMessage(name: string): string {
    return `“${name}” is inactive.`
}

export const ITEM_QUANTITY = 'Enter a quantity above 0 with at most 2 decimals.'

export const BUNDLE_ITEM_LIMIT = 'A bundle holds at most 50 items.'

// The delete refusal for a product on `count` distinct bundles.
export function productOnBundlesMessage(count: number): string {
    if (count === 1) {
        return 'This item is in 1 bundle. Take it out of it first, or make it inactive.'
    }
    return `This item is in ${count} bundles. Take it out of them first, or make it inactive.`
}

// The account delete refusal while `count` products name the account.
export function accountUsedByProductsMessage(count: number): string {
    if (count === 1) {
        return 'This account is used by 1 product or service and cannot be deleted. Make it inactive instead.'
    }
    return `This account is used by ${count} products and services and cannot be deleted. Make it inactive instead.`
}

// The toast title when a new bundle saved but one of its rows was refused.
export function bundlePartialMessage(message: string): string {
    return `The bundle was saved, but an item was not: ${message}`
}

export const PRODUCT_NOT_SAVED = 'The product was not saved.'

// The root error of a save that threw before the write.
export const PRODUCT_SAVE_FAILED = 'Books could not save this product.'

export const UNSAVED_PRODUCT_DELETE_WARNING = 'Unsaved changes to this product will be lost.'

// The Discard changes? question when an unsaved product form is left.
export const PRODUCT_DISCARD_MESSAGE = 'This product has changes that are not saved.'

export const PRODUCT_LOAD_ERROR = 'Could not load products and services'

// Shown in place of a new product's form when its accounts (the defaults) fail to load.
export const PRODUCT_ACCOUNTS_LOAD_ERROR = 'Could not load the accounts'

// Shown in place of the new product route when the caller's Books access fails to load.
export const PRODUCT_ACCESS_LOAD_ERROR = 'Could not check your access to Books'

export const PRODUCT_NOT_FOUND = "This product or service doesn't exist or was removed"

export const BUNDLE_KEEPS_TYPE = 'A bundle keeps its type.'

// The type chooser's note for a reader, whose rows are disabled.
export const CHOOSER_READ_ONLY = 'You can view products but not add them.'

// The delete dialog's line for a bundle.
export const BUNDLE_DELETE_NOTE = 'Its item list is deleted with it.'

// The money input's inline refusals (MONEY_VALUE_SCHEMA).
export const MONEY_MALFORMED = 'Enter an amount such as 1,250.00'

export const MONEY_NEGATIVE = 'Enter an amount of 0 or more'

export const MONEY_TOO_LARGE = 'Too large'

// The product texts of a record save, spread by useProductForm.
export const PRODUCT_SAVE_TEXTS = {
    logContext: 'books.products',
    notSavedTitle: PRODUCT_NOT_SAVED,
    clientSaveFailed: PRODUCT_SAVE_FAILED,
} as const
