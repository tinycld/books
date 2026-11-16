// Synthetic data of report exports (the Export menu and the "Email report" dialog of
// core's report view) for the helix reference route and the e2e spec's constants.
//
// The feature stores nothing: no collection, no field, no migration (spec, Data). So
// there is no row to seed, and `seed.ts` needs no wiring: the seeded ledger already
// fills the shipped Profit and Loss report that the reference and the e2e spec export.
// The run result is typed against core's report contract, so tsc checks every field.
//
// The request and answer shapes below mirror the spec's Data section. Checkpoint 0 (the
// core checkpoint) writes them in core `reports/lib/export-client.ts`; that checkpoint
// must replace these local interfaces with core's types.
import type { RunResult } from '@tinycld/core/reports/lib/types'
import {
    PROFIT_AND_LOSS_FROM,
    PROFIT_AND_LOSS_HEADING,
    PROFIT_AND_LOSS_PARAMS,
    PROFIT_AND_LOSS_TITLE,
    PROFIT_AND_LOSS_TODAY,
    profitAndLossResult,
} from './profit-and-loss-fixture'

export type ExportFormat = 'pdf' | 'xlsx' | 'csv'

/** `POST /api/reports/export`: the run endpoint's params and options, and the format. */
export interface ExportRequest {
    reportId: string
    params: Record<string, unknown>
    options: Record<string, unknown>
    format: ExportFormat
    hour12: boolean
}

/** `POST /api/reports/email`: the export body and the message. */
export interface EmailRequest extends ExportRequest {
    to: string[]
    cc: string[]
    subject: string
    message: string
}

/** The answer of `POST /api/reports/email`. */
export interface EmailAnswer {
    sent: true
    recipients: number
}

/** The answer of `GET /api/reports/email-status`. */
export interface EmailStatus {
    canSend: boolean
}

/** What the dialog's form holds: the addresses as typed, before they are split. */
export interface EmailFormValues {
    to: string
    cc: string
    subject: string
    message: string
    format: ExportFormat
}

// ── The report on screen ──

export const EXPORT_REPORT_TITLE = PROFIT_AND_LOSS_TITLE
export const EXPORT_REPORT_HEADING = PROFIT_AND_LOSS_HEADING
export const EXPORT_REPORT_PARAMS = PROFIT_AND_LOSS_PARAMS
export const EXPORT_REPORT_FROM = PROFIT_AND_LOSS_FROM
export const EXPORT_REPORT_TO = PROFIT_AND_LOSS_TODAY
/** The period as core's `periodWords` writes it for the dates above. */
export const EXPORT_PERIOD_WORDS = 'January 1 – November 9, 2026'
/** A title long enough to end in "…" beside the toolbar's seven buttons. */
export const EXPORT_LONG_REPORT_TITLE =
    'Profit and Loss by Month for Harbor Lane Design LLC and its two studio locations combined on the accrual basis'

export const EXPORT_RESULT: RunResult = profitAndLossResult()
/** A run that returns no row: the file then holds the headings and the empty text. */
export const EXPORT_EMPTY_RESULT: RunResult = { ...EXPORT_RESULT, rows: [] }

// ── The menu ──

export const EXPORT_BUTTON_LABEL = 'Export'
export const EXPORT_PREPARING_LABEL = 'Preparing…'
export const EMAIL_ITEM_LABEL = 'Email report…'
export const EMAIL_OFF_NOTE = 'Email sending is not set up'

/** The formats in menu order, which is also the order of "Attach as" (PDF first). */
export const EXPORT_FORMATS = [
    {
        value: 'pdf',
        label: 'PDF',
        menuLabel: 'Download PDF',
        extension: 'pdf',
        mimeType: 'application/pdf',
    },
    {
        value: 'xlsx',
        label: 'Excel',
        menuLabel: 'Download Excel',
        extension: 'xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    {
        value: 'csv',
        label: 'CSV',
        menuLabel: 'Download CSV',
        extension: 'csv',
        mimeType: 'text/csv; charset=utf-8',
    },
] as const satisfies readonly {
    value: ExportFormat
    label: string
    menuLabel: string
    extension: string
    mimeType: string
}[]

// ── File names (the server makes them; one Go function, `exportFileName`) ──

