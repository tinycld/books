// The pure rules the customer's pages share (the estimate page and the invoice page):
// whose name the page shows, and the business contact under its card.

export function businessNameOf(row: { business_name: string }, deploymentName: string): string {
    const name = row.business_name.trim()
    return name === '' ? deploymentName : name
}

export function contactOf(row: {
    business_email: string
    business_phone: string
}): { email: string; phone: string } | null {
    const email = row.business_email.trim()
    const phone = row.business_phone.trim()
    if (email === '' && phone === '') return null
    return { email, phone }
}

export function contactLeadOf(business: string): string {
    return `Questions? Contact ${business}`
}

// A tel: link holds no spaces; the phone shows as Books has it.
export function contactUrlsOf(contact: { email: string; phone: string }): {
    mailto: string
    tel: string
} {
    return {
        mailto: `mailto:${contact.email}`,
        tel: `tel:${contact.phone.replace(/\s+/g, '')}`,
    }
}
