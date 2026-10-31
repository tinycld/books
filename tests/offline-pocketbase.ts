import PocketBase from 'pocketbase'

// A PocketBase client whose network layer serves in-memory tables and records what it
// was asked, so the real pbtsdb collections sync and filter exactly as they do against a
// server, and a test can read the path and filter of every request.
export class OfflinePocketBase extends PocketBase {
    tables: Record<string, Record<string, unknown>[]> = {}
    requests: string[] = []
    filters: string[] = []

    constructor() {
        super('http://127.0.0.1:1')
        this.autoCancellation(false)
    }

    override async send<T = unknown>(
        path: string,
        options: { query?: Record<string, unknown>; filter?: unknown }
    ): Promise<T> {
        this.requests.push(path)
        const filter = String(options.filter ?? options.query?.filter ?? '')
        this.filters.push(filter)
        const name = path.split('/')[3]
        const items = this.tables[name] ?? []
        const ids = [...filter.matchAll(/id\s*=\s*['"]([^'"]+)['"]/g)].map(m => m[1])
        const matching = ids.length > 0 ? items.filter(r => ids.includes(String(r.id))) : items
        const page = Number(options.query?.page ?? 1)
        const perPage = Number(options.query?.perPage ?? 30)
        const rows = matching.slice((page - 1) * perPage, page * perPage)
        return { page, perPage, totalItems: matching.length, totalPages: 1, items: rows } as T
    }
}
