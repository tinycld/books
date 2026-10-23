import {
    SelectInput,
    type SelectOption,
    TextAreaInput,
    TextInput,
    useWatch,
} from '@tinycld/core/ui/form'
import { View } from 'react-native'
import type { useAccountForm } from '../../hooks/useAccountForm'
import type { AccountRow } from '../../hooks/useAccountsQuery'
import { accountPath } from '../../lib/account-tree'
import { ACCOUNT_TYPES } from '../../lib/account-types'

const TYPE_OPTIONS: SelectOption[] = ACCOUNT_TYPES.map(({ key, label }) => ({
    value: key,
    label,
}))

const NO_PARENT_OPTION: SelectOption = { value: '', label: 'None (top level)' }

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
    const byId = new Map(accounts.map(a => [a.id, a]))
    const parentChoices = [
        NO_PARENT_OPTION,
        ...parentOptions.map(a => ({ value: a.id, label: accountPath(a, byId) })),
    ]
    const detailChoices = detailTypeOptions.map(({ key, label }) => ({ value: key, label }))

    const clearDependents = () => {
        setValue('parent', '')
        setValue('detail_type', '')
        clearErrors(['parent', 'detail_type'])
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
                presentation="dropdown"
                placeholder="Select an account type"
                testID="account-type"
                hint={typeLockReason ?? undefined}
                disabled={fieldsDisabled || typeLocked}
                onValueChange={clearDependents}
            />
            <SelectInput
                name="detail_type"
                control={control}
                label="Detail type"
                options={detailChoices}
                presentation="dropdown"
                placeholder="Choose an account type first"
                testID="account-detail-type"
                disabled={fieldsDisabled || type === ''}
            />
            <SelectInput
                name="parent"
                control={control}
                label="Parent account"
                options={parentChoices}
                presentation="dropdown"
                disabled={fieldsDisabled}
                testID="account-parent"
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
