import { createContext, useContext } from 'react'
import type { SalesDocumentKind } from '../../lib/sales-document-kinds'
import { DocumentKindContext } from './document-kind-context'

// The parts of a kind the shared chrome (DocumentHeader, DocumentActionBar,
// DocumentMoreMenu) reads. A screen that is not a sales document kind (a payment)
// provides only these through DocumentChromeContext. A screen with no big figure (an
// inventory adjustment: the cost of a decrease is the server's) leaves `figure` out, and
// DocumentHeader then draws no figure block.
export type DocumentChrome = Pick<
    SalesDocumentKind,
    'testId' | 'shortcutGroup' | 'helpTopic' | 'lifecycle'
> &
    Partial<Pick<SalesDocumentKind, 'figure'>>

export const DocumentChromeContext = createContext<DocumentChrome | null>(null)

// The chrome context's value; else the document kind's own; else it throws. There is no
// default: a default needs a value import of a kind, whose parts read this context.
export function useDocumentChrome(): DocumentChrome {
    const chrome = useContext(DocumentChromeContext)
    const documentKind = useContext(DocumentKindContext)
    const value = chrome ?? documentKind?.doc
    if (!value) {
        throw new Error(
            'useDocumentChrome must be used inside a DocumentChromeContext or DocumentKindContext provider'
        )
    }
    return value
}
