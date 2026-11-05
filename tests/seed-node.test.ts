// @vitest-environment node
// Core's scripts/seed-db.ts runs a package seed with tsx in plain node, while vitest
// aliases react-native to a stub. Only a real node run catches a seed graph that
// reaches react-native or core UI (for example a value import of lib/transfer.ts,
// which imports zod through @tinycld/core/ui/form), so this test spawns one.
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const packageRoot = path.resolve(__dirname, '..')
const seedPath = path.resolve(__dirname, '../tinycld/books/seed.ts')

describe('seed graph', () => {
    it('loads in plain node through tsx, as core seed-db.ts runs it', () => {
        const cli = createRequire(import.meta.url).resolve('tsx/cli')
        const output = execFileSync(
            process.execPath,
            [
                cli,
                '--eval',
                `import(${JSON.stringify(seedPath)}).then(m => console.log(typeof m.default))`,
            ],
            { cwd: packageRoot, encoding: 'utf8' }
        )
        expect(output.trim()).toBe('function')
    }, 30_000)
})
