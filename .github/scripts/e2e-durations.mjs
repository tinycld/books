#!/usr/bin/env node
// Writes .github/e2e-durations.json, the CI seconds of each e2e spec file, from the log of
// a CI run: `gh run view <run id> --repo tinycld/books --log > run.log`, then
// `node .github/scripts/e2e-durations.mjs run.log`. e2e-shard.mjs reads the file to split
// the spec files over the E2E shards by time. Refresh it when a shard runs much longer
// than the others.
//
// The list reporter prints one line for each finished test:
//   ✓  12 [books] › tests/e2e/bill-form.spec.ts:163:5 › bill-form: … › title (10.7s)
// Only the `books` project counts. The one-worker setup projects of playwright.config.ts
// are dependencies, and Playwright runs a dependency project in full on every shard, so
// their time is the same on each shard and does not move with the split.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const LINE = /(?:✓|✘)\s+\d+ \[books\] › tests\/e2e\/([^:]+\.spec\.ts):.*\((\d+(?:\.\d+)?)(m?s)\)\s*$/

const [logFile] = process.argv.slice(2)
if (!logFile) {
    process.stderr.write('usage: e2e-durations.mjs <CI run log>\n')
    process.exit(2)
}

const seconds = {}
for (const line of readFileSync(logFile, 'utf8').split('\n')) {
    const match = LINE.exec(line)
    if (!match) continue
    const [, file, amount, unit] = match
    seconds[file] = (seconds[file] ?? 0) + Number(amount) / (unit === 'ms' ? 1000 : 1)
}
const files = Object.keys(seconds).sort()
if (files.length === 0) {
    process.stderr.write(`no test lines found in ${logFile}\n`)
    process.exit(1)
}

const sorted = Object.fromEntries(files.map(file => [file, Math.round(seconds[file] * 10) / 10]))
const out = path.join(import.meta.dirname, '..', 'e2e-durations.json')
writeFileSync(out, `${JSON.stringify(sorted, null, 4)}\n`)
process.stdout.write(`${files.length} spec files written to ${out}\n`)
