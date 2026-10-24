import { type Ownership, type StarterAccount, starterChart } from './starter-chart'

// Levels by depth below the planned accounts: a child lands one level after its
// parent, and a child whose parent already exists starts at level 0 because the
// parent needs no insert first. `existing` maps an account number to its record id.
export function planChart(
    ownership: Ownership,
    existing: ReadonlyMap<string, string>
): StarterAccount[][] {
    const planned = starterChart(ownership).filter(item => !existing.has(item.number))
    const byKey = new Map(planned.map(item => [item.key, item]))
    const levels: StarterAccount[][] = []

    const depthOf = (item: StarterAccount): number => {
        const parent = item.parent ? byKey.get(item.parent) : undefined
        return parent ? depthOf(parent) + 1 : 0
    }

    for (const item of planned) {
        const depth = depthOf(item)
        levels[depth] = [...(levels[depth] ?? []), item]
    }
    // Equity goes first, and a stable sort keeps the ownership-specific account
    // ahead of the rest.
    return levels.map(level => [...level].sort((a, b) => equityRank(a) - equityRank(b)))
}

function equityRank(item: StarterAccount): number {
    return item.type === 'equity' ? 0 : 1
}
