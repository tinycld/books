import { describe, expect, it } from 'vitest'
import { documentLinkUrl } from '../tinycld/books/lib/document-link'
import { estimateLinkUrl } from '../tinycld/books/lib/estimate-link'
import { PUBLIC_ROWS } from '../tinycld/books/lib/estimate-public-link-fixture'
import { publicEstimatePdfPath } from '../tinycld/books/lib/pdf-download'

// The customer's link (spec §3.1) and the signed-out PDF route (spec §4.3).
const TOKEN = PUBLIC_ROWS.pending.token

describe('estimateLinkUrl', () => {
    it('puts the token under /p/books/estimates on the server address', () => {
        expect(estimateLinkUrl(TOKEN, 'https://books.example')).toBe(
            `https://books.example/p/books/estimates/${TOKEN}`
        )
    })

    it('does not double a trailing slash on the address', () => {
        expect(estimateLinkUrl(TOKEN, 'https://books.example/')).toBe(
            `https://books.example/p/books/estimates/${TOKEN}`
        )
    })

    it('is the estimate link of documentLinkUrl', () => {
        for (const address of ['https://books.example', 'https://books.example/']) {
            expect(estimateLinkUrl(TOKEN, address)).toBe(
                documentLinkUrl('estimate', TOKEN, address)
            )
        }
    })
})

describe('publicEstimatePdfPath', () => {
    it('is the token route of the estimate PDF', () => {
        expect(publicEstimatePdfPath(TOKEN)).toBe(`/api/books/public/estimates/${TOKEN}/pdf`)
    })
})
