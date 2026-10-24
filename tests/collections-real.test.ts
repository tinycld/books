import { createCollection } from 'pbtsdb/core'
import PocketBase from 'pocketbase'
import { describe, expect, it } from 'vitest'
import { registerCollections } from '../tinycld/books/collections'

// The real pbtsdb factory against a client that is never contacted: building a
// collection makes no request, so this checks what the package really registers.
function realBooks() {
    const newCollection = createCollection(new PocketBase('http://127.0.0.1:1'))
    const users = newCollection('users')
    return registerCollections(newCollection as never, { users } as never)
}

describe('registerCollections with the real pbtsdb', () => {
    it('lets the lines collection reach its entry and account collections', () => {
        const books = realBooks()
        const targets = books.books_journal_lines.relationTargets
        expect(targets?.entry).toBe(books.books_journal_entries)
        expect(targets?.account).toBe(books.books_accounts)
    })

    it('lets the entries collection reach its lines back-relation', () => {
        const books = realBooks()
        expect(books.books_journal_entries.relationTargets?.books_journal_lines_via_entry).toBe(
            books.books_journal_lines
        )
    })
})
