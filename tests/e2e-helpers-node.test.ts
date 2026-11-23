// @vitest-environment node
// Playwright loads e2e helpers in plain node. An in-process import here would not catch a
// helper whose chain reaches react-native or @sentry/react-native, because vitest aliases
// both to stubs, so the helpers load in one tsx child process, as seed-node.test.ts does.
// When one throws, Playwright loads no spec at all ("No tests found").
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const packageRoot = path.resolve(__dirname, '..')
const e2eDir = path.resolve(__dirname, 'e2e')
const MARKER = 'E2E-HELPER-LOAD:'

// Every module of tests/e2e that is not a spec: the helpers and what specs share.
const helpers = readdirSync(e2eDir)
    .filter(name => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
    .sort()

type LoadResult = { name: string; error: string | null }

const loader = `
const { pathToFileURL } = require('node:url')
const path = require('node:path')
const names = ${JSON.stringify(helpers)}
;(async () => {
    const results = []
    for (const name of names) {
        try {
            await import(pathToFileURL(path.join(${JSON.stringify(e2eDir)}, name)).href)
            results.push({ name, error: null })
        } catch (err) {
            results.push({ name, error: String(err && err.stack ? err.stack : err) })
        }
    }
    process.stdout.write('\\n${MARKER}' + JSON.stringify(results) + '\\n')
    process.exit(0)
})()
`

let results: LoadResult[] = []

beforeAll(() => {
    const cli = createRequire(import.meta.url).resolve('tsx/cli')
    const output = execFileSync(process.execPath, [cli, '--eval', loader], {
        cwd: packageRoot,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
    })
    const line = output.split('\n').find(text => text.startsWith(MARKER))
    if (line === undefined) throw new Error(`e2e helper loader printed no result:\n${output}`)
    results = JSON.parse(line.slice(MARKER.length))
}, 120_000)

describe('e2e helpers load in plain node', () => {
    it('finds the helpers', () => {
        expect(helpers.length).toBeGreaterThan(0)
    })

    it.each(helpers)('%s', name => {
        const result = results.find(r => r.name === name)
        expect(result, `${name} was not loaded`).toBeDefined()
        expect(result?.error ?? null, `${name} does not load in node`).toBeNull()
    })
})
