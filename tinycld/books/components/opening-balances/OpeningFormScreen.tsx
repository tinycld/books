import { useBreakpoint } from '@tinycld/core/components/workspace/useBreakpoint'
import { View } from 'react-native'
import { useOpeningBalancesForm } from '../../hooks/useOpeningBalancesForm'
import type { OpeningScreen } from '../../hooks/useOpeningBalancesScreen'
import { OpeningAccountTable } from './OpeningAccountTable'
import { OpeningDateFields } from './OpeningDateFields'

// Mounted with key={screen.formKey}, after the data has loaded, so the form's
// defaults are final on the first render.
export function OpeningFormScreen({ screen }: { screen: OpeningScreen }) {
    const model = useOpeningBalancesForm(screen)
    const isWide = useBreakpoint() !== 'mobile'
    const dates = <OpeningDateFields model={model} />
    return (
        <View className="min-h-0 flex-1">
            {isWide ? dates : null}
            <OpeningAccountTable
                model={model}
                currency={screen.settings?.currency ?? 'USD'}
                isWide={isWide}
                leading={isWide ? null : dates}
            />
        </View>
    )
}
