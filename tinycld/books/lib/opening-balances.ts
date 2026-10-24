import type { BooksAccounts } from '../types'
import { buildAccountTree, defaultSort, type TreeAccount, type TreeNode } from './account-tree'
import { accountTypeDef } from './account-types'
import { isWellFormedMoney, maxStoredAmount, parseMoney } from './money'
import type { OpeningPreset } from './opening-balances-schema'
import { formatDay, rangeForPreset } from './register-range'
import type { SidebarEntry } from './shell-nav'

export type OpeningAccount = Pick<
    BooksAccounts,
    'id' | 'name' | 'number' | 'type' | 'detail_type' | 'parent' | 'inactive' | 'currency'
>
export type OpeningGroup = 'asset' | 'liability' | 'equity'
export type OpeningRow = {
    account: OpeningAccount
    depth: number
    isInactive: boolean
    helper: string
}
export type OpeningBand = {
    group: OpeningGroup
    title: string
    caption: string
    rows: OpeningRow[]
}

// The server's per-line limit.
export const maxLineAmount = 1_000_000_000_000_000
// The balancing line is saved too, so amounts are capped one below the line limit.
export const maxOpeningAmounts = 999

const bandDefs: readonly { group: OpeningGroup; title: string; caption: string }[] = [
    { group: 'asset', title: 'Assets', caption: 'Enter what each account holds' },
    { group: 'liability', title: 'Liabilities', caption: 'Enter what you owe' },
    { group: 'equity', title: 'Equity', caption: "Enter the owners' share" },
]

const openingEquityDetail = 'opening_balance_equity'
const receivablePayable = new Set(['accounts_receivable', 'accounts_payable'])
const noDetailHelper = 'No customer or vendor detail'

function groupOf(account: OpeningAccount): OpeningGroup | null {
    const group = accountTypeDef(account.type)?.group
    return group === 'asset' || group === 'liability' || group === 'equity' ? group : null
}

function isOpeningEquity(account: OpeningAccount): boolean {
    return account.type === 'equity' && account.detail_type === openingEquityDetail
}

export function findOpeningEquityAccount(
    accounts: readonly OpeningAccount[]
): OpeningAccount | undefined {
    return accounts.find(account => isOpeningEquity(account) && !account.inactive)
}

type TreeOpeningAccount = OpeningAccount & TreeAccount

function flatten(nodes: TreeNode<TreeOpeningAccount>[], rows: OpeningRow[]) {
    for (const node of nodes) {
        const { debit_total: _debit, credit_total: _credit, ...account } = node.account
        rows.push({
            account,
            depth: node.depth,
            isInactive: account.inactive,
            helper: receivablePayable.has(account.type) ? noDetailHelper : '',
        })
        flatten(node.children, rows)
    }
}

export function pickOpeningBands(
    accounts: readonly OpeningAccount[],
    savedAccountIds: ReadonlySet<string>
): OpeningBand[] {
    const shown = accounts.filter(
        account =>
            !isOpeningEquity(account) && (!account.inactive || savedAccountIds.has(account.id))
    )
    return bandDefs.map(def => {
        const inBand: TreeOpeningAccount[] = shown
            .filter(account => groupOf(account) === def.group)
            .map(account => ({ ...account, debit_total: 0, credit_total: 0 }))
        const rows: OpeningRow[] = []
        flatten(buildAccountTree(inBand, defaultSort), rows)
        return { ...def, rows }
    })
}

export type OpeningLine = { account: string; debit: number; credit: number }
export type OpeningBuild = {
    lines: OpeningLine[]
    balancing: { side: 'debit' | 'credit'; amount: number } | null
    totals: {
        assets: number
        liabilities: number
        equity: number
        balancing: number
        equityWithBalancing: number
    }
    problem: null | 'too-large' | 'too-many-lines'
}

// True when adding x to s would pass the stored maximum; checked before adding so
// the sum is never inexact.
function overflows(sum: number, x: number): boolean {
    return x > 0 ? x > maxStoredAmount - sum : x < -maxStoredAmount - sum
}

