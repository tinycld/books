import { createContext, useContext } from 'react'
import { type DocumentKind, INVOICE_DOCUMENT } from './document-kinds'

export const DocumentKindContext = createContext<DocumentKind | null>(null)

// The kind of the document the screen shows. DocumentScreen provides it once. With no
// provider (a design canvas that draws these parts alone) the invoice is the kind, as
// useDocumentFormScope's EMPTY_SCOPE is: the part draws as on an invoice, not throw.
export function useDocumentKind(): DocumentKind {
    return useContext(DocumentKindContext) ?? INVOICE_DOCUMENT
}
