// The batch actions of a sales or purchase list (spec §3 "Batch actions"): which ticked
// documents an action applies to, the words of its confirm dialog, and the result banner's
// text. Pure, so each rule is unit-tested.

import type { DocumentListRow } from './document-list'

export type BatchAction = 'delete_drafts' | 'void'

// Delete drafts applies to the drafts of every kind but a bill payment, which is never a
// draft and has no delete. Void applies to posted documents of every kind but an estimate,
// which has no void. No batch action reaches a write-off (write-off spec §5, Q13): it is
// voided on its own page.
function appliesTo(action: BatchAction, row: DocumentListRow): boolean {
    if (row.kind === 'write_off') return false
    if (action === 'delete_drafts') {
        return row.recordStatus === 'draft' && row.kind !== 'bill_payment'
    }
    return row.recordStatus === 'posted' && row.kind !== 'estimate'
}

export function batchTargets(
    action: BatchAction,
    rows: readonly DocumentListRow[]
): { applies: DocumentListRow[]; skipped: number } {
    const applies = rows.filter(row => appliesTo(action, row))
    return { applies, skipped: rows.length - applies.length }
}

function documents(count: number): string {
    return count === 1 ? '1 selected document' : `${count} selected documents`
}

// The sentence that names the skipped documents; '' when the action skips none.
function skippedSentence(action: BatchAction, skipped: number): string {
    if (skipped === 0) return ''
    if (action === 'delete_drafts') {
        const rest = skipped === 1 ? 'is not a draft and stays.' : 'are not drafts and stay.'
        return `${documents(skipped)} ${rest}`
    }
    const rest = skipped === 1 ? 'cannot be voided and stays.' : 'cannot be voided and stay.'
    return `${documents(skipped)} ${rest}`
}

function joinSentences(...sentences: string[]): string {
    return sentences.filter(sentence => sentence !== '').join(' ')
}

// The dialog of an action over the ticked documents. When it applies to none, the dialog
// says so and has no confirm (`confirmLabel` null).
export function batchDialogCopy(
    action: BatchAction,
    applies: number,
    skipped: number
): { title: string; body: string; confirmLabel: string | null } {
    const isOne = applies === 1
    if (action === 'delete_drafts') {
        if (applies === 0) {
            return {
                title: 'No drafts to delete',
                body:
                    skipped === 1
                        ? 'The selected document is not a draft.'
                        : `None of the ${skipped} selected documents is a draft.`,
                confirmLabel: null,
            }
        }
        const effect = isOne
            ? 'The draft and its lines are deleted. This cannot be undone.'
            : 'The drafts and their lines are deleted. This cannot be undone.'
        return {
            title: isOne ? 'Delete 1 draft?' : `Delete ${applies} drafts?`,
            body: joinSentences(skippedSentence(action, skipped), effect),
            confirmLabel: isOne ? 'Delete draft' : 'Delete drafts',
        }
    }
    if (applies === 0) {
        return {
            title: 'No documents to void',
            body:
                skipped === 1
                    ? 'The selected document cannot be voided.'
                    : `None of the ${skipped} selected documents can be voided.`,
            confirmLabel: null,
        }
    }
    const effect =
        'A reversing entry is posted in the original period. The number is kept. This cannot be undone.'
    return {
        title: isOne ? 'Void 1 document?' : `Void ${applies} documents?`,
        body: joinSentences(skippedSentence(action, skipped), effect),
        confirmLabel: isOne ? 'Void document' : 'Void documents',
    }
}

// The banner after a batch ends: the counts, then the first refusal's text.
export function batchResultText(done: number, failed: readonly string[]): string {
    const counts = `${done} done, ${failed.length} refused`
    if (failed.length === 0) return counts
    return `${counts}: ${failed[0]}`
}
