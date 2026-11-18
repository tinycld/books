import { describe, expect, it } from 'vitest'
import { REFUND_OUTSTANDING } from '../tinycld/books/lib/outstanding-documents'
import { VENDOR_REFUND_CHROME } from '../tinycld/books/lib/payment-kind'
import { paymentScreenState } from '../tinycld/books/lib/payment-screen-state'
import {
    type PaymentFormKeyState,
    paymentFormKeysOffered,
} from '../tinycld/books/lib/payment-shortcuts'
import { VENDOR_REFUND_FLOW } from '../tinycld/books/lib/vendor-refund-flow'

// The vendor refund's descriptor of the shared payment layer (spec §3.1): its party, its
// documents, its collections' field names, its routes, its texts and the lines under the
// list; and the screen's key and state rules with this flow.

describe('VENDOR_REFUND_FLOW', () => {
    it('holds the vendor refund’s party, document, routes and rules', () => {
        expect(VENDOR_REFUND_FLOW.key).toBe('vendor_refund')
        expect(VENDOR_REFUND_FLOW.chrome).toBe(VENDOR_REFUND_CHROME)
        expect(VENDOR_REFUND_FLOW.testId).toBe('vendor-refund')
        expect(VENDOR_REFUND_FLOW.logContext).toBe('books.vendorRefund')
        expect(VENDOR_REFUND_FLOW.routeBase).toBe('books/vendor-refunds')
        expect(VENDOR_REFUND_FLOW.partyParam).toBe('vendor')
        expect(VENDOR_REFUND_FLOW.documentParam).toBe('credit')
        expect(VENDOR_REFUND_FLOW.doc).toBe(REFUND_OUTSTANDING)
        expect(VENDOR_REFUND_FLOW.sumRule).toBe('exact')
        expect(VENDOR_REFUND_FLOW.lineKey).toBe('lines')
        expect(VENDOR_REFUND_FLOW.serverFields).toEqual({ party: 'vendor', account: 'refunded_to' })
    })

    it('has the chrome of the vendor refund', () => {
        expect(VENDOR_REFUND_CHROME).toEqual({
            testId: 'vendor-refund',
            shortcutGroup: 'Vendor refund',
            figure: { label: 'Amount refunded', testId: 'figure' },
            helpTopic: 'books:vendor-refunds',
            lifecycle: 'posting',
        })
    })

    // The binding test ids of the capture manifest and the plan: vendor-refund-vendor,
    // -account, -account-balance, -list-prompt, -list-empty, -list-loading, -list-error,
    // -sum-error, -memo-text.
    it('names the test ids of the band, the list and the read view', () => {
        expect(VENDOR_REFUND_FLOW.ids).toMatchObject({
            party: 'vendor',
            account: 'account',
            accountBalance: 'account-balance',
            listPrompt: 'list-prompt',
            listEmpty: 'list-empty',
            listLoading: 'list-loading',
            listError: 'list-error',
            sumError: 'sum-error',
            memoText: 'memo-text',
        })
    })

    it('holds the titles', () => {
        const { texts } = VENDOR_REFUND_FLOW
        expect(texts.newTitle).toBe('Vendor refund')
        expect(texts.draftTitle).toBe('Draft vendor refund')
        expect(texts.editTitle('1001')).toBe('Edit vendor refund 1001')
        expect(texts.readTitle('1001')).toBe('Vendor refund 1001')
    })

    it('holds the band’s and the form rules’ texts', () => {
        const { texts } = VENDOR_REFUND_FLOW
        expect(texts.partyLabel).toBe('Vendor')
        expect(texts.dateLabel).toBe('Refund date')
        expect(texts.accountLabel).toBe('Refunded to')
        expect(texts.amountLabel).toBe('Amount refunded')
        expect(texts.partyRequired).toBe('Choose a vendor')
        expect(texts.accountInvalid).toBe('Choose the account the refund arrived in')
        expect(texts.amountRequired).toBe('Enter the amount refunded')
    })

    it('holds the list’s texts: prompt, no-credit text with the vendor’s name and its button, load error', () => {
        const { texts } = VENDOR_REFUND_FLOW
        expect(texts.listHeading).toBe('Unapplied vendor credits')
        expect(texts.listPrompt).toBe('Choose a vendor to see their unapplied credits.')
        expect(texts.noDocuments('Pacific Power')).toBe(
            'Pacific Power has no unapplied vendor credit. Record the vendor credit first, then its refund.'
        )
        expect(texts.noDocumentsLabel).toBe('New vendor credit')
        expect(texts.noDocumentsHref?.('vendorpacific01')).toBe(
            'books/vendor-credits/new?vendor=vendorpacific01'
        )
        expect(texts.listLoadFailed).toBe('Books could not load the vendor credits.')
        expect(texts.clearLabel).toBe('Clear refunds')
    })

    it('holds the row and sum refusals', () => {
        const { texts } = VENDOR_REFUND_FLOW
        expect(texts.aboveOpen('$650.00')).toBe('More than the unapplied credit of $650.00')
        expect(texts.datedAfter?.('1002')).toBe(
            'Vendor credit 1002 is dated after the refund date.'
        )
        expect(texts.rowsAbove('$700.00', '$650.00')).toBe(
            'The refunds add up to $700.00, more than the $650.00 refunded'
        )
        expect(texts.rowsBelow?.('$20.00')).toBe(
            '$20.00 of the refund is not on a vendor credit. Put it on a credit or lower the amount.'
        )
    })

    it('holds the memo’s label and hint', () => {
        expect(VENDOR_REFUND_FLOW.texts.memoLabel).toBe('Memo')
        expect(VENDOR_REFUND_FLOW.texts.memoHint).toBe(
            'Only your team sees this. Saved as the journal entry memo.'
        )
    })

    it('holds the screen state and dialog texts', () => {
        const { texts } = VENDOR_REFUND_FLOW
        expect(texts.loadFailed).toBe('Books could not load this vendor refund.')
        expect(texts.notFound).toBe('This vendor refund does not exist')
        expect(texts.cannotEdit).toBe('This vendor refund cannot be edited')
        expect(texts.noAccess).toBe('You need bookkeeper access to record vendor refunds')
        expect(texts.deleteDraftBody).toBe("Delete this draft vendor refund? This can't be undone.")
        expect(texts.voidBody).toBe(
            'A reversing entry is posted in the original period. The number is kept. The vendor credits it refunded are unapplied again.'
        )
    })

    it('holds the read view’s heading, verb and totals switch', () => {
        const { texts } = VENDOR_REFUND_FLOW
        expect(texts.readListHeading).toBe('Vendor credits refunded')
        expect(texts.paymentVerb).toBe('refunded to')
        expect(texts.hasAppliedTotal).toBe(false)
    })
})

