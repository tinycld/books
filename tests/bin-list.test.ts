import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    BIN_COLUMNS,
    BIN_ROW_MENU_LABELS,
    BIN_TABLE_MIN_WIDTH,
    binDialogState,
    binRowMenuItems,
    stockInBinParams,
    transferText,
} from '../tinycld/books/lib/bin-list'
import {
    BIN_IDS,
    BIN_TRANSFERS,
    BINS,
    INVENTORY_USER_NAMES,
    NO_BIN,
} from '../tinycld/books/lib/inventory-adjust-fixture'
import { STOCK_BY_BIN_BINS_PARAM } from '../tinycld/books/lib/shipped-reports'

// The bin list's rules (inventory-adjust spec §3.7) and the Recent moves line of the item
// page's Bins tab (§3.8).

function binOf(id: string) {
    const bin = BINS.find(row => row.id === id)
    if (!bin) throw new Error(`no fixture bin ${id}`)
    return bin
}

const ACTIVE = binOf(BIN_IDS.aisle3)
const INACTIVE = binOf(BIN_IDS.backRoom)

// The menu as the row shows it: each item's label (spec §3.7 "Row menu: Edit, Stock in
// this bin, Make inactive / Make active, Delete").
function menuLabels(bin: Pick<typeof ACTIVE, 'inactive'>, canWrite: boolean): string[] {
    return binRowMenuItems(bin, canWrite).map(item => BIN_ROW_MENU_LABELS[item])
}

describe('binRowMenuItems', () => {
    it('gives a writer Edit, Stock in this bin, Make inactive and Delete on an active bin', () => {
        expect(ACTIVE.inactive).toBe(false)
        expect(menuLabels(ACTIVE, true)).toEqual([
            'Edit',
            'Stock in this bin',
            'Make inactive',
            'Delete',
        ])
    })

    it('gives a writer Edit, Stock in this bin, Make active and Delete on an inactive bin', () => {
        expect(INACTIVE.inactive).toBe(true)
        expect(menuLabels(INACTIVE, true)).toEqual([
            'Edit',
            'Stock in this bin',
            'Make active',
            'Delete',
        ])
    })

    it.each([
        ['an active', ACTIVE],
        ['an inactive', INACTIVE],
    ])('gives a reader only Stock in this bin on %s bin', (_label, bin) => {
        // Stock in this bin only reads (spec §3.7 marks no "(writers)"; §3.9 shares the
        // report with every Books reader), so a reader keeps it and no write item.
        expect(menuLabels(bin, false)).toEqual(['Stock in this bin'])
    })
})

// Spec §3.7 "Stock in this bin (opens the report of §3.9 with this bin picked)": the
// report's Bin param is a multi-pick, so the bin goes in as a list of one.
describe('stockInBinParams', () => {
    it("picks the bin in the Stock by Bin report's Bin param, as a list", () => {
        expect(STOCK_BY_BIN_BINS_PARAM).toBe('bins')
        expect(stockInBinParams(ACTIVE.id)).toEqual({ [STOCK_BY_BIN_BINS_PARAM]: [ACTIVE.id] })
    })
})

// The names a transfer line reads: its two bins (by materialize(), undefined for No bin)
// and the user who made it.
function namesOf(transfer: (typeof BIN_TRANSFERS)[number]) {
    const side = (id: string) => {
        if (id === NO_BIN) return undefined
        const bin = binOf(id)
        return { name: bin.name, inactive: bin.inactive }
    }
    return {
        from: side(transfer.from_bin),
        to: side(transfer.to_bin),
        user: INVENTORY_USER_NAMES[transfer.created_by] ?? '',
    }
}

