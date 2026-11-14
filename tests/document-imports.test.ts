import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Metro warns "Require cycle" for a cycle of value imports. Type-only imports are
// erased by the transform, so they never form a runtime cycle and do not count here.
const DOCUMENTS_DIR = resolve(__dirname, '../tinycld/books/components/documents')
const EXTENSIONS = ['.ts', '.tsx']

function isSourceFile(name: string) {
    return EXTENSIONS.some(ext => name.endsWith(ext)) && !name.endsWith('.d.ts')
}

function resolveInDir(fromDir: string, specifier: string) {
    if (!specifier.startsWith('.')) return null
    const base = resolve(fromDir, specifier)
    const candidates = [
        base,
        ...EXTENSIONS.map(ext => `${base}${ext}`),
        ...EXTENSIONS.map(ext => join(base, `index${ext}`)),
    ]
    const found = candidates.find(path => isSourceFile(path) && existsSync(path))
    if (!found?.startsWith(`${DOCUMENTS_DIR}/`)) return null
    return found
}

function isTypeOnlyImport(node: ts.ImportDeclaration) {
    const clause = node.importClause
    if (!clause) return false
    if (clause.isTypeOnly) return true
    if (clause.name) return false
    const bindings = clause.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) return false
    return bindings.elements.length > 0 && bindings.elements.every(el => el.isTypeOnly)
}

function isTypeOnlyExport(node: ts.ExportDeclaration) {
    if (node.isTypeOnly) return true
    const clause = node.exportClause
    if (!clause || !ts.isNamedExports(clause)) return false
    return clause.elements.length > 0 && clause.elements.every(el => el.isTypeOnly)
}

function valueImportsOf(path: string) {
    const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true
    )
    const specifiers: string[] = []
    for (const statement of source.statements) {
        if (ts.isImportDeclaration(statement) && !isTypeOnlyImport(statement)) {
            specifiers.push((statement.moduleSpecifier as ts.StringLiteral).text)
        }
        if (
            ts.isExportDeclaration(statement) &&
            statement.moduleSpecifier &&
            !isTypeOnlyExport(statement)
        ) {
            specifiers.push((statement.moduleSpecifier as ts.StringLiteral).text)
        }
    }
    return specifiers
}

function documentsGraph() {
    const graph = new Map<string, string[]>()
    for (const name of readdirSync(DOCUMENTS_DIR).filter(isSourceFile)) {
        const path = join(DOCUMENTS_DIR, name)
        const targets = valueImportsOf(path)
            .map(specifier => resolveInDir(DOCUMENTS_DIR, specifier))
            .filter((target): target is string => target !== null)
        graph.set(path, targets)
    }
    return graph
}

function findCycles(graph: Map<string, string[]>) {
    const cycles: string[][] = []
    const state = new Map<string, 'visiting' | 'done'>()
    const stack: string[] = []
    const visit = (node: string) => {
        state.set(node, 'visiting')
        stack.push(node)
        for (const next of graph.get(node) ?? []) {
            if (state.get(next) === 'visiting') {
                cycles.push([...stack.slice(stack.indexOf(next)), next])
            } else if (!state.has(next)) {
                visit(next)
            }
        }
        stack.pop()
        state.set(node, 'done')
    }
    for (const node of graph.keys()) {
        if (!state.has(node)) visit(node)
    }
    return cycles.map(cycle => cycle.map(path => path.slice(DOCUMENTS_DIR.length + 1)).join(' -> '))
}

describe('components/documents imports', () => {
    it('has no cycle of value imports', () => {
        const graph = documentsGraph()
        // The graph is read, not empty: a part that reads the kind imports the context.
        expect(graph.get(join(DOCUMENTS_DIR, 'PurchaseReadLines.tsx'))).toContain(
            join(DOCUMENTS_DIR, 'document-kind-context.ts')
        )
        expect(findCycles(graph)).toEqual([])
    })
})
