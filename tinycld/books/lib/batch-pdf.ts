// The batch Download PDF's file names (purchase order spec §3.9 "Batch actions"): each ticked
// document's PDF is one entry of one zip archive, so two entries never share a name.

// Each name as given, or, when an earlier entry has it, with " (2)", " (3)", … before its
// extension.
export function uniqueEntryNames(names: readonly string[]): string[] {
    const seen = new Map<string, number>()
    return names.map(name => {
        const count = (seen.get(name) ?? 0) + 1
        seen.set(name, count)
        if (count === 1) return name
        const dot = name.lastIndexOf('.')
        if (dot <= 0) return `${name} (${count})`
        return `${name.slice(0, dot)} (${count})${name.slice(dot)}`
    })
}

// The archive's name: the kind's PDF stem in the plural ("purchase-orders.zip").
export function batchPdfArchiveName(pdfStem: string): string {
    return `${pdfStem}s.zip`
}

// The PDFs the batch Download PDF fetches at once: a long selection does not send every
// request together.
export const BATCH_PDF_CONCURRENCY = 4

// `fn` over the items with at most `limit` calls in flight; the next item starts as a call
// ends. The results are in the items' order. The first failure rejects, as Promise.all
// does, and no item starts after it.
export function mapWithLimit<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length)
    // One iterator that every worker takes its next item from.
    const queue = items.entries()
    let hasFailed = false
    const worker = async () => {
        for (const [index, item] of queue) {
            if (hasFailed) return
            try {
                results[index] = await fn(item)
            } catch (error) {
                hasFailed = true
                throw error
            }
        }
    }
    const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker)
    return Promise.all(workers).then(() => results)
}