export function buildOpening(
    accounts: readonly OpeningAccount[],
    cents: Readonly<Record<string, number>>
): OpeningBuild {
    // Ids in cents that are not in accounts are ignored: the caller passes only the
    // listed accounts' amounts.
    const withAmount = new Set(Object.keys(cents).filter(id => cents[id] !== 0))
    const rows = pickOpeningBands(accounts, withAmount).flatMap(band =>
        band.rows.map(row => ({ group: band.group, account: row.account }))
    )
    const lines: OpeningLine[] = []
    const sums = { asset: 0, liability: 0, equity: 0, debits: 0, credits: 0 }
    let tooLarge = false
    const add = (key: keyof typeof sums, x: number) => {
        if (overflows(sums[key], x)) tooLarge = true
        else sums[key] += x
    }

    for (const { group, account } of rows) {
        const amount = cents[account.id] ?? 0
        if (amount === 0) continue
        if (Math.abs(amount) > maxLineAmount) tooLarge = true
        const normal = accountTypeDef(account.type)?.normal ?? 'debit'
        const onNormalSide = amount > 0
        const isDebit = (normal === 'debit') === onNormalSide
        const size = Math.abs(amount)
        lines.push({
            account: account.id,
            debit: isDebit ? size : 0,
            credit: isDebit ? 0 : size,
        })
        add(group, amount)
        add(isDebit ? 'debits' : 'credits', size)
    }

    const net = sums.debits - sums.credits
    const balancing =
        net === 0
            ? null
            : { side: net > 0 ? ('credit' as const) : ('debit' as const), amount: Math.abs(net) }
    const equityWithBalancing = sums.equity + net
    if (overflows(sums.equity, net)) tooLarge = true

    if (balancing && balancing.amount > maxLineAmount) tooLarge = true

    let problem: OpeningBuild['problem'] = null
    if (tooLarge) problem = 'too-large'
    else if (lines.length > maxOpeningAmounts) problem = 'too-many-lines'

    return {
        lines,
        balancing,
        totals: {
            assets: sums.asset,
            liabilities: sums.liability,
            equity: sums.equity,
            balancing: net,
            equityWithBalancing,
        },
        problem,
    }
}

export function amountCents(text: string): number | null {
    if (text.trim() === '') return 0
    return parseMoney(text)
}

const syntaxMessage = 'Enter an amount like 1,234.50'

export function amountError(text: string): string | null {
    const cents = amountCents(text)
    if (cents !== null) return null
    return isWellFormedMoney(text) ? 'Amount is too large' : syntaxMessage
}

export type PreviewRow = { id: string; label: string; cents: number }
export type PreviewSection = {
    group: OpeningGroup
    title: string
    rows: PreviewRow[]
    total: number
}
export type OpeningPreview = {
    sections: PreviewSection[]
    balancingRow: PreviewRow | null
    totalLiabilitiesAndEquity: number
    totalAssets: number
    isEmpty: boolean
}

const balancingFallbackId = 'opening-balance-equity'
const balancingFallbackLabel = 'Opening Balance Equity'

export function previewFor(
    accounts: readonly OpeningAccount[],
    cents: Readonly<Record<string, number>>
): OpeningPreview {
    const build = buildOpening(accounts, cents)
    const withAmount = new Set(Object.keys(cents).filter(id => cents[id] !== 0))
    const bands = pickOpeningBands(accounts, withAmount)
    const totals: Record<OpeningGroup, number> = {
        asset: build.totals.assets,
        liability: build.totals.liabilities,
        equity: build.totals.equityWithBalancing,
    }
    const totalOf = (group: OpeningGroup) => totals[group]

    const equityAccount = findOpeningEquityAccount(accounts)
    const balancingRow: PreviewRow | null = build.balancing
        ? {
              id: equityAccount?.id ?? balancingFallbackId,
              label: equityAccount?.name ?? balancingFallbackLabel,
              cents: build.totals.balancing,
          }
        : null

    const sections = bands.map(band => {
        const rows: PreviewRow[] = band.rows
            .filter(row => (cents[row.account.id] ?? 0) !== 0)
            .map(row => ({
                id: row.account.id,
                label: row.account.name,
                cents: cents[row.account.id],
            }))
        if (band.group === 'equity' && balancingRow) rows.push(balancingRow)
        return { group: band.group, title: band.title, rows, total: totalOf(band.group) }
    })

    return {
        sections,
        balancingRow,
        totalAssets: build.totals.assets,
        totalLiabilitiesAndEquity: build.totals.liabilities + build.totals.equityWithBalancing,
        isEmpty: build.lines.length === 0,
    }
}

export type SavedLine = {
    id: string
    account: string
    debit: number
    credit: number
    position: number
}
export type LineDiff = {
    insert: OpeningLine[]
    update: { id: string; debit: number; credit: number; position: number }[]
    remove: string[]
}

