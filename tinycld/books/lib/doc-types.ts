export const DOC_TYPES: Record<string, { label: string; noun: string }> = {
    journal: { label: 'Journal entries', noun: 'entry' },
    transfer: { label: 'Transfers', noun: 'transfer' },
    invoice: { label: 'Invoices', noun: 'invoice' },
    sales_receipt: { label: 'Sales receipts', noun: 'sales receipt' },
    estimate: { label: 'Estimates', noun: 'estimate' },
    bill: { label: 'Bills', noun: 'bill' },
}

export function docTypeLabel(docType: string): string {
    return DOC_TYPES[docType]?.label ?? docType
}

// Estimates never post, so their numbers are taken when they are saved; journal entries
// keep the word "entries" rather than their label.
export function sequenceHelper(docType: string): string {
    const what = docType === 'journal' ? 'entries' : docTypeLabel(docType).toLowerCase()
    const verb = docType === 'estimate' ? 'saved' : 'posted'
    return `A new prefix applies to ${what} ${verb} from now on. Numbers already issued do not change. The next number can move forward only.`
}

export function nextNumberPreview(docType: string, prefix: string, next: string): string {
    const label = `Next ${DOC_TYPES[docType]?.noun ?? 'number'}:`
    if (!/^\d+$/.test(next)) return label
    const digits = next.replace(/^0+/, '')
    if (digits === '' || digits.length > 9) return label
    return `${label} ${prefix}${digits}`
}
