import {
    type Control,
    SelectInput,
    type SelectOption,
    TextAreaInput,
    TextInput,
    Toggle,
    useWatch,
} from '@tinycld/core/ui/form'
import { View } from 'react-native'
import type { useAccountForm } from '../../hooks/useAccountForm'
import type { AccountRow } from '../../hooks/useAccountsQuery'
import type { AccountFormValues } from '../../lib/account-schema'
import { accountPath } from '../../lib/account-tree'
import { ACCOUNT_TYPES } from '../../lib/account-types'

type FormControl = Control<AccountFormValues>

const TYPE_OPTIONS: SelectOption[] = ACCOUNT_TYPES.map(({ key, label }) => ({
    value: key,
    label,
}))

// Never matches a stored value, so the one option reads as unchosen.
const NO_TYPE_OPTIONS: SelectOption[] = [
    { value: 'no-type-chosen', label: 'Choose an account type first' },
]

interface ParentFieldProps {
    isVisible: boolean
    control: FormControl
    disabled: boolean
    options: SelectOption[]
}

function ParentField({ isVisible, control, disabled, options }: ParentFieldProps) {
    if (!isVisible) return null
    return (
        <SelectInput
            name="parent"
            control={control}
            label="Parent account"
            options={options}
            disabled={disabled}
        />
    )
}

interface AccountPanelFieldsProps {
    account: ReturnType<typeof useAccountForm>
    accounts: AccountRow[]
}

export function AccountPanelFields({ account, accounts }: AccountPanelFieldsProps) {
    const {
        form,
        isReadOnly,
        isMissing,
        typeLocked,
        typeLockReason,
        parentOptions,
        detailTypeOptions,
    } = account
    const { control, setValue, clearErrors } = form
    const fieldsDisabled = isReadOnly || isMissing
    const type = useWatch({ control, name: 'type' })
    const isSubAccount = useWatch({ control, name: 'isSubAccount' })
    const byId = new Map(accounts.map(a => [a.id, a]))
    const parentChoices = parentOptions.map(a => ({
        value: a.id,
        label: accountPath(a, byId),
    }))
    const detailChoices =
        type === ''
            ? NO_TYPE_OPTIONS
            : detailTypeOptions.map(({ key, label }) => ({ value: key, label }))

    const clearDependents = () => {
        setValue('parent', '')
        setValue('detail_type', '')
        clearErrors(['parent', 'detail_type'])
    }
    const clearParent = (next: boolean) => {
        if (next) return
        setValue('parent', '')
        clearErrors('parent')
    }

    return (
        <View>
            <TextInput
                name="name"
                control={control}
                label="Account name"
                aria-disabled={fieldsDisabled}
                editable={!fieldsDisabled}
            />
            <TextInput
                name="number"
                control={control}
                label="Account number (optional)"
                accessibilityLabel="Account number"
                aria-disabled={fieldsDisabled}
                editable={!fieldsDisabled}
            />
            <SelectInput
                name="type"
                control={control}
                label="Account type"
                options={TYPE_OPTIONS}
                hint={typeLockReason ?? undefined}
                disabled={fieldsDisabled || typeLocked}
                onValueChange={clearDependents}
            />
            <SelectInput
                name="detail_type"
                control={control}
                label="Detail type"
                options={detailChoices}
                disabled={fieldsDisabled || type === ''}
            />
            <Toggle
                name="isSubAccount"
                control={control}
                label="Make this a sub-account"
                disabled={fieldsDisabled}
                onValueChange={clearParent}
            />
            <ParentField
                isVisible={isSubAccount}
                control={control}
                disabled={fieldsDisabled}
                options={parentChoices}
            />
            <TextAreaInput
                name="description"
                control={control}
                label="Description"
                aria-disabled={fieldsDisabled}
                editable={!fieldsDisabled}
            />
        </View>
    )
}
