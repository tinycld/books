#!/usr/bin/env node
// Writes .github/e2e-durations.json from the log of a CI run:
// `gh run view <run id> --repo tinycld/books --log > run.log`, then
// `node .github/scripts/e2e-durations.mjs run.log`. e2e-shard.mjs reads the file to split
// the spec files over the E2E shards by time. Refresh it when a shard runs much longer
// than the others.
//
// The list reporter prints one line for each finished test:
//   ✓  12 [books] › tests/e2e/bill-form.spec.ts:163:5 › bill-form: … › title (10.7s)
// The file holds:
// - `files`: the CI seconds of each spec file's `books` tests (0 for a file that holds
//   setup tests only).
// - `setup`: the seconds of the one-worker setup projects of playwright.config.ts. They run
//   one test after the other, before the `books` tests, so this is the sum of their tests.
//   A log can hold a setup test more than once (each shard ran them before e2e-shard.mjs
//   gave them to shard 1 only), so each test counts with its mean time.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const LINE =
    /(?:✓|✘)\s+\d+ \[([a-z-]+)\] › tests\/e2e\/([^:]+\.spec\.ts):(\d+:\d+).*\((\d+(?:\.\d+)?)(m?s)\)\s*$/

const [logFile] = process.argv.slice(2)
if (!logFile) {
    process.stderr.write('usage: e2e-durations.mjs <CI run log>\n')
    process.exit(2)
}

const round = seconds => Math.round(seconds * 10) / 10

const fileSeconds = {}
const setupRuns = {}
for (const line of readFileSync(logFile, 'utf8').split('\n')) {
    const match = LINE.exec(line)
    if (!match) continue
    const [, project, file, position, amount, unit] = match
    const seconds = Number(amount) / (unit === 'ms' ? 1000 : 1)
    if (project === 'books') {
        fileSeconds[file] = (fileSeconds[file] ?? 0) + seconds
    } else {
        const test = `${file}:${position}`
        setupRuns[test] = [...(setupRuns[test] ?? []), seconds]
        // A file of setup tests only weighs 0 s, not the guess for a file not timed yet.
        fileSeconds[file] ??= 0
    }
}
const files = Object.keys(fileSeconds).sort()
if (files.length === 0) {
    process.stderr.write(`no test lines found in ${logFile}\n`)
    process.exit(1)
}

const setup = Object.values(setupRuns).reduce(
    (sum, runs) => sum + runs.reduce((a, b) => a + b, 0) / runs.length,
    0
)
const durations = {
    setup: round(setup),
    files: Object.fromEntries(files.map(file => [file, round(fileSeconds[file])])),
}
const out = path.join(import.meta.dirname, '..', 'e2e-durations.json')
writeFileSync(out, `${JSON.stringify(durations, null, 4)}\n`)
process.stdout.write(
    `${files.length} spec files and ${Object.keys(setupRuns).length} setup tests (${durations.setup} s) written to ${out}\n`
)
