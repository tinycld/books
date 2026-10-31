// These strings mirror the refusals in server/accounts.go so the form can show
// the reason before the server has to. tests/account-messages.test.ts fails if
// the server wording drifts.
export function typeLockMessage(usage: { lines: number; children: number }): string | null {
    if (usage.lines > 0) {
        return `This account is used on ${usage.lines} journal lines, so its type cannot change. Create a new account and move the activity with a journal entry.`
    }
    if (usage.children > 0) {
        return `Sub-accounts share their parent's type. Change or move the ${usage.children} sub-accounts first.`
    }
    return null
}

export function inactiveRefusalMessage(activeChildren: number): string {
    return `Make the ${activeChildren} active sub-accounts inactive first.`
}

// msgBoxNeedsExpenseType in server/accounts.go: the root refusal of a 1099 box
// on an account that is not an expense-group type.
export const BOX_NEEDS_EXPENSE_TYPE =
    'Only expense accounts can be reported on a 1099. Set this account to Not reported in Settings → 1099s first.'

// Shown before a delete is tried; the server still decides and its own
// refusal is shown if it differs.
export function deleteBlockedMessage(usage: { lines: number; children: number }): string | null {
    if (usage.lines > 0) return 'This account is used on journal lines'
    if (usage.children > 0) return 'This account has sub-accounts'
    return null
}