describe('VENDOR_REFUND_FLOW.totals', () => {
    it('gives one line, On vendor credits, when the rows equal the amount', () => {
        const lines = VENDOR_REFUND_FLOW.totals({
            amountCents: 15_000,
            rowsCents: 15_000,
            currency: 'USD',
        })
        expect(lines).toHaveLength(1)
        expect(lines[0]).toMatchObject({
            label: 'On vendor credits',
            amount: '$150.00',
            isDanger: false,
        })
        expect(lines[0].id).toMatch(/on-credits$/)
    })

    it('adds Not placed, strong and in the danger tone, with the amount less the rows', () => {
        const lines = VENDOR_REFUND_FLOW.totals({
            amountCents: 18_000,
            rowsCents: 16_000,
            currency: 'USD',
        })
        expect(lines).toHaveLength(2)
        const [onCredits, notPlaced] = lines
        expect(onCredits).toMatchObject({ label: 'On vendor credits', amount: '$160.00' })
        expect(notPlaced).toMatchObject({
            label: 'Not placed',
            amount: '$20.00',
            isDanger: true,
            isStrong: true,
        })
        expect(notPlaced.id).toMatch(/not-placed$/)
    })
})

// A writer's new refund form that holds the keys, idle, no dialog, writes available.
const IDLE: PaymentFormKeyState = {
    holdsKeys: true,
    canWrite: true,
    isWriteHeld: false,
    isDialogOpen: false,
    isSavedDraft: false,
    writesAvailable: true,
}

function offered(state: Partial<PaymentFormKeyState>) {
    return paymentFormKeysOffered({ ...IDLE, ...state })
}

describe('paymentFormKeysOffered with the vendor refund', () => {
    it('offers Delete draft only on a saved draft', () => {
        expect(offered({})).not.toContain('deleteDraft')
        expect(offered({ isSavedDraft: true })).toContain('deleteDraft')
    })

    it('offers nothing while a save holds the form', () => {
        expect(offered({ isWriteHeld: true, isSavedDraft: true })).toEqual([])
    })

    // The keys that write (Post, Post & new, Delete draft) go with their disabled buttons;
    // the local keys stay, as on the received payment (tests/payment-shortcuts.test.ts:
    // ⌘S is kept so the browser's Save Page never opens).
    it('offers no form key while writes are unavailable (offline)', () => {
        const keys = offered({ writesAvailable: false, isSavedDraft: true })
        expect(keys).not.toContain('post')
        expect(keys).not.toContain('postAndNew')
        expect(keys).not.toContain('deleteDraft')
    })
})

type ScreenInput = Parameters<typeof paymentScreenState>[0]

// A writer at `books/vendor-refunds/new` with every read ready.
const NEW: ScreenInput = {
    isReady: true,
    isError: false,
    canWrite: true,
    isNew: true,
    status: null,
    isHeld: false,
    replacesStatus: undefined,
    replacesReady: true,
    replacesError: false,
}

describe('paymentScreenState with the vendor refund', () => {
    it('gives the no-access state on new without write access', () => {
        expect(paymentScreenState({ ...NEW, canWrite: false })).toBe('no-access')
        expect(paymentScreenState(NEW)).toBe('form')
    })

    it('gives the cannot-edit state for ?replaces of a draft or void refund', () => {
        expect(paymentScreenState({ ...NEW, replacesStatus: 'draft' })).toBe('cannot-edit')
        expect(paymentScreenState({ ...NEW, replacesStatus: 'void' })).toBe('cannot-edit')
        expect(paymentScreenState({ ...NEW, replacesStatus: 'posted' })).toBe('form')
    })
})
