import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { UploadError } from '@tinycld/core/file-viewer/upload-file'
import { describe, expect, it } from 'vitest'
import { BANK_FILES } from '../tinycld/books/lib/bank-connection-fixture'
import {
    accountMaskText,
    BANK_ACCOUNT_TYPES,
    BANK_FILE_ERRORS,
    BANK_FILE_EXTENSIONS,
    BANK_NAME_MAX,
    bankDetailsSchema,
    bankDetailsText,
    bankFileFormatLabel,
    bankFileIssue,
    bankFileStatusLabel,
    CONNECT_EMPTY_TEXT,
    CONNECTION_ERRORS,
    cardBalance,
    connectEmptyReason,
    connectionLabel,
    connectionSchema,
    disconnectBody,
    droppedFilesIssue,
    fileSizeText,
    isBankAccount,
    isBankFileRow,
    isConnectable,
    MAX_BANK_FILE_BYTES,
    selectedConnectionId,
    UPLOAD_TRANSPORT_TEXT,
    uploadErrorText,
    uploadedOnText,
    uploadedText,
    waitingText,
} from '../tinycld/books/lib/bank-connections'
import { formatMoney } from '../tinycld/books/lib/money'
import type { BooksBankFiles } from '../tinycld/books/types'

const bankingGo = readFileSync(join(__dirname, '..', 'server', 'banking.go'), 'utf8')

function goCapture(pattern: RegExp): string {
    const match = bankingGo.match(pattern)
    if (!match) throw new Error(`server/banking.go has no match for ${pattern}`)
    return match[1]
}

function goStringList(name: string): string[] {
    const literal = goCapture(new RegExp(`${name} = \\[\\]string\\{([^}]*)\\}`))
    return [...literal.matchAll(/"([^"]*)"/g)].map(match => match[1])
}

