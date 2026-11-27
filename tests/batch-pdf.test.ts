import { describe, expect, it } from 'vitest'
import {
    BATCH_PDF_CONCURRENCY,
    batchPdfArchiveName,
    mapWithLimit,
    uniqueEntryNames,
} from '../tinycld/books/lib/batch-pdf'

describe('uniqueEntryNames', () => {
    it('keeps names that differ', () => {
        expect(uniqueEntryNames(['purchase-order-1004.pdf', 'purchase-order-1005.pdf'])).toEqual([
            'purchase-order-1004.pdf',
            'purchase-order-1005.pdf',
        ])
    })

    it('numbers a repeated name before its extension', () => {
        expect(uniqueEntryNames(['a.pdf', 'a.pdf', 'a.pdf'])).toEqual([
            'a.pdf',
            'a (2).pdf',
            'a (3).pdf',
        ])
    })

    it('numbers a repeated name with no extension at its end', () => {
        expect(uniqueEntryNames(['a', 'a'])).toEqual(['a', 'a (2)'])
    })
})

describe('batchPdfArchiveName', () => {
    it('names the archive by the kind stem in the plural', () => {
        expect(batchPdfArchiveName('purchase-order')).toBe('purchase-orders.zip')
    })
})

// The batch Download PDF fetches the ticked PDFs at most BATCH_PDF_CONCURRENCY (4) at a
// time (cp5 fix round 1, item 9 b), in the rows' order, through `mapWithLimit`.
describe('mapWithLimit', () => {
    type Held = {
        item: number
        isSettled: boolean
        resolve: (value: string) => void
        reject: (e: Error) => void
    }

    // A run whose calls wait until the test settles them, so the calls in flight can be counted.
    function heldRun() {
        const held: Held[] = []
        let inFlight = 0
        let peak = 0
        const fn = (item: number) =>
            new Promise<string>((resolve, reject) => {
                inFlight++
                peak = Math.max(peak, inFlight)
                const call: Held = {
                    item,
                    isSettled: false,
                    resolve: value => {
                        call.isSettled = true
                        inFlight--
                        resolve(value)
                    },
                    reject: e => {
                        call.isSettled = true
                        inFlight--
                        reject(e)
                    },
                }
                held.push(call)
            })
        // Ends every call in flight, then lets the run start the next ones, until none is left.
        async function drain() {
            for (let round = 0; round < 20; round++) {
                for (const call of held.filter(entry => !entry.isSettled)) {
                    call.resolve(`r${call.item}`)
                }
                await flush()
            }
        }
        return { held, fn, drain, peak: () => peak, inFlight: () => inFlight }
    }

    const flush = () => new Promise(resolve => setTimeout(resolve, 0))

    it('fetches with a limit of 4', () => {
        expect(BATCH_PDF_CONCURRENCY).toBe(4)
    })

    it('starts no more than the limit at once, and the next one as each ends', async () => {
        const run = heldRun()
        const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
        const result = mapWithLimit(items, 4, run.fn)
        await flush()
        expect(run.held.map(call => call.item)).toEqual([0, 1, 2, 3])
        run.held[1]?.resolve('b1')
        await flush()
        expect(run.held.map(call => call.item)).toEqual([0, 1, 2, 3, 4])
        expect(run.inFlight()).toBe(4)
        await run.drain()
        await expect(result).resolves.toEqual([
            'r0',
            'b1',
            'r2',
            'r3',
            'r4',
            'r5',
            'r6',
            'r7',
            'r8',
            'r9',
        ])
        expect(run.held.map(call => call.item)).toEqual(items)
        expect(run.peak()).toBe(4)
    })

    it("gives the results in the items' order, whatever order the calls end in", async () => {
        const run = heldRun()
        const result = mapWithLimit([10, 20, 30], 4, run.fn)
        await flush()
        run.held[2]?.resolve('thirty')
        run.held[0]?.resolve('ten')
        run.held[1]?.resolve('twenty')
        await expect(result).resolves.toEqual(['ten', 'twenty', 'thirty'])
    })

    it('runs every item when there are fewer items than the limit', async () => {
        const run = heldRun()
        const result = mapWithLimit([1, 2], 4, run.fn)
        await flush()
        expect(run.held.map(call => call.item)).toEqual([1, 2])
        await run.drain()
        await expect(result).resolves.toEqual(['r1', 'r2'])
    })

    it('gives an empty list for no items', async () => {
        await expect(mapWithLimit([], 4, async () => 'never')).resolves.toEqual([])
    })

    it('fails with the first failure, as Promise.all does, and starts no more items', async () => {
        const run = heldRun()
        const result = mapWithLimit([1, 2, 3, 4, 5, 6], 2, run.fn)
        await flush()
        run.held[0]?.reject(new Error('PDF 1 failed'))
        await expect(result).rejects.toThrow('PDF 1 failed')
        await flush()
        expect(run.held.map(call => call.item)).toEqual([1, 2])
    })
})
