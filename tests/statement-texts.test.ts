import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    createScreenMode,
    emptyRecipientsText,
    fileStem,
    runNoticeText,
    savedToast,
    sentToast,
    statementActions,
    statementAttachmentName,
    statementBarState,
    statementPeriodText,
    statementSentText,
    statementTitle,
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

describe('sentToast', () => {
    it('counts the sent statements', () => {
        expect(sentToast(1)).toBe('1 statement sent')
        expect(sentToast(7)).toBe('7 statements sent')
    })
})

describe('runNoticeText', () => {
    const failed = [{ customer: 'custstatement01', name: 'Aspen Ridge', message: 'Refused.' }]

    it('counts the sent statements of a send run', () => {
        expect(runNoticeText({ intent: 'send', done: 8, total: 10, failed })).toBe(
            '8 of 10 statements were sent.'
        )
    })

    it('counts the saved statements of a save run', () => {
        expect(runNoticeText({ intent: 'save', done: 8, total: 10, failed })).toBe(
            '8 of 10 statements were saved.'
        )
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
        canSend: true,
        emailStatusLoading: false,
        isPreparing: false,
    }

    // Every action of the bar but Cancel (the note under the bar is no action).
    function actionsOf(state: ReturnType<typeof statementBarState>) {
        const { cancel: _cancel, note: _note, ...actions } = state
        return Object.entries(actions)
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
            expect(actions.map(([id]) => id)).toEqual(
                expect.arrayContaining(['preview', 'save', 'send'])
            )
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

    it('enables every action of a ready run with email set up, with no note', () => {
        const state = statementBarState(READY)
        expect({
            preview: state.preview,
            save: state.save,
            send: state.send,
            cancel: state.cancel,
            note: state.note,
        }).toEqual({
            preview: { isDisabled: false, label: 'Preview' },
            save: { isDisabled: false, label: 'Save' },
            send: { isDisabled: false, label: 'Save and send' },
            cancel: { isDisabled: false, label: 'Cancel' },
            note: null,
        })
    })

    it('with email not set up disables only Save and send and gives the note', () => {
        const state = statementBarState({ ...READY, canSend: false })
        expect(state.send.isDisabled).toBe(true)
        expect(state.preview.isDisabled).toBe(false)
        expect(state.save.isDisabled).toBe(false)
        expect(state.cancel.isDisabled).toBe(false)
        expect(state.note).toBe('Email sending is not set up')
    })

    it('disables Save and send while the email status loads, with no note', () => {
        const state = statementBarState({ ...READY, emailStatusLoading: true })
        expect(state.send.isDisabled).toBe(true)
        expect(state.preview.isDisabled).toBe(false)
        expect(state.save.isDisabled).toBe(false)
        expect(state.note).toBeNull()
    })

    it('while a preview is prepared disables Preview reading "Preparing…" and keeps the others enabled', () => {
        const state = statementBarState({ ...READY, isPreparing: true })
        expect(state.preview).toEqual({ isDisabled: true, label: 'Preparing…' })
        expect(state.save).toEqual({ isDisabled: false, label: 'Save' })
        expect(state.send).toEqual({ isDisabled: false, label: 'Save and send' })
        expect(state.cancel.isDisabled).toBe(false)
    })

    it('while a send run is held reads "Sending…" on Save and send and disables every button', () => {
        const state = statementBarState({ ...READY, isHeld: true, intent: 'send' })
        expect(state.send.label).toBe('Sending…')
        expect(state.save.label).toBe('Save')
        const { note: _note, ...buttons } = state
        expect(Object.keys(buttons)).toEqual(
            expect.arrayContaining(['cancel', 'preview', 'save', 'send'])
        )
        for (const [id, action] of Object.entries(buttons)) {
            expect({ id, isDisabled: action.isDisabled }).toEqual({ id, isDisabled: true })
        }
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

// --- Checkpoint 5: the Statements tab and the statement screen (spec §3.7, §3.8, §3.5) ---

describe('statementPeriodText', () => {
    it('gives a Balance forward period in one year with the year once', () => {
        expect(
            statementPeriodText({
                type: 'balance_forward',
                statement_date: '2026-10-22',
                start_date: '2026-09-21',
                end_date: '2026-10-22',
            })
        ).toBe('Sep 21 – Oct 22, 2026')
    })

    it('gives both years of a period over a year end', () => {
        expect(
            statementPeriodText({
                type: 'balance_forward',
                statement_date: '2026-01-14',
                start_date: '2025-12-15',
                end_date: '2026-01-14',
            })
        ).toBe('Dec 15, 2025 – Jan 14, 2026')
    })

    it('gives "As of" the statement date for Open items', () => {
        expect(
            statementPeriodText({
                type: 'open_items',
                statement_date: '2026-10-22',
                start_date: '',
                end_date: '',
            })
        ).toBe('As of Oct 22, 2026')
    })
})

describe('statementSentText', () => {
    const zone = process.env.TZ

    beforeEach(() => {
        process.env.TZ = 'UTC'
    })

    afterEach(() => {
        if (zone === undefined) delete process.env.TZ
        else process.env.TZ = zone
    })

    it('gives the day and the address of a sent statement', () => {
        expect(
            statementSentText({
                sent_at: '2026-11-20 15:30:00.000Z',
                sent_to: 'billing@aspenridge.example',
            })
        ).toBe('Nov 20, 2026 to billing@aspenridge.example')
    })

    it('reads the day of sent_at in the reader’s zone', () => {
        process.env.TZ = 'America/Los_Angeles'
        // The zone change reaches Date in this worker (else the test proves nothing).
        expect(new Date('2026-11-21T03:00:00Z').getDate()).toBe(20)
        expect(
            statementSentText({
                sent_at: '2026-11-21 03:00:00.000Z',
                sent_to: 'billing@aspenridge.example',
            })
        ).toBe('Nov 20, 2026 to billing@aspenridge.example')
    })

    it('reads "Not sent" for an empty sent_at', () => {
        expect(statementSentText({ sent_at: '', sent_to: '' })).toBe('Not sent')
    })
})

describe('statementTitle', () => {
    it('puts "Statement" before the number', () => {
        expect(statementTitle('ST-1001')).toBe('Statement ST-1001')
    })
})

// The rule of the Go fileStem (server/pdf_statement.go), from the one case table both run.
type FileStemCase = { in: string; out: string }

const FILE_STEM_CASES: FileStemCase[] = JSON.parse(
    readFileSync(join(__dirname, '..', 'server', 'testdata', 'file_stem_cases.json'), 'utf8')
)

describe('fileStem: the shared case table', () => {
    it('reads cases', () => {
        expect(FILE_STEM_CASES.length).toBeGreaterThan(5)
    })

    for (const c of FILE_STEM_CASES) {
        it(`${JSON.stringify(c.in)} gives ${JSON.stringify(c.out)}`, () => {
            expect(fileStem(c.in)).toBe(c.out)
        })
    }
})

describe('statementAttachmentName', () => {
    it('names the file from the number and the customer name', () => {
        expect(statementAttachmentName('ST-1001', 'Aspen Ridge Landscaping')).toBe(
            'statement-st-1001-aspen-ridge-landscaping.pdf'
        )
    })
})

describe('statementActions', () => {
    it('gives a writer with email every row-menu item and an enabled Send… with no note', () => {
        const actions = statementActions({
            canWrite: true,
            canSend: true,
            emailStatusLoading: false,
        })
        expect(actions.rowMenu).toEqual(['open', 'send', 'download', 'delete'])
        expect(actions.screen).toEqual(['send', 'download', 'delete'])
        expect(actions.isSendDisabled).toBe(false)
        expect(actions.note).toBeNull()
    })

    it('gives a writer without email the row menu without Send…, and a disabled Send… with the note', () => {
        const actions = statementActions({
            canWrite: true,
            canSend: false,
            emailStatusLoading: false,
        })
        expect(actions.rowMenu).toEqual(['open', 'download', 'delete'])
        expect(actions.screen).toEqual(['send', 'download', 'delete'])
        expect(actions.isSendDisabled).toBe(true)
        expect(actions.note).toBe('Email sending is not set up')
    })

    it('while the email status loads gives a writer a disabled Send…, no row-menu Send… and no note', () => {
        const actions = statementActions({
            canWrite: true,
            canSend: false,
            emailStatusLoading: true,
        })
        expect(actions.note).toBeNull()
        expect(actions.isSendDisabled).toBe(true)
        expect(actions.rowMenu).not.toContain('send')
        expect(actions.rowMenu).toEqual(['open', 'download', 'delete'])
    })

    it('gives a reader Open and Download PDF only', () => {
        for (const canSend of [true, false]) {
            const actions = statementActions({
                canWrite: false,
                canSend,
                emailStatusLoading: false,
            })
            expect(actions.rowMenu).toEqual(['open', 'download'])
            expect(actions.screen).toEqual(['download'])
            expect(actions.note).toBeNull()
        }
    })
})