// The day of a move is the reader's local day, as every Books stamp (entry-display.ts
// formatDateTime). Each case sets the zone, so the result does not hang on the machine's.
describe('transferText', () => {
    const [latest, earlier] = BIN_TRANSFERS
    if (!latest || !earlier) throw new Error('the fixture has two bin transfers')
    const zone = process.env.TZ

    beforeEach(() => {
        process.env.TZ = 'America/Los_Angeles'
    })

    afterEach(() => {
        if (zone === undefined) delete process.env.TZ
        else process.env.TZ = zone
    })

    it('reads "<day> · <quantity> from <bin> to <bin> · <user>"', () => {
        expect(transferText(latest, namesOf(latest))).toBe(
            'Nov 3 · 4 from Aisle 3, shelf B to Front counter · Ana Ruiz'
        )
    })

    it('names an empty side "No bin"', () => {
        expect(earlier.from_bin).toBe(NO_BIN)
        expect(transferText(earlier, namesOf(earlier))).toBe(
            'Sep 4 · 12 from No bin to Aisle 3, shelf B · Omar Bell'
        )
    })

    it('marks an inactive bin " (inactive)"', () => {
        const names = namesOf(latest)
        const inactiveTo = { ...names, to: { name: INACTIVE.name, inactive: true } }
        expect(transferText(latest, inactiveTo)).toBe(
            'Nov 3 · 4 from Aisle 3, shelf B to Back room (inactive) · Ana Ruiz'
        )
        const inactiveFrom = {
            ...names,
            from: { name: ACTIVE.name, inactive: true },
        }
        expect(transferText(latest, inactiveFrom)).toBe(
            'Nov 3 · 4 from Aisle 3, shelf B (inactive) to Front counter · Ana Ruiz'
        )
    })

    it('writes a fraction of a quantity with its decimals', () => {
        expect(transferText({ ...latest, quantity: 2.5 }, namesOf(latest))).toBe(
            'Nov 3 · 2.5 from Aisle 3, shelf B to Front counter · Ana Ruiz'
        )
    })

    // Each stamp is on the next UTC day, or the day before it, of the reader's local day.
    it.each([
        ['America/Los_Angeles', '2026-11-28 01:00:00.000Z', 'Nov 27'],
        ['Asia/Tokyo', '2026-11-27 16:00:00.000Z', 'Nov 28'],
    ])('dates a stored move by the local day of created (%s)', (tz, created, day) => {
        process.env.TZ = tz
        // The zone change reaches Date in this worker (else the case proves nothing).
        expect(new Date(created.replace(' ', 'T')).toLocaleDateString('en-US')).toBe(
            `11/${day.slice(4)}/2026`
        )
        expect(transferText({ ...latest, created }, namesOf(latest))).toBe(
            `${day} · 4 from Aisle 3, shelf B to Front counter · Ana Ruiz`
        )
    })

    // A move the server has not stored yet: pbtsdb shows the optimistic row before the
    // server's autodate stamps `created`, so the line takes the reader's local day of `now`.
    const pending = { quantity: latest.quantity }

    it.each([
        ['America/Los_Angeles', '2026-11-28T01:00:00.000Z', 'Nov 27'],
        ['Asia/Tokyo', '2026-11-27T16:00:00.000Z', 'Nov 28'],
    ])('dates an unstored move by the local day of now (%s)', (tz, now, day) => {
        process.env.TZ = tz
        expect(transferText(pending, namesOf(latest), new Date(now))).toBe(
            `${day} · 4 from Aisle 3, shelf B to Front counter · Ana Ruiz`
        )
    })

    it('keeps the stored day of a stored move, whatever now is', () => {
        expect(transferText(latest, namesOf(latest), new Date('2026-11-27T12:00:00.000Z'))).toBe(
            'Nov 3 · 4 from Aisle 3, shelf B to Front counter · Ana Ruiz'
        )
    })
})

describe('the bin table', () => {
    // Name 160 + Note 160 + Status 96 + row menu 44 + padding 24 (spec §3.7).
    it('has a 484 px minimum, the sum of its columns and the padding', () => {
        expect(BIN_TABLE_MIN_WIDTH).toBe(484)
        const least = Object.values(BIN_COLUMNS).reduce<number>((sum, column) => {
            const style = column as { minWidth?: number; width?: number }
            return sum + (style.minWidth ?? style.width ?? 0)
        }, 0)
        expect(least + 24).toBe(BIN_TABLE_MIN_WIDTH)
    })
})

// What the bin dialog draws (spec §3.7): useBinDialog returns this state and BinDialog draws
// by it. The failed load is not an e2e step (pbtsdb serves the row press's read from the
// store), so these cases are its cover.
describe('binDialogState', () => {
    it('gives the form for a new bin, with no read of a record', () => {
        expect(
            binDialogState({ mode: 'new', isLoading: false, isError: false, record: undefined })
        ).toBe('form')
    })

    it('waits while the edited bin loads', () => {
        expect(
            binDialogState({ mode: 'edit', isLoading: true, isError: false, record: undefined })
        ).toBe('loading')
    })

    it('gives the load error (DialogLoadError with Retry, no Save) on a failed load', () => {
        expect(
            binDialogState({ mode: 'edit', isLoading: false, isError: true, record: undefined })
        ).toBe('load-error')
    })

    it('is gone when the load ends with no row (a bin deleted elsewhere closes the dialog)', () => {
        expect(
            binDialogState({ mode: 'edit', isLoading: false, isError: false, record: undefined })
        ).toBe('gone')
    })

    it('gives the form when the edited bin is there', () => {
        expect(
            binDialogState({ mode: 'edit', isLoading: false, isError: false, record: ACTIVE })
        ).toBe('form')
    })
})
