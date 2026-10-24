import { Button, ButtonText } from '@tinycld/core/ui/button'
import { FormErrorSummary, TextAreaInput, TextInput } from '@tinycld/core/ui/form'
import { Text, View } from 'react-native'
import { useBooksSettings } from '../../hooks/useBooksSettings'
import { useSettingsForm } from '../../hooks/useSettingsForm'
import { type CompanyValues, companySchema, companyValues } from '../../lib/settings-schema'
import type { BooksSettings } from '../../types'
import { FieldNote, ReadOnlyRow, SectionCard } from './SectionCard'

function CompanyReadOnly({ values, isVisible }: { values: CompanyValues; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <SectionCard>
            <ReadOnlyRow label="Legal business name" value={values.business_name} />
            <ReadOnlyRow label="Tax ID (EIN)" value={values.tax_id} />
            <ReadOnlyRow label="Business address" value={values.address} multiline />
            <ReadOnlyRow label="Phone" value={values.phone} />
            <ReadOnlyRow label="Email" value={values.email} />
            <ReadOnlyRow label="Website" value={values.website} />
            <CurrencyBlock />
        </SectionCard>
    )
}

function CurrencyBlock() {
    return (
        <View className="gap-0.5 py-3">
            <Text className="text-sm text-foreground">Currency: US dollars (USD)</Text>
            <FieldNote text="Books uses one currency." />
        </View>
    )
}

function CompanyForm({ settings }: { settings: BooksSettings }) {
    const { form, submit, isPending, isDirty } = useSettingsForm({
        schema: companySchema,
        values: companyValues(settings),
        toPatch: values => values,
    })
    const { control, formState } = form
    return (
        <SectionCard>
            <View className="gap-4">
                <TextInput
                    control={control}
                    name="business_name"
                    label="Legal business name"
                    testID="books-settings-company-business-name"
                />
                <TextInput
                    control={control}
                    name="tax_id"
                    label="Tax ID (EIN)"
                    testID="books-settings-company-tax-id"
                />
                <TextAreaInput
                    control={control}
                    name="address"
                    label="Business address"
                    testID="books-settings-company-address"
                />
                <TextInput
                    control={control}
                    name="phone"
                    label="Phone"
                    testID="books-settings-company-phone"
                />
                <TextInput
                    control={control}
                    name="email"
                    label="Email"
                    testID="books-settings-company-email"
                />
                <TextInput
                    control={control}
                    name="website"
                    label="Website"
                    testID="books-settings-company-website"
                />
                <CurrencyBlock />
                <FieldNote text="Your logo and brand color are set in the organization settings" />
                <FormErrorSummary errors={formState.errors} />
                <View className="flex-row">
                    <Button
                        testID="books-settings-save"
                        isDisabled={!isDirty || isPending}
                        onPress={submit}
                    >
                        <ButtonText>Save</ButtonText>
                    </Button>
                </View>
            </View>
        </SectionCard>
    )
}

export function CompanySection({ isAdmin }: { isAdmin: boolean }) {
    const { settings } = useBooksSettings()
    if (!settings) return null
    if (!isAdmin) return <CompanyReadOnly values={companyValues(settings)} isVisible />
    return <CompanyForm settings={settings} />
}
