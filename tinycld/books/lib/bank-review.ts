import type { SetupTab } from '@tinycld/core/components/setup/wizard/SetupTabs'
import type { BooksBankTransactions } from '../types'
import { formatMoney } from './money'
import { formatDay } from './register-range'

// The tabs of a bank account's panel, in tab-bar order. The three transaction tabs list
// the connection's rows of one status; Files holds the upload area and the file list.
export type ReviewTab = 'review' | 'reviewed' | 'excluded' | 'files'
export const REVIEW_TABS: readonly ReviewTab[] = ['review', 'reviewed', 'excluded', 'files']

export type TxnTab = Exclude<ReviewTab, 'files'>
export type TxnStatus = BooksBankTransactions['status']

export const TXN_STATUS_OF: Record<TxnTab, TxnStatus> = {
    review: 'for_review',
    reviewed: 'reviewed',
    excluded: 'excluded',
}

function isReviewTab(value: string): value is ReviewTab {
    return (REVIEW_TABS as readonly string[]).includes(value)
}

// The `tab` URL param as a tab. expo-router gives a repeated param as an array, so the
// first value counts; a missing or unknown value means For review, the default tab.
export function reviewTabFromParam(param: string | string[] | undefined): ReviewTab {
    const value = Array.isArray(param) ? param[0] : param
    return value !== undefined && isReviewTab(value) ? value : 'review'
}

const TAB_LABELS: Record<ReviewTab, string> = {
    review: 'For review',
    reviewed: 'Reviewed',
    excluded: 'Excluded',
    files: 'Files',
}

// Only For review carries a count: it is the tab that needs work.
export function reviewTabItems(reviewCount: number): SetupTab<ReviewTab>[] {
    return REVIEW_TABS.map(tab => {
        const label =
            tab === 'review' && reviewCount > 0
                ? `${TAB_LABELS.review} (${reviewCount})`
                : TAB_LABELS[tab]
        return { value: tab, label }
    })
}

export function reviewCountText(count: number): string {
    if (count === 0) return 'Nothing to review'
    return `${count} to review`
}

export type ReviewViewState = 'loading' | 'error' | 'empty' | 'no-match' | 'ready'

// A load error wins over rows still on screen, so Retry is always offered; an empty list
// under a filter is a no-match, not the tab's empty state.
export function reviewViewState(input: {
    isReady: boolean
    isError: boolean
    rowCount: number
    hasFilter: boolean
}): ReviewViewState {
    if (input.isError) return 'error'
    if (!input.isReady) return 'loading'
    if (input.rowCount > 0) return 'ready'
    return input.hasFilter ? 'no-match' : 'empty'
}

function waitingSentence(count: number): string {
    if (count === 1) return '1 file is waiting to import.'
    return `${count} files are waiting to import.`
}

export function reviewEmptyText(tab: TxnTab, waitingCount: number): string {
    if (tab === 'reviewed') {
        return 'No reviewed transactions yet. A transaction moves here when you match or categorize it.'
    }
    if (tab === 'excluded') {
        return 'No excluded transactions. Exclude a transaction in For review to keep it out of your books.'
    }
    if (waitingCount > 0) return `Nothing to review. ${waitingSentence(waitingCount)}`
    return 'Nothing to review. Upload a statement and import it to see its transactions here.'
}

// A signed amount as two unsigned columns: money out (negative) under Spent, money in
// under Received. A zero amount is neither.
export function txnAmountCells(
    amount: number,
    currency: string
): { spent: string; received: string } {
    if (amount < 0) return { spent: formatMoney(-amount, currency), received: '' }
    if (amount > 0) return { spent: '', received: formatMoney(amount, currency) }
    return { spent: '', received: '' }
}

function checkText(checkNumber: string): string {
    const trimmed = checkNumber.trim()
    return trimmed ? `Check ${trimmed}` : ''
}

function joinParts(parts: readonly string[]): string {
    return parts.filter(part => part !== '').join(' · ')
}

// A wide row's second line: the memo and the check number, each only when present.
export function txnSecondLine(memo: string, checkNumber: string): string {
    return joinParts([memo.trim(), checkText(checkNumber)])
}

// A phone card's second line: the day, then the check number when there is one.
export function txnPhoneLine(day: string, checkNumber: string): string {
    return joinParts([formatDay(day), checkText(checkNumber)])
}

export const REVIEW_ROW_HEIGHT = 56
export const REVIEW_CARD_HEIGHT = 72
export const REVIEW_TABLE_MIN_WIDTH = 720

// Header and rows read the same objects, so the columns line up.
export const REVIEW_CELLS = {
    check: { width: 44 },
    date: { width: 112 },
    description: { flex: 1, minWidth: 240 },
    spent: { width: 128 },
    received: { width: 128 },
} as const
