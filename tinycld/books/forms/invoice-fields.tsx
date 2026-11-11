import { eq, inArray, queryOnce } from '@tanstack/db'
import type { BuiltinFieldProps } from '@tinycld/core/lib/forms/host-ui'
import type { FormValues } from '@tinycld/core/lib/forms/logic'
import type { TableRow } from '@tinycld/core/lib/forms/values'
import { log } from '@tinycld/core/lib/logger'
import { useOrgHref } from '@tinycld/core/lib/org-routes'
import { useStore } from '@tinycld/core/lib/pocketbase'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { DateField } from '@tinycld/core/ui/forms/fields/DateField'
import { router } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { Platform, Pressable, type PressableInstance, Text, View } from 'react-native'
import { AddressField } from '../components/forms/AddressField'
import { useInvoiceFormScope } from '../components/invoices/invoice-form-context'
import { SearchPicker, useSearchPicker } from '../components/SearchPicker'
import { useInvoiceCustomerOptions } from '../hooks/useInvoiceCustomerOptions'
import { type CustomerAddress, formatAddressLines } from '../lib/address'
import { dueDateFor } from '../lib/document-dates'
import { customerFills, lineTaxableDefaults } from '../lib/invoice-fills'
import { INVOICE_MESSAGES } from '../lib/invoice-messages'
import type { PaymentTermKey } from '../lib/payment-terms'
import { useInvoiceBandStore } from '../stores/invoice-band-store'
import { EmailField } from './contact-fields'
import { TaxRateField } from './tax-fields'
import { PaymentTermsField } from './vendor-fields'

// The `books:invoice` host's header built-ins. Core hands each one only its own value and
// onChange; a field that fills its siblings reads the form through `useFormContext` and
// sets them in its own change handler, never in an effect. What the screen loaded (the
// form's customer, the tax rates) and the form's band key come from InvoiceForm's scope.

const DIRTY = { shouldDirty: true } as const

