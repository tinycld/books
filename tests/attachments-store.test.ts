import { uploadFileToPickedFile } from '@tinycld/core/file-viewer/picked-file'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAttachmentsStore } from '../tinycld/books/stores/attachments-store'

// Attachments spec §3.2: picked and dropped files live in a Books store keyed by the
// session (`read:<recordId>` in the read view), not in React state.

function draft(key: string, name: string, mimeType = 'application/pdf') {
    const file = uploadFileToPickedFile(new File(['%PDF-1.4'], name, { type: mimeType }))
    return {
        key,
        file,
        name,
        mimeType,
        size: file.size,
        state: { kind: 'pending' as const },
    }
}

function session(sessionKey: string) {
    return useAttachmentsStore.getState().sessions[sessionKey]
}

const actions = () => useAttachmentsStore.getState()

describe('useAttachmentsStore', () => {
    beforeEach(() => {
        useAttachmentsStore.setState({ sessions: {} })
    })

    it('opens an empty session, then keeps added drafts in the order they came', () => {
        actions().open('read:bill1')
        expect(session('read:bill1')).toEqual({ drafts: [], removals: [], refusal: null })

        actions().add('read:bill1', [draft('a', 'receipt.pdf'), draft('b', 'photo.png')])
        actions().add('read:bill1', [draft('c', 'notes.csv', 'text/csv')])
        expect(session('read:bill1').drafts.map(d => d.name)).toEqual([
            'receipt.pdf',
            'photo.png',
            'notes.csv',
        ])
        expect(session('read:bill1').drafts[2]).toMatchObject({
            key: 'c',
            mimeType: 'text/csv',
            state: { kind: 'pending' },
        })
    })

    it('setState changes the state of one draft only', () => {
        actions().open('read:bill1')
        actions().add('read:bill1', [draft('a', 'receipt.pdf'), draft('b', 'photo.png')])

        actions().setState('read:bill1', 'b', { kind: 'uploading', percent: 45 })
        expect(session('read:bill1').drafts.map(d => d.state)).toEqual([
            { kind: 'pending' },
            { kind: 'uploading', percent: 45 },
        ])

        actions().setState('read:bill1', 'b', { kind: 'failed', message: 'Too big.' })
        expect(session('read:bill1').drafts[1].state).toEqual({
            kind: 'failed',
            message: 'Too big.',
        })
        expect(session('read:bill1').drafts[0].state).toEqual({ kind: 'pending' })
    })

    it('discard removes one draft and keeps the rest in order', () => {
        actions().open('read:bill1')
        actions().add('read:bill1', [
            draft('a', 'receipt.pdf'),
            draft('b', 'photo.png'),
            draft('c', 'notes.csv', 'text/csv'),
        ])

        actions().discard('read:bill1', 'b')
        expect(session('read:bill1').drafts.map(d => d.key)).toEqual(['a', 'c'])
    })

    it('markRemoval collects ids and unmarkRemovals clears them', () => {
        actions().open('read:bill1')
        actions().markRemoval('read:bill1', 'att1')
        actions().markRemoval('read:bill1', 'att2')
        expect(session('read:bill1').removals).toEqual(['att1', 'att2'])

        actions().unmarkRemovals('read:bill1')
        expect(session('read:bill1').removals).toEqual([])
    })

    it('setRefusal shows a refusal and setRefusal(null) clears it', () => {
        actions().open('read:bill1')
        actions().setRefusal('read:bill1', 'big.pdf is larger than 20 MB.')
        expect(session('read:bill1').refusal).toBe('big.pdf is larger than 20 MB.')

        actions().setRefusal('read:bill1', null)
        expect(session('read:bill1').refusal).toBeNull()
    })

    it('drop removes the session', () => {
        actions().open('read:bill1')
        actions().add('read:bill1', [draft('a', 'receipt.pdf')])
        actions().drop('read:bill1')
        expect(Object.hasOwn(useAttachmentsStore.getState().sessions, 'read:bill1')).toBe(false)
    })

    it('keeps the drafts, removals and refusal of two sessions apart', () => {
        actions().open('read:bill1')
        actions().open('read:exp1')
        actions().add('read:bill1', [draft('a', 'receipt.pdf')])
        actions().add('read:exp1', [draft('b', 'slip.png', 'image/png')])
        actions().markRemoval('read:bill1', 'att1')
        actions().setRefusal('read:exp1', 'page.html is not a file type Books keeps.')

        expect(session('read:bill1').drafts.map(d => d.name)).toEqual(['receipt.pdf'])
        expect(session('read:exp1').drafts.map(d => d.name)).toEqual(['slip.png'])
        expect(session('read:bill1').removals).toEqual(['att1'])
        expect(session('read:exp1').removals).toEqual([])
        expect(session('read:bill1').refusal).toBeNull()

        actions().drop('read:exp1')
        expect(session('read:bill1').drafts.map(d => d.name)).toEqual(['receipt.pdf'])
    })
})
