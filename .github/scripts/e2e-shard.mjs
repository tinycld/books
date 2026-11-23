#!/usr/bin/env node
// Prints the spec files of one E2E shard, split by CI time:
//   node .github/scripts/e2e-shard.mjs <shard> <total>   → tests/e2e/a.spec.ts … (one a line)
//   node .github/scripts/e2e-shard.mjs --plan <total>    → each shard's files and expected minutes
//
// Playwright's own --shard cuts the files, in name order, into runs of equal test count, so
// a shard of slow files (the vendor-* specs) ran 30 % longer than the others and its tests
// passed the 30 s timeout. Here each file weighs what it took on CI
// (.github/e2e-durations.json, written by e2e-durations.mjs), and the files go, heaviest
// first, to the shard with the least time so far. A file not in the durations file yet
// weighs its number of tests times NEW_TEST_SECONDS.
//
// The one-worker setup projects of playwright.config.ts are dependencies, and Playwright
// runs a dependency project in full on every shard, whatever files are named: about
// 3 minutes that every shard adds before its other tests. Those tests share the CI
// workers (playwright.config.ts of the app shell), so --plan prints their seconds over
// CI_WORKERS.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const CI_WORKERS = 2
const NEW_TEST_SECONDS = 10
const ROOT = path.join(import.meta.dirname, '..', '..')
const SPEC_DIR = path.join(ROOT, 'tests', 'e2e')

function usage() {
    process.stderr.write('usage: e2e-shard.mjs <shard> <total> | --plan <total>\n')
    process.exit(2)
}

function weights() {
    const known = JSON.parse(
        readFileSync(path.join(import.meta.dirname, '..', 'e2e-durations.json'), 'utf8')
    )
    return readdirSync(SPEC_DIR)
        .filter(name => name.endsWith('.spec.ts'))
        .sort()
        .map(name => {
            if (name in known) return { name, cost: known[name] / CI_WORKERS }
            const source = readFileSync(path.join(SPEC_DIR, name), 'utf8')
            const tests = source.match(/^\s*test\(/gm)?.length ?? 1
            return { name, cost: (tests * NEW_TEST_SECONDS) / CI_WORKERS }
        })
}

function split(total) {
    const shards = Array.from({ length: total }, () => ({ files: [], cost: 0 }))
    const files = weights().sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name))
    for (const file of files) {
        const lightest = shards.reduce((min, shard) => (shard.cost < min.cost ? shard : min))
        lightest.files.push(file.name)
        lightest.cost += file.cost
    }
    for (const shard of shards) shard.files.sort()
    return shards
}

const args = process.argv.slice(2)
if (args[0] === '--plan') {
    const total = Number(args[1])
    if (!Number.isInteger(total) || total < 1) usage()
    split(total).forEach((shard, i) => {
        const minutes = (shard.cost / 60).toFixed(1)
        process.stdout.write(
            `shard ${i + 1}: ${shard.files.length} files, ${minutes} min after the setup projects\n`
        )
        for (const file of shard.files) process.stdout.write(`    ${file}\n`)
    })
} else {
    const [current, total] = args.map(Number)
    if (!Number.isInteger(total) || total < 1 || !(current >= 1 && current <= total)) usage()
    const files = split(total)[current - 1].files
    process.stdout.write(`${files.map(name => `tests/e2e/${name}`).join('\n')}\n`)
}