function textOf(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

// The stored terms key, or '' for anything else.
function termsOf(value: unknown): PaymentTermKey {
    return textOf(value) as PaymentTermKey
}

function productIdsOf(rows: readonly TableRow[]): string[] {
    return [...new Set(rows.map(row => textOf(row.product)).filter(id => id !== ''))]
}

function useCustomerPick(value: string, onChange: (value: unknown) => void) {
    const [customersCollection, productsCollection] = useStore('books_customers', 'books_products')
    // Each line's product's `taxable`, read once for a pick that resets the flags.
    const productTaxableOf = async (rows: readonly TableRow[]) => {
        const ids = productIdsOf(rows)
        if (ids.length === 0) return new Map<string, boolean>()
        const products = await queryOnce(q =>
            q.from({ p: productsCollection }).where(({ p }) => inArray(p.id, ids))
        )
        return new Map(products.map(product => [product.id, product.taxable]))
    }
    const { getValues, setValue } = useFormContext<FormValues>()
    const scope = useInvoiceFormScope()
    // The last pick's read failed: local UI state that only this field shows.
    const [pickFailed, setPickFailed] = useState(false)
    const pick = async (id: string) => {
        if (id === value) return
        setPickFailed(false)
        try {
            const customer = await queryOnce(q =>
                q
                    .from({ c: customersCollection })
                    .where(({ c }) => eq(c.id, id))
                    .findOne()
            )
            if (!customer) throw new Error(`customer ${id} not found`)
            const previousExempt = value === '' ? null : (scope.customer?.tax_exempt ?? null)
            const fills = customerFills(
                customer,
                scope.taxRows,
                textOf(getValues('date')),
                previousExempt
            )
            const rows = (getValues('lines') ?? []) as TableRow[]
            const taxable = fills.resetTaxable ? await productTaxableOf(rows) : null
            onChange(id)
            setValue('bill_to', fills.bill_to, DIRTY)
            setValue('email', fills.email, DIRTY)
            setValue('terms', fills.terms, DIRTY)
            setValue('tax_rate', fills.tax_rate, DIRTY)
            if (fills.due_date !== null) setValue('due_date', fills.due_date, DIRTY)
            if (taxable)
                setValue('lines', lineTaxableDefaults(rows, taxable, fills.isExempt), DIRTY)
        } catch (error) {
            log.warn('books.invoice', 'customer pick could not read the customer', {
                customer: id,
                error: String(error),
            })
            setPickFailed(true)
        }
    }
    return { pick, pickFailed }
}

function customerTriggerLabel(value: string, scope: ReturnType<typeof useInvoiceFormScope>) {
    if (!value) return 'Choose a customer'
    if (scope.customer) return scope.customer.display_name
    return scope.isCustomerLoading ? '…' : 'Unknown customer'
}

function CustomerLoadError({ isVisible, onRetry }: { isVisible: boolean; onRetry?: () => void }) {
    if (!isVisible) return null
    const retry = onRetry ? (
        <Button variant="outline" size="sm" style={{ minHeight: 44 }} onPress={onRetry}>
            <ButtonText>Retry</ButtonText>
        </Button>
    ) : null
    return (
        <View
            accessibilityRole="alert"
            testID="invoice-customer-load-error"
            className="mt-1 flex-row items-center gap-2"
        >
            <Text className="min-w-0 flex-1 text-xs text-danger">
                {INVOICE_MESSAGES.customerLoadFailed}
            </Text>
            {retry}
        </View>
    )
}

// The forms engine names each field's control `form-input-<key>`; Bill to's links are
// not fields, so a pick passes over them.
const FIELD_CONTROLS = '[data-testid^="form-input-"]'

// The invoice form's own root: an earlier invoice screen can stay mounted under this one.
const FORM_ROOT = '[data-testid="invoice-form"]'

// The field control after `from` in this form's order, on web: the header fields are core
// and Books components side by side, and core's select takes no focus ref, so the DOM
// order inside the form is the one order they all follow. Nothing moves when `from` is
// not one of this form's controls. Native moves no focus (spec §6: pickers open by tap).
function focusNextField(from: PressableInstance | null) {
    if (Platform.OS !== 'web' || typeof HTMLElement === 'undefined') return
    if (!(from instanceof HTMLElement)) return
    const root = from.closest(FORM_ROOT)
    if (!root) return
    const fields = Array.from(root.querySelectorAll<HTMLElement>(FIELD_CONTROLS)).filter(
        node => node.tabIndex >= 0 && node.getClientRects().length > 0
    )
    const at = fields.indexOf(from)
    if (at < 0) return
    fields[at + 1]?.focus()
}

/**
 * Customer: a picker over active customers ("Parent: Child" for a sub-customer). A
 * stored customer that is now inactive shows by name. Picking one fills Bill to, Email,
 * Terms, Tax and Due date, and the lines' taxable flags on the first pick or when the
 * exemption changes, and moves focus on to Terms. Focused once at open, on web only.
 */
export function CustomerField({ fieldKey, label, value, onChange, disabled }: BuiltinFieldProps) {
    const id = textOf(value)
    const scope = useInvoiceFormScope()
    const picker = useSearchPicker()
    const trigger = useRef<PressableInstance | null>(null)
    const triggerRef = useCallback((node: PressableInstance | null) => {
        trigger.current = node
    }, [])
    const onPicked = () => focusNextField(trigger.current)
    const options = useInvoiceCustomerOptions(picker.debouncedTerm, picker.isOpen)
    const { pick, pickFailed } = useCustomerPick(id, onChange)
    const triggerLabel = customerTriggerLabel(id, scope)
    const triggerSuffix = scope.customer?.inactive ? '(inactive)' : undefined
    const onPick = (next: string) => {
        void pick(next)
    }
    const retry = scope.customerLoadFailed ? scope.retryCustomer : undefined
    return (
        <View>
            <SearchPicker
                picker={picker}
                title={label}
                triggerLabel={triggerLabel}
                isPlaceholder={!id}
                triggerSuffix={triggerSuffix}
                triggerAccessibilityLabel={`${label}: ${id ? triggerLabel : 'none'}`}
                triggerTestId={`form-input-${fieldKey}`}
                disabled={disabled}
                searchPlaceholder="Search customers"
                searchTestId={`form-input-${fieldKey}-search`}
                options={options.options}
                optionTestIdPrefix={`form-input-${fieldKey}-option`}
                value={id}
                onChange={onPick}
                isLoading={options.isLoading}
                loadFailed={options.loadFailed}
                onRetry={options.retry}
                emptyText="No customers match"
                autoFocus={Platform.OS === 'web'}
                triggerRef={triggerRef}
                onPicked={onPicked}
            />
            <CustomerLoadError isVisible={pickFailed || scope.customerLoadFailed} onRetry={retry} />
        </View>
    )
}

function isEditingBand(bandKey: string, editingFor: string | null) {
    return bandKey !== '' && editingFor === bandKey
}

function LinkButton({
    label,
    onPress,
    testID,
    isVisible,
}: {
    label: string
    onPress: () => void
    testID: string
    isVisible: boolean
}) {
    if (!isVisible) return null
    return (
        <Pressable accessibilityRole="link" onPress={onPress} testID={testID} className="py-1">
            <Text className="text-sm text-primary">{label}</Text>
        </Pressable>
    )
}

function AddressLines({ lines }: { lines: string[] }) {
    const rows = lines.map((line, index) => (
        <Text key={`${index}-${line}`} className="text-sm text-foreground">
            {line}
        </Text>
    ))
    return <>{rows}</>
}

function addressOf(value: unknown): CustomerAddress | null {
    return value && typeof value === 'object' ? (value as CustomerAddress) : null
}

function BillToBody(props: BuiltinFieldProps & { isEditing: boolean }) {
    const { isEditing, fieldKey, value, onChange, disabled } = props
    if (isEditing) {
        return (
            <AddressField
                fieldKey={fieldKey}
                value={value}
                onChange={onChange}
                disabled={disabled}
                variant="billing"
            />
        )
    }
    return <AddressLines lines={formatAddressLines(addressOf(value))} />
}

/**
 * Bill to: the snapshot of the customer's billing address as text, with "Edit address"
 * (reveals the address inputs and the Email input in the band) and "Edit customer"
 * (pushes the customer's own form, so Back returns to the unsaved invoice).
 */
export function BillToField(props: BuiltinFieldProps) {
    const { bandKey } = useInvoiceFormScope()
    const editingFor = useInvoiceBandStore(s => s.editingFor)
    const edit = useInvoiceBandStore(s => s.edit)
    const orgHref = useOrgHref()
    const customerId = textOf(useWatch<FormValues>({ name: 'customer' }))
    const isEditing = isEditingBand(bandKey, editingFor)
    const onEditAddress = () => edit(bandKey)
    const onEditCustomer = () => router.push(orgHref(`books/customers/${customerId}`))
    return (
        <View testID="invoice-bill-to" className="gap-1">
            <BillToBody {...props} isEditing={isEditing} />
            <View className="flex-row flex-wrap gap-x-4">
                <LinkButton
                    label="Edit address"
                    onPress={onEditAddress}
                    testID="invoice-edit-address"
                    isVisible={!isEditing && !props.disabled}
                />
                <LinkButton
                    label="Edit customer"
                    onPress={onEditCustomer}
                    testID="invoice-edit-customer"
                    isVisible={customerId !== ''}
                />
            </View>
        </View>
    )
}

function EmailText({ value }: { value: string }) {
    if (!value) return null
    return <Text className="text-sm text-foreground">{value}</Text>
}

// Email: the customer's email as text until "Edit address", then core's email input.
export function BandEmailField(props: BuiltinFieldProps) {
    const { bandKey } = useInvoiceFormScope()
    const editingFor = useInvoiceBandStore(s => s.editingFor)
    const isEditing = isEditingBand(bandKey, editingFor)
    const body = isEditing ? <EmailField {...props} /> : <EmailText value={textOf(props.value)} />
    return <View testID="invoice-email">{body}</View>
}

// Terms: picking one also sets Due date from the invoice date; None leaves it.
export function DocumentTermsField(props: BuiltinFieldProps) {
    const { getValues, setValue } = useFormContext<FormValues>()
    const onChange = (next: unknown) => {
        props.onChange(next)
        const due = dueDateFor(textOf(getValues('date')), termsOf(next))
        if (due !== null) setValue('due_date', due, DIRTY)
    }
    return (
        <View testID="invoice-terms">
            <PaymentTermsField {...props} onChange={onChange} />
        </View>
    )
}

interface DayFieldProps {
    fieldKey: string
    label: string
    value: unknown
    disabled: boolean
    onChange: (value: string) => void
}

function DayField({ fieldKey, label, value, disabled, onChange }: DayFieldProps) {
    const onDateChange = (next: string | null) => onChange(next ?? '')
    return (
        <DateField
            value={textOf(value) || null}
            onChange={onDateChange}
            withTime={false}
            disabled={disabled}
            accessibilityLabel={label}
            testID={`form-input-${fieldKey}`}
        />
    )
}

// Invoice date: a change also sets Due date from the terms, when there are terms.
export function DocumentDateField(props: BuiltinFieldProps) {
    const { getValues, setValue } = useFormContext<FormValues>()
    const onChange = (next: string) => {
        props.onChange(next)
        const due = dueDateFor(next, termsOf(getValues('terms')))
        if (due !== null) setValue('due_date', due, DIRTY)
    }
    return <DayField {...props} onChange={onChange} />
}

// Due date: a typed date is kept, and so are the terms.
export function DueDateField(props: BuiltinFieldProps) {
    return <DayField {...props} onChange={props.onChange} />
}

// Tax: "None" first, then the active rates and groups (an inactive stored choice is
// listed for the value it mounted with: TaxRateField's rule).
export function DocumentTaxField(props: BuiltinFieldProps) {
    return (
        <View testID="invoice-tax">
            <TaxRateField {...props} />
        </View>
    )
}
