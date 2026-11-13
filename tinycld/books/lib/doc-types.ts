export const DOC_TYPES: Record<string, { label: string; noun: string }> = {
    journal: { label: 'Journal entries', noun: 'entry' },
    transfer: { label: 'Transfers', noun: 'transfer' },
    invoice: { label: 'Invoices', noun: 'invoice' },
    sales_receipt: { label: 'Sales receipts', noun: 'sales receipt' },
}

export function docTypeLabel(docType: string): string {
    return DOC_TYPES[docType]?.label ?? docType
}

export function nextNumberPreview(docType: string, prefix: string, next: string): string {
    const label = `Next ${DOC_TYPES[docType]?.noun ?? 'number'}:`
    if (!/^\d+$/.test(next)) return label
    const digits = next.replace(/^0+/, '')
    if (digits === '' || digits.length > 9) return label
    return `${label} ${prefix}${digits}`
}
