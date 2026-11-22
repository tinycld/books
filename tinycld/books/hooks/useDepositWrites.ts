import type { Transaction } from '@tanstack/react-db'
import { useStore } from '@tinycld/core/lib/pocketbase'

// A deposit header as a save writes it; the server fills the number, the totals and the
// entry.
export type DepositHeaderWrite = {
    deposit_to: string
    date: string
    memo: string
}

// An other funds line as a save writes it, its amount in signed cents.
export type DepositLineWrite = {
    customer: string
    vendor: string
    account: string
    description: string
    amount: number
    position: number
}

export type DepositTransaction = Transaction<Record<string, unknown>>

/**
 * The writes of a deposit save and delete (bank deposit spec §3.6, Do step 4), each the
 * pbtsdb Transaction the save's generator yields. The header goes through
 * `books_deposits` itself: a deposit has no list kind, so Delete draft does not go through
 * useDeleteDraftDocument. An item is inserted or deleted, never updated (the server copies
 * the line onto it at create and refuses an update); a line is inserted, updated or
 * deleted.
 */
export function useDepositWrites() {
    const [depositsCollection, itemsCollection, linesCollection] = useStore(
        'books_deposits',
        'books_deposit_items',
        'books_deposit_lines'
    )
    return {
        // A new deposit is a draft; `replaces` names the posted deposit a correction edits.
        insertHeader: (id: string, header: DepositHeaderWrite, replaces: string) =>
            depositsCollection.insert({ id, status: 'draft', replaces, ...header }),
        updateHeader: (id: string, header: DepositHeaderWrite) =>
            depositsCollection.update(id, draft => {
                Object.assign(draft, header)
            }),
        postHeader: (id: string) =>
            depositsCollection.update(id, draft => {
                draft.status = 'posted'
            }),
        deleteHeader: (id: string) => depositsCollection.delete(id),
        insertItem: (item: { id: string; deposit: string; line: string; position: number }) =>
            itemsCollection.insert(item),
        deleteItem: (id: string) => itemsCollection.delete(id),
        insertLine: (line: DepositLineWrite & { id: string; deposit: string }) =>
            linesCollection.insert(line),
        updateLine: (id: string, line: DepositLineWrite) =>
            linesCollection.update(id, draft => {
                Object.assign(draft, line)
            }),
        deleteLine: (id: string) => linesCollection.delete(id),
    }
}

export type DepositWrites = ReturnType<typeof useDepositWrites>
