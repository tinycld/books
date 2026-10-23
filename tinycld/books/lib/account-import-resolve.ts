import { maxAccountDepth } from './account-tree'

export type ExistingAccount = {
    id: string
    name: string
    number: string
    type: string
    parent: string
}

export type RowInput = {
    name: string
    typeKey: string
    parentRaw: string
    // A reason the cells alone are invalid; it outranks every parent problem.
    fieldError: string | null
}

export type ResolvedRow = {
    status: 'ready' | 'skipped' | 'error'
    reason: string | null
    parentPath: string
    // Identity of the parent account: '' for top level, 'e:<id>' for an existing
    // account, 'f:<index>' for a file row. Two rows with the same parent identity
    // and name collide, whatever characters the names hold.
    parentKey: string
    // The file row this row's parent is, when that row is ready.
    parentFile: number | null
    // Distance from the top through file-row parents only; parents sort first.
    level: number
}

// Same folding as the server's NOCASE collation: ASCII letters only.
export function foldName(text: string): string {
    return text.replace(/[A-Z]/g, c => c.toLowerCase())
}

type ExistingNode = {
    account: ExistingAccount
    path: string
    depth: number
    parentKey: string
}

type ExistingIndex = {
    byPath: Map<string, ExistingNode[]>
    byName: Map<string, ExistingNode[]>
    byParentAndName: Map<string, ExistingNode>
}

function addTo<T>(map: Map<string, T[]>, key: string, value: T) {
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
}

function indexExisting(existing: readonly ExistingAccount[]): ExistingIndex {
    const byId = new Map(existing.map(a => [a.id, a]))
    const nodes = new Map<string, ExistingNode>()
    const visiting = new Set<string>()

    // Depth counts parent links, so a name holding ':' still counts as one level.
    function nodeFor(account: ExistingAccount): ExistingNode {
        const known = nodes.get(account.id)
        if (known) return known
        visiting.add(account.id)
        const parent = byId.get(account.parent)
        const parentNode = parent && !visiting.has(parent.id) ? nodeFor(parent) : undefined
        visiting.delete(account.id)
        const node: ExistingNode = {
            account,
            path: parentNode ? `${parentNode.path}:${account.name}` : account.name,
            depth: (parentNode?.depth ?? 0) + 1,
            parentKey: parentNode ? `e:${parentNode.account.id}` : '',
        }
        nodes.set(account.id, node)
        return node
    }

    const index: ExistingIndex = {
        byPath: new Map(),
        byName: new Map(),
        byParentAndName: new Map(),
    }
    for (const account of existing) {
        const node = nodeFor(account)
        addTo(index.byPath, foldName(node.path), node)
        addTo(index.byName, foldName(account.name), node)
        const key = `${node.parentKey}\u0000${foldName(account.name)}`
        if (!index.byParentAndName.has(key)) index.byParentAndName.set(key, node)
    }
    return index
}

type Candidate = { key: string; existing: ExistingNode | null; file: number | null }

type ParentLink =
    | { kind: 'none' }
    | { kind: 'error'; reason: string }
    | { kind: 'existing'; node: ExistingNode }
    | { kind: 'file'; index: number }

type Resolved = ResolvedRow & {
    path: string
    depth: number
    typeKey: string
    // The existing account a Skipped row stands for.
    match: ExistingNode | null
}

// Colon positions give every way a path could end in a row's name, since names may
// hold ':' themselves.
function pathSuffixes(text: string): string[] {
    const suffixes = [text]
    for (let i = text.indexOf(':'); i !== -1; i = text.indexOf(':', i + 1)) {
        suffixes.push(text.slice(i + 1))
    }
    return suffixes
}

function segmentCount(text: string): number {
    let count = 1
    for (let i = text.indexOf(':'); i !== -1; i = text.indexOf(':', i + 1)) count++
    return count
}