/** `<report name>-<date part>`, with no extension. */
export const EXPORT_FILE_STEM = `profit-and-loss-${EXPORT_REPORT_FROM}-to-${EXPORT_REPORT_TO}`

export const exportFileName = (format: ExportFormat, stem = EXPORT_FILE_STEM) =>
    `${stem}.${EXPORT_FORMATS.find(f => f.value === format)?.extension ?? format}`

// Each case of the naming rule: a period, an as-of day, no date param (the reader's
// day), a title in another script, and a title cut to 80 characters.
export const EXPORT_FILE_NAME_CASES = [
    {
        title: 'Profit and Loss',
        date: { kind: 'period', from: '2026-01-01', to: '2026-11-09' },
        stem: 'profit-and-loss-2026-01-01-to-2026-11-09',
    },
    {
        title: 'Balance Sheet',
        date: { kind: 'asOf', day: '2026-11-09' },
        stem: 'balance-sheet-as-of-2026-11-09',
    },
    {
        title: 'Chart of Accounts',
        date: { kind: 'none', today: '2026-11-09' },
        stem: 'chart-of-accounts-2026-11-09',
    },
    {
        title: 'Отчёт о прибылях',
        date: { kind: 'period', from: '2026-01-01', to: '2026-11-09' },
        stem: 'отчёт-о-прибылях-2026-01-01-to-2026-11-09',
    },
    {
        title: EXPORT_LONG_REPORT_TITLE,
        date: { kind: 'period', from: '2026-01-01', to: '2026-11-09' },
        stem: 'profit-and-loss-by-month-for-harbor-lane-design-llc-and-its-two-studio-locations-2026-01-01-to-2026-11-09',
    },
] as const

export const EXPORT_LONG_FILE_STEM = EXPORT_FILE_NAME_CASES[4].stem

// Text cells that a spreadsheet would run as a formula: the CSV writes each with a
// leading apostrophe, and the Excel file stores each as text.
export const EXPORT_FORMULA_LIKE_TEXT = [
    '=SUM(A1:A9) Consulting',
    '+1 Referral income',
    '-Adjustments to prior year',
    '@home office',
]

// ── Limits (spec, Limits and Email) ──

export const EXPORT_LIMITS = {
    pdfRows: 5000,
    fileRows: 50000,
    seconds: 60,
    addresses: 10,
    emailBytes: 10 * 1024 * 1024,
    emailsPerHour: 20,
    subjectLength: 200,
    messageLength: 5000,
    fileNameLength: 80,
}

/** The server's refusals, word for word as the spec gives them. */
export const EXPORT_REFUSALS = {
    pdfRows: 'This report has more than 5,000 rows. Narrow the period or download CSV.',
    fileRows: 'This report has more than 50,000 rows. Narrow the period.',
    timeout: 'The report took too long to export.',
    emailTooLarge: 'The file is too large to email. Download it instead.',
    emailsPerHour: 'You have sent 20 report emails in the last hour. Try again later.',
    noAccess: 'You no longer have access to this report',
}

export const EXPORT_FAILED_TOAST_TITLE = 'Could not create the file'

// ── The email dialog ──

export const EMAIL_DIALOG_TITLE = 'Email report'
export const EMAIL_SEND_LABEL = 'Send'
export const EMAIL_SENDING_LABEL = 'Sending…'
export const EMAIL_SENDER_NAME = 'Marisol Okonkwo-Bell'
export const EMAIL_ORG_NAME = 'Harbor Lane Design LLC'
/** The From display name: "<sender's name> via <organization name>". */
export const EMAIL_FROM_NAME = `${EMAIL_SENDER_NAME} via ${EMAIL_ORG_NAME}`

export const emailSubject = (title: string, periodWords: string) => `${title} — ${periodWords}`

export const emailMessage = (input: {
    title: string
    heading: string
    periodWords: string
    senderName: string
}) =>
    `Hello,\n\nAttached is the ${input.title} report of ${input.heading}, ${input.periodWords}.\n\n${input.senderName}`

/** The dialog as it opens: everything filled but the addresses (spark 3). */
export const EMAIL_DEFAULTS: EmailFormValues = {
    to: '',
    cc: '',
    subject: emailSubject(EXPORT_REPORT_TITLE, EXPORT_PERIOD_WORDS),
    message: emailMessage({
        title: EXPORT_REPORT_TITLE,
        heading: EXPORT_REPORT_HEADING,
        periodWords: EXPORT_PERIOD_WORDS,
        senderName: EMAIL_SENDER_NAME,
    }),
    format: 'pdf',
}

