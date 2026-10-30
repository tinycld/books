import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// CI assembles core + Books alone, so a spec that opens another package passes locally
// (every package installed) and fails in CI. Settings and help are app chrome, not packages.
const ALLOWED = new Set(['books', 'settings', 'help'])
const e2eDir = path.resolve(__dirname, 'e2e')

const PACKAGE_REFERENCES = [
    /navigateToPackage\(\s*page\s*,\s*['"]([a-z0-9-]+)['"]/g,
    /pkg-active-([a-z0-9-]+)/g,
]

function packagesNamedIn(source: string) {
    return PACKAGE_REFERENCES.flatMap(pattern =>
        [...source.matchAll(pattern)].map(match => match[1])
    )
}

const files = readdirSync(e2eDir).filter(name => name.endsWith('.ts'))

describe('e2e package scope', () => {
    it.each(files)('%s opens only Books', name => {
        const source = readFileSync(path.join(e2eDir, name), 'utf8')
        const others = packagesNamedIn(source).filter(slug => !ALLOWED.has(slug))
        expect(others).toEqual([])
    })

    it('flags a spec that opens another package', () => {
        expect(packagesNamedIn("await navigateToPackage(page, 'calendar')")).toEqual(['calendar'])
        expect(packagesNamedIn("page.getByTestId('pkg-active-mail')")).toEqual(['mail'])
    })
})
