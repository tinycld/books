// The words of customer statements (statements spec §3). A plain module: no React, no
// React Native, so the seed, the audit labels and e2e helpers can import it.
import type { StatementRunOutcome } from '../stores/statements-store'
import type { BooksStatements } from '../types'

export type StatementType = BooksStatements['type']

// The create screen's Customer balance filter (spec §3.2).
export type StatementBalanceFilter = 'open' | 'overdue' | 'all'

export const STATEMENT_TYPE_LABELS: Record<StatementType, string> = {
    balance_forward: 'Balance forward',
    open_items: 'Open items',
}

export const STATEMENT_BALANCE_LABELS: Record<StatementBalanceFilter, string> = {
    open: 'Open',
    overdue: 'Overdue',
    all: 'All',
}

// The toast of a Save run that stored every statement (spec §3.4).
export function savedToast(count: number): string {
    return count === 1 ? '1 statement saved' : `${count} statements saved`
}

const EMPTY_TITLES: Record<StatementBalanceFilter, string> = {
    open: 'No customer has an open balance',
    overdue: 'No customer is overdue',
    all: 'No customers yet',
}

// The create screen's list when no customer matches Customer balance (spec §3.10).
export function emptyRecipientsText(filter: StatementBalanceFilter): {
    title: string
    detail: string
} {
    return {
        title: EMPTY_TITLES[filter],
        detail: 'Change Customer balance to list more customers.',
    }
}

// The toast of a Save and send run that sent every statement (spec §3.4).
export function sentToast(count: number): string {
    return count === 1 ? '1 statement sent' : `${count} statements sent`
}

// The first line of the run notice after a part of a run failed (spec §3.4).
export function runNoticeText(outcome: StatementRunOutcome): string {
    const verb = outcome.intent === 'send' ? 'sent' : 'saved'
    return `${outcome.done} of ${outcome.total} statements were ${verb}.`
}

// The line under the bar when the server cannot send email (spec §3.4).
export const EMAIL_NOT_SET_UP = 'Email sending is not set up'

export type StatementBarInput = {
    canWrite: boolean
    writesAvailable: boolean
    tickedCount: number
    isLoading: boolean
    hasLoadError: boolean
    // A run is in flight (stores/statements-store.ts); `intent` names the button that
    // started it.
    isHeld: boolean
    intent: 'save' | 'send'
    // core fetchEmailStatus() (hooks/useEmailStatus.ts): whether the server can send email,
    // and whether that answer is still loading.
    canSend: boolean
    emailStatusLoading: boolean
    // Preview's PDF is being prepared (hooks/useStatementPreview.ts).
    isPreparing: boolean
}

export type StatementBarAction = { isDisabled: boolean; label: string }

// Each button of the create screen's bar (spec §3.4, §3.10): a run needs a writer, writes
// available, a loaded list and at least one tick, and no run in flight. Preview is also
// idle while its PDF is prepared; Save and send also needs the server to send email, and is
// idle while that is not known yet. Cancel leaves at any time but while a run is in
// flight. The note under the bar says when the server cannot send email.
export function statementBarState(input: StatementBarInput): {
    cancel: StatementBarAction
    preview: StatementBarAction
    save: StatementBarAction
    send: StatementBarAction
    note: string | null
} {
    const isRunDisabled =
        !input.canWrite ||
        !input.writesAvailable ||
        input.tickedCount === 0 ||
        input.isLoading ||
        input.hasLoadError ||
        input.isHeld
    const isSaving = input.isHeld && input.intent === 'save'
    const isSending = input.isHeld && input.intent === 'send'
    const isEmailBlocked = input.emailStatusLoading || !input.canSend
    const isEmailNotSetUp = !input.emailStatusLoading && !input.canSend
    return {
        cancel: { isDisabled: input.isHeld, label: 'Cancel' },
        preview: {
            isDisabled: isRunDisabled || input.isPreparing,
            label: input.isPreparing ? 'Preparing…' : 'Preview',
        },
        save: { isDisabled: isRunDisabled, label: isSaving ? 'Saving…' : 'Save' },
        send: {
            isDisabled: isRunDisabled || isEmailBlocked,
            label: isSending ? 'Sending…' : 'Save and send',
        },
        note: isEmailNotSetUp ? EMAIL_NOT_SET_UP : null,
    }
}

// A read-only user, or one whose access has not loaded yet, gets the Books no-write notice
// in place of the form (spec §3.9).
export function createScreenMode(input: {
    canWrite: boolean
    accessLoading: boolean
}): 'notice' | 'form' {
    return input.canWrite && !input.accessLoading ? 'form' : 'notice'
}
