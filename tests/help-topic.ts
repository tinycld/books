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

// The body under the second-level heading `## <title>`, up to the next second-level
// heading or the end; '' when the topic has no such heading.
export function sectionOf(body: string, title: string): string {
    const lines = body.split('\n')
    const start = lines.findIndex(line => line.trim() === `## ${title}`)
    if (start < 0) return ''
    const rest = lines.slice(start + 1)
    const end = rest.findIndex(line => line.startsWith('## '))
    return (end < 0 ? rest : rest.slice(0, end)).join('\n')
}

// The first line of `text` that matches every pattern.
export function lineWith(text: string, ...patterns: RegExp[]): string | undefined {
    return text.split('\n').find(line => patterns.every(pattern => pattern.test(line)))
}

// A single-letter key (S, R) standing alone: not part of a word or of a glyph key (⌥S).
export function letterKey(letter: string): RegExp {
    return new RegExp(`(^|[^\\w⌘⌥⇧])${letter}([^\\w]|$)`)
}

// The first paragraph or list item of a topic body that matches every pattern.
export function paragraphWith(body: string, ...patterns: RegExp[]): string | undefined {
    return body
        .split(/\n\s*\n|\n(?=\s*(?:[-*]|\d+\.) )/)
        .map(block => block.trim())
        .find(block => block !== '' && patterns.every(pattern => pattern.test(block)))
}