/** A usual send: three addresses, separated by a comma, a semicolon and a space. */
export const EMAIL_FILLED: EmailFormValues = {
    ...EMAIL_DEFAULTS,
    to: 'ruth.okafor@harborlane.example, sam@ledgerworks.example; priya.nair@northpier.example',
    cc: 'books@harborlane.example',
}
export const EMAIL_FILLED_RECIPIENTS = {
    to: [
        'ruth.okafor@harborlane.example',
        'sam@ledgerworks.example',
        'priya.nair@northpier.example',
    ],
    cc: ['books@harborlane.example'],
}

export const sentToastTitle = (to: readonly string[], cc: readonly string[] = []) => {
    const others = to.length + cc.length - 1
    if (others <= 0) return `Report sent to ${to[0]}`
    return `Report sent to ${to[0]} and ${others} others`
}

// Values that fail the form: an address with no domain ending, one with no domain, a
// Cc that is not an address, and no subject.
export const EMAIL_INVALID: EmailFormValues = {
    ...EMAIL_DEFAULTS,
    to: 'ruth.okafor@harborlane, sam@',
    cc: 'books at harborlane.example',
    subject: '',
}
/** Reference copy of the inline errors; the form's zod schema owns the final words. */
export const EMAIL_FIELD_ERRORS = {
    to: '"ruth.okafor@harborlane" is not a valid email address',
    cc: '"books" is not a valid email address',
    subject: 'Enter a subject',
    toRequired: 'Enter at least one address',
    tooMany: 'To and Cc together hold at most 10 addresses',
}

// The longest form the limits allow: ten addresses, a subject of 200 characters and a
// message of several paragraphs, sent as Excel. The server refuses it for the hourly limit,
// and the dialog keeps every value.
const LONG_TO = [
    'ruth.okafor@harborlane.example',
    'sam@ledgerworks.example',
    'priya.nair@northpier.example',
    'accounts.payable.shared-mailbox@northpier-holdings.example',
    'tomasz.wisniewski@wisniewski-and-daughters-cpa.example',
    'lena@ledgerworks.example',
    'board@harborlane.example',
]
const LONG_CC = [
    'books@harborlane.example',
    'audit-2026@wisniewski-and-daughters-cpa.example',
    'marisol@harborlane.example',
]
export const EMAIL_LONG: EmailFormValues = {
    to: LONG_TO.join(', '),
    cc: LONG_CC.join('; '),
    subject:
        'Profit and Loss — January 1 – November 9, 2026 — for the November board meeting, with the figures after the insurance reclass and before the year-end accruals that Tomasz will send next week (draft 3)',
    message: [
        'Hello all,',
        'Attached is the Profit and Loss report of Harbor Lane Design LLC, January 1 – November 9, 2026. It is the accrual-basis statement with every account that has a balance in the period.',
        'Two notes before the meeting. Insurance now holds the three policy payments that were in Office supplies until October. Repairs and maintenance nets to zero because the vendor refunded the March charge.',
        'Tomasz, the year-end accruals are not in these figures. Please send your entries by the 20th so that the December statement has them.',
        'Reply to this message with questions; it comes to me directly.',
        EMAIL_SENDER_NAME,
    ].join('\n\n'),
    format: 'xlsx',
}
export const EMAIL_LONG_REFUSAL = EXPORT_REFUSALS.emailsPerHour

// ── Audit rows (core `audit.Log`; shown in Settings → Audit log) ──

export const EXPORT_AUDIT_ROWS = [
    {
        action: 'report.export',
        title: EXPORT_REPORT_TITLE,
        format: 'pdf',
        rows: EXPORT_RESULT.rows.length,
    },
    {
        action: 'report.email',
        title: EXPORT_REPORT_TITLE,
        format: 'pdf',
        rows: EXPORT_RESULT.rows.length,
        recipients: [...EMAIL_FILLED_RECIPIENTS.to, ...EMAIL_FILLED_RECIPIENTS.cc],
    },
] as const satisfies readonly {
    action: 'report.export' | 'report.email'
    title: string
    format: ExportFormat
    rows: number
    recipients?: readonly string[]
}[]
