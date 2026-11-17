// The text of a credit memo's invoice link (spec §3.2, §3.7): the form's link row, the
// read view's band row and the PDF say the same words. A void invoice keeps the link
// (Q18), and the text says it is void.
export function invoiceLinkLabel(invoice: { number: string; status: string }): string {
    const label = `For invoice ${invoice.number}`
    return invoice.status === 'void' ? `${label} (void)` : label
}

// The key the server's refusal of a credit memo's invoice link is filed at in the form:
// no built-in draws it, so the form's link row (DocumentKind.FormBandRow) draws it while
// the link shows.
export const INVOICE_LINK_KEY = 'invoice'