// Known limitation: the segment-count prune treats every ':' as a path separator, so
// mutually dependent rows whose names hold ':' can still resolve differently from an
// exhaustive search. Those shapes are not made exact on purpose.
export function resolveRows(
    rows: readonly RowInput[],
    existing: readonly ExistingAccount[]
): ResolvedRow[] {
    const index = indexExisting(existing)
    const fileByName = new Map<string, number[]>()
    rows.forEach((row, i) => {
        addTo(fileByName, foldName(row.name), i)
    })

    const lastSegment = (t: string) => foldName(t.slice(t.lastIndexOf(':') + 1))
    const foldedNames = rows.map(row => foldName(row.name))
    const parentSegments = rows.map(row => lastSegment(row.parentRaw))
    // Segments in the row's own path, when its parent text fixes them: none (1) or a
    // full path of s >= 2 segments (s + 1). A single bare name leaves it open.
    const ownSegments = rows.map(row => {
        if (row.parentRaw === '') return 1
        const s = segmentCount(row.parentRaw)
        return s >= 2 ? s + 1 : null
    })

    const resolved: (Resolved | undefined)[] = new Array(rows.length)
    // Rows being resolved, each waiting on the one above it; stackPos is -1 for the rest.
    const stack: number[] = []
    const stackPos: number[] = new Array(rows.length).fill(-1)
    const inCycle = new Set<number>()

    function markCycle(from: number) {
        for (let p = stackPos[from]; p < stack.length; p++) inCycle.add(stack[p])
    }

    function candidateFor(j: number, done: Resolved | undefined): Candidate {
        if (done?.match)
            return { key: `e:${done.match.account.id}`, existing: done.match, file: null }
        return { key: `f:${j}`, existing: null, file: j }
    }

    // A row still waiting on its own parent has no path yet. Its path could be `text`
    // only if the text ends with its name at a colon boundary and the part before the
    // name agrees with the row's own parent text.
    function couldHavePath(j: number, text: string): boolean {
        const wantedSegments = segmentCount(text)
        const own = ownSegments[j]
        if (wantedSegments >= 2 && own !== null && own !== wantedSegments) return false
        return nameFitsPath(j, text)
    }

    function nameFitsPath(j: number, text: string): boolean {
        const name = rows[j].name
        const own = rows[j].parentRaw
        const cut = text.length - name.length
        if (cut < 0 || (cut === 0) !== (own === '')) return false
        if (cut > 0 && text[cut - 1] !== ':') return false
        if (foldName(text.slice(cut)) !== foldedNames[j]) return false
        if (cut === 0) return true
        return lastSegment(text.slice(0, cut - 1)) === parentSegments[j]
    }

    // A waiting row closes a cycle through the row above it on the stack only if its
    // parent text can name that row, by full path or by bare name.
    function waitsOnNext(j: number): boolean {
        const next = stack[stackPos[j] + 1]
        if (next === undefined) return false
        const text = rows[j].parentRaw
        return foldName(text) === foldedNames[next] || couldHavePath(next, text)
    }

    // Collects file rows among `indexes` that `accept` approves; an unresolved row counts
    // only if `couldMatch` allows it. Returns an unresolved row off the stack, which must
    // be resolved before the answer is known. Rows on the
    // stack that count as candidates are marked as a cycle once, from the lowest one.
    function scanFile(
        self: number,
        indexes: readonly number[],
        accept: (done: Resolved) => boolean,
        couldMatch: (j: number) => boolean,
        found: Map<string, Candidate>
    ): number | null {
        let lowest = -1
        for (const j of indexes) {
            if (j === self) continue
            const done = resolved[j]
            if (done ? !accept(done) : !couldMatch(j)) continue
            if (!done && stackPos[j] === -1) return j
            if (!done && (lowest === -1 || stackPos[j] < stackPos[lowest])) lowest = j
            // Two distinct parents already make the answer ambiguous.
            if (found.size >= 2) continue
            const candidate = candidateFor(j, done)
            found.set(candidate.key, candidate)
        }
        if (lowest !== -1) markCycle(lowest)
        return null
    }

    function addExisting(
        nodes: readonly ExistingNode[] | undefined,
        found: Map<string, Candidate>
    ) {
        for (const node of nodes ?? []) {
            found.set(`e:${node.account.id}`, {
                key: `e:${node.account.id}`,
                existing: node,
                file: null,
            })
        }
    }

    function decide(self: number, found: Map<string, Candidate>, wanted: string): ParentLink {
        if (found.size === 0) {
            const selfNamed = foldName(rows[self].name) === wanted
            return { kind: 'error', reason: selfNamed ? 'parent cycle' : 'parent not found' }
        }
        if (found.size > 1) return { kind: 'error', reason: 'ambiguous parent' }
        const [only] = found.values()
        if (only.existing) return { kind: 'existing', node: only.existing }
        return { kind: 'file', index: only.file ?? self }
    }

    // The full path is tried first; a bare name is the fallback.
    function lookup(i: number): { pending: number } | { link: ParentLink } {
        const text = rows[i].parentRaw
        if (text === '') return { link: { kind: 'none' } }
        const wanted = foldName(text)

        const byPath = new Map<string, Candidate>()
        addExisting(index.byPath.get(wanted), byPath)
        const fileNamed = pathSuffixes(text).flatMap(s => fileByName.get(foldName(s)) ?? [])
        const pathMatch = (done: Resolved) =>
            done.path.length === text.length && foldName(done.path) === wanted
        const pendingForPath = scanFile(
            i,
            fileNamed,
            pathMatch,
            j => couldHavePath(j, text),
            byPath
        )
        if (pendingForPath !== null) return { pending: pendingForPath }
        if (byPath.size > 0) return { link: decide(i, byPath, wanted) }

        const byName = new Map<string, Candidate>()
        addExisting(index.byName.get(wanted), byName)
        const pendingForName = scanFile(
            i,
            fileByName.get(wanted) ?? [],
            () => true,
            j => stackPos[j] === -1 || waitsOnNext(j),
            byName
        )
        if (pendingForName !== null) return { pending: pendingForName }
        return { link: decide(i, byName, wanted) }
    }

    function finalize(i: number, link: ParentLink): Resolved {
        const row = rows[i]
        let parentError: string | null = null
        let parentPath = ''
        let parentType = ''
        let parentDepth = 0
        let parentKey = ''
        let parentFile: number | null = null
        let level = 0

        if (link.kind === 'error') {
            parentError = link.reason
            parentPath = row.parentRaw
        } else if (link.kind === 'existing') {
            parentPath = link.node.path
            parentType = link.node.account.type
            parentDepth = link.node.depth
            parentKey = `e:${link.node.account.id}`
        } else if (link.kind === 'file') {
            const parent = resolved[link.index]
            if (!parent || parent.status === 'error') {
                parentError = 'parent row has an error'
                parentPath = parent?.path ?? row.parentRaw
            } else {
                parentPath = parent.path
                parentType = parent.typeKey
                parentDepth = parent.depth
                parentKey = `f:${link.index}`
                parentFile = link.index
                level = parent.level + 1
            }
        }

        const depth = parentDepth + 1
        const match = index.byParentAndName.get(`${parentKey}\u0000${foldName(row.name)}`) ?? null
        let reason: string | null = null
        if (row.fieldError) reason = row.fieldError
        else if (inCycle.has(i)) reason = 'parent cycle'
        else if (parentError) reason = parentError
        else if (parentType !== '' && parentType !== row.typeKey) reason = 'parent type differs'
        else if (depth > maxAccountDepth) reason = `depth over ${maxAccountDepth}`

        const isError = reason !== null
        return {
            status: isError ? 'error' : match ? 'skipped' : 'ready',
            reason: isError ? reason : match ? 'already exists' : null,
            parentPath,
            parentKey,
            parentFile,
            level,
            path: parentPath === '' ? row.name : `${parentPath}:${row.name}`,
            depth,
            typeKey: row.typeKey,
            match: isError ? null : match,
        }
    }

    // Depth-first with an explicit stack: a reversed chain of 2000 rows must not
    // overflow the call stack.
    function push(i: number) {
        stackPos[i] = stack.length
        stack.push(i)
    }

    for (let start = 0; start < rows.length; start++) {
        if (resolved[start]) continue
        push(start)
        while (stack.length > 0) {
            const i = stack[stack.length - 1]
            const result = lookup(i)
            if ('pending' in result) {
                push(result.pending)
                continue
            }
            resolved[i] = finalize(i, result.link)
            stackPos[i] = -1
            stack.pop()
        }
    }

    return resolved as Resolved[]
}
