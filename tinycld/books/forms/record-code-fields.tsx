import { like, queryOnce } from '@tanstack/db'
import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import { log } from '@tinycld/core/lib/logger'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { useRef } from 'react'
import { useFormContext } from 'react-hook-form'
import { ContactInput } from '../components/forms/ContactInput'
import {
    type CodedCollectionName,
    codeStem,
    RECORD_CODE_MAX,
    type RecordCodeKind,
    suggestedBase,
    suggestedCode,
} from '../lib/record-code'

// The name and Code built-ins of the customer, vendor and product hosts (hosts.ts). As
// boards' New board dialog does, the name's own change handler fills the code; no
// effect syncs the two fields. The core cell draws each one's label and error.

interface CodeHost {
    kind: RecordCodeKind
    collection: CodedCollectionName
    // The migration's max for the name column (2100000003, 2100000004, 2100000005).
    nameMaxLength: number
}

const CUSTOMER: CodeHost = { kind: 'customer', collection: 'books_customers', nameMaxLength: 200 }
const VENDOR: CodeHost = { kind: 'vendor', collection: 'books_vendors', nameMaxLength: 200 }
const PRODUCT: CodeHost = { kind: 'product', collection: 'books_products', nameMaxLength: 200 }

const toUpper = (text: string) => text.toUpperCase()

// The codes that start with the stem of a name's base: what its suggestion skips. Read
// once per name change, from the store and the server.
function useTakenCodesReader(host: CodeHost) {
    const [collection] = useStore(host.collection)
    return async (name: string) => {
        const stem = codeStem(suggestedBase(name, host.kind))
        const rows = await queryOnce({
            query: q =>
                q
                    .from({ row: collection })
                    .where(({ row }) => like(row.code, `${stem}%`))
                    .select(({ row }) => ({ code: row.code })),
        })
        return new Set(rows.map(row => row.code))
    }
}

// The name field. On a new record each change also sets the Code field to the code the
// name suggests, until the user edits the code (its field is dirty and not empty). The
// lookup is async; `latest` lets only the newest change write the code.
function NameField({ host, ...props }: BuiltinFieldProps & { host: CodeHost }) {
    const { getFieldState, getValues, setValue } = useFormContext()
    const readTaken = useTakenCodesReader(host)
    const latest = useRef(0)
    const isUserCode = () => getFieldState('code').isDirty && getValues('code') !== ''
    const change = async (value: unknown) => {
        props.onChange(value)
        if (props.mode !== 'create' || isUserCode()) return
        const name = typeof value === 'string' ? value : ''
        latest.current += 1
        const call = latest.current
        let taken: Set<string>
        try {
            taken = await readTaken(name)
        } catch (error) {
            // The code stays as it is; an empty code is made by the server on save.
            log.warn('books.record-code', 'could not read the taken codes', { error })
            return
        }
        if (call !== latest.current || isUserCode()) return
        setValue('code', suggestedCode(name, host.kind, taken), { shouldDirty: false })
    }
    return (
        <ContactInput
            {...props}
            onChange={change}
            keyboardType="default"
            autoComplete="off"
            autoCapitalize="words"
            maxLength={host.nameMaxLength}
        />
    )
}

function CodeField(props: BuiltinFieldProps) {
    return (
        <ContactInput
            {...props}
            keyboardType="default"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={RECORD_CODE_MAX}
            transform={toUpper}
        />
    )
}

export function CustomerNameField(props: BuiltinFieldProps) {
    return <NameField {...props} host={CUSTOMER} />
}

export function VendorNameField(props: BuiltinFieldProps) {
    return <NameField {...props} host={VENDOR} />
}

export function ProductNameField(props: BuiltinFieldProps) {
    return <NameField {...props} host={PRODUCT} />
}

export const CustomerCodeField = CodeField
export const VendorCodeField = CodeField
export const ProductCodeField = CodeField
