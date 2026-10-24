// Synthetic data for the settings helix reference route and, later, the seed.
// Typed against the generated record types so tsc checks every field.
import type { BooksCloseOverrides, BooksDocSequences, BooksSettings } from '../types'

const STAMP = '2026-10-01 00:00:00.000Z'

export type SettingsRow = BooksSettings

export const COMPANY_SETTINGS = {
    id: 'bookssettings01',
    close_date: '2026-09-30',
    fiscal_year_start_month: 1,
    currency: 'USD',
    business_name: 'Hartwell Supply Co.',
    ownership: 'corporation',
    setup_completed: true,
    tax_id: '12-3456789',
    address: '3540 E Broad St, Suite 210\nMansfield, TX 76063',
    phone: '+1 214 555 1234',
    email: 'books@hartwell.example',
    website: 'https://www.hartwell.example',
    created: STAMP,
    updated: STAMP,
} satisfies BooksSettings

export const LONG_COMPANY_SETTINGS = {
    ...COMPANY_SETTINGS,
    business_name:
        'Hartwell Regional Industrial Supply and Fastener Distribution Partners of North Texas, Incorporated',
    website: 'https://www.hartwell-regional-industrial-supply.example/about-us/accounting-contact',
} satisfies BooksSettings

// A fresh book: no close date, only the required name filled in.
export const EMPTY_SETTINGS = {
    ...COMPANY_SETTINGS,
    close_date: '',
    tax_id: '',
    address: '',
    phone: '',
    email: '',
    website: '',
} satisfies BooksSettings

export const SEQUENCES: BooksDocSequences[] = [
    {
        id: 'booksseq0000001',
        doc_type: 'journal',
        prefix: 'JE-',
        next_number: 1001,
        created: STAMP,
        updated: STAMP,
    },
]

export const NO_SEQUENCES: BooksDocSequences[] = []

export const MIN_OVERRIDE_REASON = 3

export interface OverrideRow extends BooksCloseOverrides {
    userName: string
    grantedByName: string
    status: 'active' | 'expired' | 'revoked'
    // Display line; the built screen formats expires_at in the viewer's zone.
    expiresLabel: string
}

export const OVERRIDES: OverrideRow[] = [
    {
        id: 'booksovr0000001',
        user: 'usermaya0000001',
        userName: 'Maya Ruiz',
        reason: 'Year-end adjustments',
        expires_at: '2026-11-03 17:00:00.000Z',
        expiresLabel: 'Expires Nov 3, 2026, 5:00 PM',
        granted_by: 'usernathan00001',
        grantedByName: 'Nathan Stitt',
        status: 'active',
        created: STAMP,
        updated: STAMP,
    },
    {
        id: 'booksovr0000002',
        user: 'userdana0000001',
        userName: 'Dana Whitfield',
        reason: 'Reclassify the September freight accruals after the carrier sent corrected invoices for the third quarter',
        expires_at: '2026-10-31 12:00:00.000Z',
        expiresLabel: 'Expires Oct 31, 2026, 12:00 PM',
        granted_by: 'usernathan00001',
        grantedByName: 'Nathan Stitt',
        status: 'active',
        created: STAMP,
        updated: STAMP,
    },
    {
        id: 'booksovr0000003',
        user: 'usermaya0000001',
        userName: 'Maya Ruiz',
        reason: 'Late vendor bill',
        expires_at: '2026-10-12 17:00:00.000Z',
        expiresLabel: 'Expired Oct 12, 2026',
        granted_by: 'userpriya000001',
        grantedByName: 'Priya Raman',
        status: 'expired',
        created: STAMP,
        updated: STAMP,
    },
    {
        id: 'booksovr0000004',
        user: 'userlee00000001',
        userName: 'Lee Kim',
        reason: 'Audit follow-up',
        expires_at: '2026-10-05 09:30:00.000Z',
        expiresLabel: 'Revoked Oct 5, 2026',
        granted_by: 'usernathan00001',
        grantedByName: 'Nathan Stitt',
        status: 'revoked',
        created: STAMP,
        updated: STAMP,
    },
]

// The signed-in person's own active override, for the read-only line.
export const OWN_OVERRIDE = OVERRIDES[0]

export type BooksLevelValue = 'none' | 'read_only' | 'bookkeeper' | 'admin'
export type OrgRole = 'owner' | 'admin' | 'member' | 'guest'

export interface AccessPerson {
    id: string
    name: string
    email: string
    orgRole: OrgRole
    level: BooksLevelValue
}

// The signed-in person: an org owner by default; the limited view signs in as
// a Books admin who holds no org role.
export const OWNER_VIEWER_ID = 'usernathan00001'
export const BOOKS_ADMIN_VIEWER_ID = 'userdana0000001'

export const ACCESS_PEOPLE: AccessPerson[] = [
    {
        id: 'usernathan00001',
        name: 'Nathan Stitt',
        email: 'nathan@hartwell.example',
        orgRole: 'owner',
        level: 'admin',
    },
    {
        id: 'userpriya000001',
        name: 'Priya Raman',
        email: 'priya@hartwell.example',
        orgRole: 'admin',
        level: 'admin',
    },
    {
        id: 'userdana0000001',
        name: 'Dana Whitfield',
        email: 'dana@hartwell.example',
        orgRole: 'member',
        level: 'admin',
    },
    {
        id: 'usermaya0000001',
        name: 'Maya Ruiz',
        email: 'maya@hartwell.example',
        orgRole: 'member',
        level: 'bookkeeper',
    },
    {
        id: 'userlee00000001',
        name: 'Lee Kim',
        email: 'lee@hartwell.example',
        orgRole: 'member',
        level: 'read_only',
    },
    {
        id: 'usertomas000001',
        name: 'Tomas Oyelaran-Featherstonehaugh',
        email: 'tomas.oyelaran-featherstonehaugh@hartwell-regional.example',
        orgRole: 'guest',
        level: 'none',
    },
]
