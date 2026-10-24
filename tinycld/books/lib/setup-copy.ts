export function accountCountLabel(count: number): string {
    return count === 1 ? '1 account' : `${count} accounts`
}

export function chartCountNote(created: number): string {
    if (created === 0) return ''
    if (created === 1) return '1 account is in your chart. Try again skips it and continues.'
    return `${created} accounts are in your chart. Try again skips them and continues.`
}