function goMessage(name: string): string {
    return goCapture(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`))
}

type Parsable = {
    safeParse(values: unknown):
        | { success: true }
        | {
              success: false
              error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }
          }
}

// A schema's issues grouped by field path, so a test names every message a field holds.
function issuesByField(schema: Parsable, values: unknown): Record<string, string[]> {
    const result = schema.safeParse(values)
    const grouped: Record<string, string[]> = {}
    if (result.success) return grouped
    for (const issue of result.error.issues) {
        const path = issue.path.map(String).join('.')
        grouped[path] = [...(grouped[path] ?? []), issue.message]
    }
    return grouped
}

const FILLED = {
    account: 'acct_savings',
    institution: 'First Community Bank',
    account_mask: '4821',
}

describe('banking drift with server/banking.go', () => {
    it('keeps the account types, extensions, size limit and file messages equal to Go', () => {
        expect(goStringList('bankAccountTypes')).toEqual([...BANK_ACCOUNT_TYPES])
        expect(goStringList('bankFileExtensions')).toEqual([...BANK_FILE_EXTENSIONS])
        // maxBankFileBytes is declared inside a Go const block, so the match has no `const` prefix.
        expect(Number(goCapture(/\bmaxBankFileBytes\s*=\s*(\d+)/))).toBe(MAX_BANK_FILE_BYTES)
        expect(goMessage('msgBankFileType')).toBe(`${BANK_FILE_ERRORS.type}.`)
        expect(goMessage('msgBankFileEmpty')).toBe(`${BANK_FILE_ERRORS.empty}.`)
        expect(goMessage('msgBankFileTooBig')).toBe(`${BANK_FILE_ERRORS.tooBig}.`)
    })

    it('has the limits the spec names', () => {
        expect([...BANK_ACCOUNT_TYPES]).toEqual(['bank', 'credit_card'])
        expect([...BANK_FILE_EXTENSIONS]).toEqual(['.csv', '.ofx', '.qfx', '.qbo'])
        expect(MAX_BANK_FILE_BYTES).toBe(5_242_880)
        expect(BANK_NAME_MAX).toBe(100)
    })
})

describe('isBankAccount', () => {
    it('is true for bank and credit card accounts only', () => {
        expect(isBankAccount({ type: 'bank' })).toBe(true)
        expect(isBankAccount({ type: 'credit_card' })).toBe(true)
        expect(isBankAccount({ type: 'other_current_asset' })).toBe(false)
        expect(isBankAccount({ type: 'expense' })).toBe(false)
    })
})

describe('connectionSchema', () => {
    it('refuses an empty account with one issue on account', () => {
        expect(
            issuesByField(connectionSchema, { account: '', institution: '', account_mask: '' })
        ).toEqual({
            account: ['Choose the account to connect'],
        })
        expect(CONNECTION_ERRORS.accountEmpty).toBe('Choose the account to connect')
    })

    it('takes a bank name of 100 characters and refuses 101', () => {
        expect(
            issuesByField(connectionSchema, { ...FILLED, institution: 'x'.repeat(100) })
        ).toEqual({})
        expect(
            issuesByField(connectionSchema, { ...FILLED, institution: 'x'.repeat(101) })
        ).toEqual({
            institution: ['A bank name can have at most 100 characters'],
        })
        expect(CONNECTION_ERRORS.bankNameTooLong).toBe(
            'A bank name can have at most 100 characters'
        )
    })

    it('counts bank name characters as code points, as PocketBase does', () => {
        expect(
            issuesByField(connectionSchema, { ...FILLED, institution: '\u{1F3E6}'.repeat(100) })
        ).toEqual({})
        expect(
            issuesByField(connectionSchema, { ...FILLED, institution: '\u{1F3E6}'.repeat(101) })
        ).toEqual({ institution: [CONNECTION_ERRORS.bankNameTooLong] })
    })

    it('takes a blank or four-digit mask and refuses any other', () => {
        expect(issuesByField(connectionSchema, { ...FILLED, account_mask: '' })).toEqual({})
        expect(issuesByField(connectionSchema, { ...FILLED, account_mask: '4821' })).toEqual({})
        for (const mask of ['55', '12345', '12a4']) {
            expect(
                issuesByField(connectionSchema, { ...FILLED, account_mask: mask }),
                mask
            ).toEqual({
                account_mask: ['Enter the last 4 digits, or leave this blank'],
            })
        }
        expect(CONNECTION_ERRORS.maskInvalid).toBe('Enter the last 4 digits, or leave this blank')
    })
})

describe('bankDetailsSchema', () => {
    it('has no account field', () => {
        const result = bankDetailsSchema.safeParse({
            account: '',
            institution: '',
            account_mask: '',
        })
        expect(result.success).toBe(true)
        expect(result.data).toEqual({ institution: '', account_mask: '' })
    })

    it('keeps the bank name and mask rules', () => {
        expect(
            issuesByField(bankDetailsSchema, { institution: 'x'.repeat(100), account_mask: '4821' })
        ).toEqual({})
        expect(
            issuesByField(bankDetailsSchema, { institution: 'x'.repeat(101), account_mask: '12a4' })
        ).toEqual({
            institution: ['A bank name can have at most 100 characters'],
            account_mask: ['Enter the last 4 digits, or leave this blank'],
        })
    })
})

describe('bankFileIssue', () => {
    it('takes the four statement extensions in any case', () => {
        for (const name of ['oct.csv', 'a.OFX', 'b.QfX', 'c.qbo']) {
            expect(bankFileIssue({ name, size: 10 }), name).toBeNull()
        }
    })

    it('reports the type first, then empty, then too big', () => {
        expect(bankFileIssue({ name: 'a.pdf', size: 10 })).toBe(
            'Choose a CSV, OFX, QFX or QBO file'
        )
        expect(bankFileIssue({ name: 'a.txt', size: 0 })).toBe('Choose a CSV, OFX, QFX or QBO file')
        expect(bankFileIssue({ name: 'a.csv', size: 0 })).toBe('This file is empty')
        expect(bankFileIssue({ name: 'a.csv', size: 5_242_880 })).toBeNull()
        expect(bankFileIssue({ name: 'a.csv', size: 5_242_881 })).toBe(
            'Choose a file of 5 MB or less'
        )
    })

    it('refuses a drop of two or more files', () => {
        expect(droppedFilesIssue(1)).toBeNull()
        expect(droppedFilesIssue(2)).toBe('Drop one file at a time')
        expect(droppedFilesIssue(3)).toBe('Drop one file at a time')
        expect(BANK_FILE_ERRORS.several).toBe('Drop one file at a time')
    })
})

describe('banking texts', () => {
    it('writes file sizes in whole KB below 1 MiB and one-decimal MB above', () => {
        expect(fileSizeText(49_152)).toBe('48 KB')
        expect(fileSizeText(1_258_291)).toBe('1.2 MB')
        expect(fileSizeText(300)).toBe('1 KB')
        expect(fileSizeText(5_242_880)).toBe('5.0 MB')
    })

    it('labels file formats and statuses', () => {
        expect(bankFileFormatLabel('csv')).toBe('CSV')
        expect(bankFileFormatLabel('ofx')).toBe('OFX')
        // A row read before the server stamps its format.
        expect(bankFileFormatLabel('' as BooksBankFiles['format'])).toBe('')
        expect(bankFileStatusLabel('uploaded', 0)).toBe('Waiting to import')
        expect(bankFileStatusLabel('imported', 36)).toBe('Imported: 36 transactions')
        expect(bankFileStatusLabel('imported', 1)).toBe('Imported: 1 transaction')
        expect(bankFileStatusLabel('imported', 0)).toBe('Imported: no new transactions')
        expect(bankFileStatusLabel('failed', 0)).toBe('Import failed')
    })

    it('writes the bank details line', () => {
        expect(accountMaskText('4821')).toBe('••4821')
        expect(accountMaskText('')).toBe('')
        expect(bankDetailsText({ institution: 'First Community Bank', accountMask: '4821' })).toBe(
            'First Community Bank ••4821'
        )
        expect(bankDetailsText({ institution: 'First Community Bank', accountMask: '' })).toBe(
            'First Community Bank'
        )
        expect(bankDetailsText({ institution: '', accountMask: '4821' })).toBe('••4821')
        expect(bankDetailsText({ institution: '', accountMask: '' })).toBe('')
    })

    it('labels a connection by account number and name', () => {
        expect(connectionLabel('1000', 'Business Checking')).toBe('1000 Business Checking')
        expect(connectionLabel('', 'Bank e2e 1')).toBe('Bank e2e 1')
    })

    it('counts the files waiting', () => {
        expect(waitingText(0)).toBe('No files waiting')
        expect(waitingText(1)).toBe('1 file waiting')
        expect(waitingText(4)).toBe('4 files waiting')
    })

    it('writes the upload day and who uploaded', () => {
        expect(uploadedText('2026-11-03 16:20:00.000Z', 'Ana Ruiz')).toBe(
            'Uploaded Nov 3, 2026 by Ana Ruiz'
        )
        expect(uploadedOnText('2026-11-03 16:20:00.000Z', 'Ana Ruiz')).toBe(
            'Nov 3, 2026 by Ana Ruiz'
        )
        expect(uploadedOnText('2026-11-03 16:20:00.000Z', '')).toBe('Nov 3, 2026')
    })

    it('says what a disconnect deletes', () => {
        expect(disconnectBody(0)).toBe(
            'The account, its balance and its journal entries stay in Books.'
        )
        expect(disconnectBody(1)).toBe(
            'Its 1 file waiting to import is deleted. The account, its balance and its journal entries stay in Books.'
        )
        expect(disconnectBody(2)).toBe(
            'Its 2 files waiting to import are deleted. The account, its balance and its journal entries stay in Books.'
        )
    })
})

describe('uploadErrorText', () => {
    const transport = 'The file could not be uploaded. Check your connection and try again.'

    it('shows a server refusal as written', () => {
        const refusal = 'oct.csv was already uploaded to 1000 Business Checking on Nov 3, 2026.'
        expect(uploadErrorText(new UploadError(refusal, 400))).toEqual({
            text: refusal,
            isTransport: false,
        })
    })

    it('shows the transport text for a server fault, an abort, a network failure or a non-refusal', () => {
        const asTransport = { text: transport, isTransport: true }
        expect(UPLOAD_TRANSPORT_TEXT).toBe(transport)
        expect(uploadErrorText(new UploadError('Something went wrong.', 500))).toEqual(asTransport)
        expect(uploadErrorText(new UploadError('Upload failed (413)', 413))).toEqual(asTransport)
        expect(uploadErrorText(new DOMException('Aborted', 'AbortError'))).toEqual(asTransport)
        expect(uploadErrorText(new TypeError('Network request failed'))).toEqual(asTransport)
        expect(uploadErrorText(new Error('Unable to read the file'))).toEqual(asTransport)
        expect(uploadErrorText('x')).toEqual(asTransport)
    })
})

describe('connectEmptyReason and isConnectable', () => {
    const checking = { id: 'acct_checking', type: 'bank', inactive: false }
    const savings = { id: 'acct_savings', type: 'bank', inactive: false }
    const card = { id: 'acct_card', type: 'credit_card', inactive: false }
    const rent = { id: 'acct_rent', type: 'expense', inactive: false }
    const closedBank = { id: 'acct_closed', type: 'bank', inactive: true }

    it('names why nothing can be connected', () => {
        expect(connectEmptyReason([rent, closedBank], new Set())).toBe('none')
        expect(
            connectEmptyReason(
                [checking, savings, card, rent, closedBank],
                new Set([checking.id, savings.id, card.id])
            )
        ).toBe('allConnected')
        expect(
            connectEmptyReason([checking, savings, card, rent], new Set([checking.id, card.id]))
        ).toBeNull()
        expect(CONNECT_EMPTY_TEXT.allConnected).toBe(
            'Every bank and credit card account is already connected.'
        )
        expect(CONNECT_EMPTY_TEXT.none).toBe(
            'Your chart of accounts has no bank or credit card account.'
        )
    })

    it('offers only an active, unconnected bank or credit card account', () => {
        const connected = new Set([checking.id])
        expect(isConnectable(savings, connected)).toBe(true)
        expect(isConnectable(card, connected)).toBe(true)
        expect(isConnectable(checking, connected)).toBe(false)
        expect(isConnectable(closedBank, connected)).toBe(false)
        expect(isConnectable(rent, connected)).toBe(false)
    })
})

describe('cardBalance', () => {
    it('shows the account own balance, normal side positive', () => {
        expect(
            cardBalance({ accountType: 'bank', debitTotal: 3_000_000, creditTotal: 581_945 }, 'USD')
        ).toEqual({ text: '$24,180.55', isNegative: false })
        expect(
            cardBalance(
                { accountType: 'credit_card', debitTotal: 171_000, creditTotal: 512_017 },
                'USD'
            )
        ).toEqual({ text: '$3,410.17', isNegative: false })
    })

    it('marks a balance below zero as negative', () => {
        expect(
            cardBalance({ accountType: 'bank', debitTotal: 100, creditTotal: 600 }, 'USD')
        ).toEqual({
            text: formatMoney(-500, 'USD'),
            isNegative: true,
        })
    })
})

describe('selectedConnectionId', () => {
    const rows = [{ id: 'bankconncheckng' }, { id: 'bankconncard000' }]

    it('selects the param when a row has it, else the first row', () => {
        expect(selectedConnectionId(rows, 'bankconncard000')).toBe('bankconncard000')
        expect(selectedConnectionId(rows, 'bankconnunknown')).toBe('bankconncheckng')
        expect(selectedConnectionId(rows, undefined)).toBe('bankconncheckng')
        expect(selectedConnectionId([], 'bankconncard000')).toBe('')
    })
})

describe('isBankFileRow', () => {
    it('accepts a bank file row and refuses anything else', () => {
        expect(isBankFileRow(BANK_FILES[0])).toBe(true)
        expect(isBankFileRow(null)).toBe(false)
        expect(isBankFileRow({ id: 1 })).toBe(false)
        expect(isBankFileRow({})).toBe(false)
    })
})