export function diffLines(saved: readonly SavedLine[], next: readonly OpeningLine[]): LineDiff {
    const byAccount = new Map<string, SavedLine>()
    for (const line of saved) if (!byAccount.has(line.account)) byAccount.set(line.account, line)
    const kept = new Set<string>()
    const diff: LineDiff = { insert: [], update: [], remove: [] }

    next.forEach((line, position) => {
        const match = byAccount.get(line.account)
        if (!match) {
            diff.insert.push(line)
            return
        }
        kept.add(match.id)
        if (
            match.debit === line.debit &&
            match.credit === line.credit &&
            match.position === position
        ) {
            return
        }
        diff.update.push({ id: match.id, debit: line.debit, credit: line.credit, position })
    })
    for (const line of saved) if (!kept.has(line.id)) diff.remove.push(line.id)
    return diff
}

export function centsToText(cents: number): string {
    const digits = BigInt(Math.abs(cents)).toString().padStart(3, '0')
    const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+$)/g, ',')
    return `${cents < 0 ? '-' : ''}${whole}.${digits.slice(-2)}`
}

export function amountsFromLines(
    accounts: readonly OpeningAccount[],
    lines: readonly SavedLine[],
    balancingAccountId: string
): Record<string, string> {
    const byId = new Map(accounts.map(account => [account.id, account]))
    const amounts: Record<string, string> = {}
    const seen = new Set<string>()
    for (const line of lines) {
        const account = byId.get(line.account)
        if (!account || line.account === balancingAccountId) continue
        if (seen.has(account.id)) continue
        seen.add(account.id)
        const normal = accountTypeDef(account.type)?.normal ?? 'debit'
        const cents = normal === 'debit' ? line.debit - line.credit : line.credit - line.debit
        if (cents !== 0) amounts[account.id] = centsToText(cents)
    }
    return amounts
}

export function centsFromAmounts(
    amounts: Readonly<Record<string, string>>
): Record<string, number> {
    const cents: Record<string, number> = {}
    for (const [id, text] of Object.entries(amounts)) {
        const value = amountCents(text)
        if (value !== null && value !== 0) cents[id] = value
    }
    return cents
}

const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function isRealDay(day: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
    const [year, month, date] = day.split('-').map(Number)
    if (month < 1 || month > 12) return false
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    const length = month === 2 && isLeap ? 29 : monthLengths[month - 1]
    return date >= 1 && date <= length
}

export function dayLabel(day: string): string {
    return isRealDay(day) ? formatDay(day) : ''
}

export function memoFor(date: string): string {
    return isRealDay(date) ? `Opening balances as of ${formatDay(date)}` : 'Opening balances'
}

// A blank memo means the person left it untouched.
export function effectiveMemo(memo: string, date: string): string {
    return memo.trim() === '' ? memoFor(date) : memo
}

export function presetDate(
    preset: Exclude<OpeningPreset, 'custom'>,
    today: string,
    fiscalStartMonth: number
): string {
    return rangeForPreset(preset, today, fiscalStartMonth).end
}

export function viewEntryHref(
    sidebar: readonly Pick<SidebarEntry, 'id' | 'available'>[],
    entryId: string
): string | null {
    const entries = sidebar.find(item => item.id === 'entries')
    return entries?.available ? `books/entries/${entryId}` : null
}

export type OpeningEntryRow = {
    id: string
    date: string
    memo: string
    status: string
    number: string
    replaces: string
}
export type OpeningScreenState =
    | { kind: 'loading' }
    | { kind: 'error' }
    | { kind: 'no-access' }
    | { kind: 'empty-chart' }
    | { kind: 'new' }
    | { kind: 'draft'; entry: OpeningEntryRow }
    | { kind: 'posted'; entry: OpeningEntryRow }
    | { kind: 'replace'; entry: OpeningEntryRow }

export function openingScreenState(input: {
    isReady: boolean
    isError: boolean
    canRead: boolean
    hasBalanceSheetAccounts: boolean
    entries: readonly OpeningEntryRow[]
    isEditing: boolean
}): OpeningScreenState {
    if (input.isError) return { kind: 'error' }
    if (!input.isReady) return { kind: 'loading' }
    if (!input.canRead) return { kind: 'no-access' }
    if (!input.hasBalanceSheetAccounts) return { kind: 'empty-chart' }
    const draft = input.entries.find(entry => entry.status === 'draft')
    if (draft) return { kind: 'draft', entry: draft }
    const posted = input.entries.find(entry => entry.status === 'posted')
    if (posted) return { kind: input.isEditing ? 'replace' : 'posted', entry: posted }
    return { kind: 'new' }
}
