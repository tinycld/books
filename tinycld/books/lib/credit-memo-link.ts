// The text of a credit memo's invoice link (spec §3.2, §3.7): the form's link row, the
// read view's band row and the PDF say the same words. A void invoice keeps the link
// (Q18), and the text says it is void.
export function invoiceLinkLabel(invoice: { number: string; status: string }): string {
    const label = `For invoice ${invoice.number}`
    return invoice.status === 'void' ? `${label} (void)` : label
}
