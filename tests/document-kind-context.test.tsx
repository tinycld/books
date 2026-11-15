// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useDocumentKind } from '../tinycld/books/components/documents/document-kind-context'

describe('useDocumentKind', () => {
    it('throws a clear error outside a DocumentKindContext.Provider', () => {
        // React logs the thrown render error; the throw itself is what this test reads.
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        try {
            expect(() => renderHook(() => useDocumentKind())).toThrow(
                /useDocumentKind.*DocumentKindContext\.Provider/
            )
        } finally {
            quiet.mockRestore()
        }
    })
})
