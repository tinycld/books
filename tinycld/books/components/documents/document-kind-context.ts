import { createContext, useContext } from 'react'
import type { DocumentKind } from './document-kinds'

export const DocumentKindContext = createContext<DocumentKind | null>(null)

// The kind of the document the screen shows. DocumentScreen provides it once. There is
// no default kind: a default needs a value import of document-kinds, whose parts read
// this context, so the modules would require each other.
export function useDocumentKind(): DocumentKind {
    const documentKind = useContext(DocumentKindContext)
    if (!documentKind) {
        throw new Error('useDocumentKind must be used inside a DocumentKindContext.Provider')
    }
    return documentKind
}
