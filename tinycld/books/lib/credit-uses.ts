// A vendor credit's Applied to block (vendor refund spec §3.9): its applications to bills
// and the posted vendor refunds that name it, as one list in date order. On one day an
// application comes before a refund. Only an application is removable: a refund is voided
// or edited on its own page. Pure.

type DatedRow = { id: string; date: string }

export type CreditUseRow<Application extends DatedRow, Refund extends DatedRow> =
    | (Application & { kind: 'application'; removable: true })
    | (Refund & { kind: 'refund'; removable: false })

const KIND_ORDER = { application: 0, refund: 1 } as const

export function creditUseRows<Application extends DatedRow, Refund extends DatedRow>(
    applications: readonly Application[],
    refunds: readonly Refund[]
): CreditUseRow<Application, Refund>[] {
    const rows: CreditUseRow<Application, Refund>[] = [
        ...applications.map(row => ({
            ...row,
            kind: 'application' as const,
            removable: true as const,
        })),
        ...refunds.map(row => ({ ...row, kind: 'refund' as const, removable: false as const })),
    ]
    // Array sort is stable, so rows of one day and kind keep the order they came in.
    return rows.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1
        return KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    })
}
