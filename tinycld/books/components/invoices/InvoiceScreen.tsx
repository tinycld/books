import {
    type InvoiceScreenData,
    type InvoiceScreenInput,
    useInvoiceScreen,
} from '../../hooks/useInvoiceScreen'
import { INVOICE_MESSAGES } from '../../lib/invoice-messages'
import { InvoiceForm } from './InvoiceForm'
import { InvoiceLoadError } from './InvoiceLoadError'
import { InvoiceLoading } from './InvoiceLoading'
import { InvoiceNotice } from './InvoiceNotice'
import { InvoiceReadView } from './InvoiceReadView'

// `read` comes with the invoice loaded; the check keeps the type honest.
function ReadState({ data }: { data: InvoiceScreenData }) {
    if (!data.invoice) return <InvoiceLoading />
    return <InvoiceReadView data={data} invoice={data.invoice} />
}

/**
 * The invoice routes' one screen: it loads the invoice (or nothing, on a new form) and
 * shows the state `invoiceScreenState` names. The form is keyed on its form key, so a
 * new route (another id, or a fresh `new`) mounts a fresh form.
 */
export function InvoiceScreen(input: InvoiceScreenInput) {
    const data = useInvoiceScreen(input)
    switch (data.state) {
        case 'loading':
            return <InvoiceLoading />
        case 'error':
            return <InvoiceLoadError onRetry={data.retry} />
        case 'not-found':
            return <InvoiceNotice testID="invoice-not-found" message={INVOICE_MESSAGES.notFound} />
        case 'no-access':
            return <InvoiceNotice testID="invoice-no-access" message={INVOICE_MESSAGES.noAccess} />
        case 'cannot-edit':
            return (
                <InvoiceNotice testID="invoice-cannot-edit" message={INVOICE_MESSAGES.cannotEdit} />
            )
        case 'read':
            return <ReadState data={data} />
        case 'form':
            return <InvoiceForm key={data.formKey} data={data} />
    }
}
