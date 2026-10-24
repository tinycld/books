import { type AccountGroup, accountTypeDef } from '../../lib/account-types'
import { warnOnce } from '../../lib/warn-once'

function warnType(kind: 'type' | 'detail type', key: string) {
    const id = kind === 'type' ? `type:${key}` : `detail type:${key}`
    warnOnce(id, 'books.accounts', `unknown account ${kind}, showing the raw key`, { key })
}

export function accountDisplay(type: string, detailType: string) {
    const def = accountTypeDef(type)
    if (!def) warnType('type', type)
    const detail = def?.detailTypes.find(d => d.key === detailType)
    if (def && !detail) warnType('detail type', detailType)
    const group: AccountGroup | null = def?.group ?? null
    return {
        typeLabel: def?.label ?? type,
        detailLabel: detail?.label ?? detailType,
        group,
    }
}
