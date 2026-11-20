import { describe, expect, it } from 'vitest'
import {
    createScreenMode,
    emptyRecipientsText,
    savedToast,
    statementBarState,
} from '../tinycld/books/lib/statement-texts'

// The create screen's words and its pure state choices (statements spec §3.4, §3.9, §3.10):
// the Save toast, the empty list, the bar's disabled states and labels, and whether a user
// gets the form or the no-write notice.

describe('savedToast', () => {
    it('counts the saved statements', () => {
        expect(savedToast(1)).toBe('1 statement saved')
        expect(savedToast(7)).toBe('7 statements saved')
    })
})

describe('emptyRecipientsText', () => {
    const SECOND_LINE = 'Change Customer balance to list more customers.'

    it('gives the title of each filter and the one second line', () => {
        const titles = {
            open: 'No customer has an open balance',
            overdue: 'No customer is overdue',
            all: 'No customers yet',
        } as const
        for (const filter of ['open', 'overdue', 'all'] as const) {
            expect(Object.values(emptyRecipientsText(filter))).toEqual(
                expect.arrayContaining([titles[filter], SECOND_LINE])
            )
        }
    })
})

describe('statementBarState', () => {
    const READY = {
        canWrite: true,
        writesAvailable: true,
        tickedCount: 3,
        isLoading: false,
        hasLoadError: false,
        isHeld: false,
        intent: 'save' as const,
    }

    // Every action of the bar but Cancel.
    function actionsOf(state: ReturnType<typeof statementBarState>) {
        return Object.entries(state).filter(([id]) => id !== 'cancel')
    }

    it('enables Save and Cancel when the run is ready, Save reading "Save"', () => {
        const state = statementBarState(READY)
        expect(state.save.isDisabled).toBe(false)
        expect(state.save.label).toBe('Save')
        expect(state.cancel.isDisabled).toBe(false)
    })

    const blocked = {
        'no ticked customer': { tickedCount: 0 },
        'the list still loading': { isLoading: true },
        'a load error': { hasLoadError: true },
        'a run held': { isHeld: true },
        offline: { writesAvailable: false },
    } as const

    for (const [why, change] of Object.entries(blocked)) {
        it(`disables every action with ${why}`, () => {
            const state = statementBarState({ ...READY, ...change })
            const actions = actionsOf(state)
            expect(actions.map(([id]) => id)).toContain('save')
            for (const [id, action] of actions) {
                expect({ id, isDisabled: action.isDisabled }).toEqual({ id, isDisabled: true })
            }
        })
    }

    it('reads "Saving…" on Save while a save run is held', () => {
        expect(statementBarState({ ...READY, isHeld: true, intent: 'save' }).save.label).toBe(
            'Saving…'
        )
    })

    it('never disables Cancel except while held', () => {
        for (const change of [
            { tickedCount: 0 },
            { isLoading: true },
            { hasLoadError: true },
            { writesAvailable: false },
        ]) {
            expect(statementBarState({ ...READY, ...change }).cancel.isDisabled).toBe(false)
        }
        expect(statementBarState({ ...READY, isHeld: true }).cancel.isDisabled).toBe(true)
    })
})

describe('createScreenMode', () => {
    it('draws the no-write notice for a read-only user and while the access loads', () => {
        expect(createScreenMode({ canWrite: false, accessLoading: false })).toBe('notice')
        expect(createScreenMode({ canWrite: false, accessLoading: true })).toBe('notice')
        expect(createScreenMode({ canWrite: true, accessLoading: true })).toBe('notice')
    })

    it('draws the form for a writer whose access has loaded', () => {
        expect(createScreenMode({ canWrite: true, accessLoading: false })).toBe('form')
    })
})
