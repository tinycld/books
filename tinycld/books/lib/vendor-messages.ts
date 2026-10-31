// These strings mirror the refusals in server/vendors.go, which alone checks
// them; the screens show the server's refusal on its field.
// tests/vendor-messages.test.ts fails if the server wording drifts.

export function duplicateVendorNameMessage(name: string): string {
    return `A vendor named “${name}” already exists.`
}

export const EXPENSE_ACCOUNT_MISSING = 'The expense account does not exist.'

export const EXPENSE_ACCOUNT_INACTIVE = 'The expense account is inactive.'

export const EXPENSE_ACCOUNT_LEDGER =
    "A vendor's default expense account cannot be Accounts receivable or Accounts payable."

// msgTaxIDDigits and msgTaxIDType in server/vendors.go.
export const TAX_ID_DIGITS = 'A tax ID has 9 digits.'

export const TAX_ID_TYPE_MISSING = 'Choose whether the tax ID is an EIN or an SSN.'

export const VENDOR_NOT_SAVED = 'The vendor was not saved.'

// The root error of a save that threw before the write.
export const VENDOR_SAVE_FAILED = 'Books could not save this vendor.'

export const UNSAVED_VENDOR_DELETE_WARNING = 'Unsaved changes to this vendor will be lost.'

// The Discard changes? question when an unsaved vendor form is left.
export const VENDOR_DISCARD_MESSAGE = 'This vendor has changes that are not saved.'

export const VENDOR_LOAD_ERROR = 'Could not load vendors'

// The vendor texts of a record save, spread by useVendorForm.
export const VENDOR_SAVE_TEXTS = {
    logContext: 'books.vendors',
    notSavedTitle: VENDOR_NOT_SAVED,
    clientSaveFailed: VENDOR_SAVE_FAILED,
} as const
