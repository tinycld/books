import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const helpDir = path.resolve(__dirname, '../help')

// A help topic's file split at its frontmatter; every part is '' when the file is missing.
export function readHelpTopic(id: string) {
    const topicPath = path.join(helpDir, `${id}.md`)
    const exists = existsSync(topicPath)
    const source = exists ? readFileSync(topicPath, 'utf8') : ''
    const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source)
    return { exists, source, frontmatter: match?.[1] ?? '', body: match?.[2] ?? '' }
}
