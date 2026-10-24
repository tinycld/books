import { ScrollView } from 'react-native'
import { useOpeningBalancesForm } from '../../hooks/useOpeningBalancesForm'
import type { OpeningScreen } from '../../hooks/useOpeningBalancesScreen'
import { OpeningDateFields } from './OpeningDateFields'

// Mounted with key={screen.formKey}, after the data has loaded, so the form's
// defaults are final on the first render.
export function OpeningFormScreen({ screen }: { screen: OpeningScreen }) {
    const model = useOpeningBalancesForm(screen)
    return (
        <ScrollView className="min-h-0 flex-1" keyboardShouldPersistTaps="handled">
            <OpeningDateFields model={model} />
        </ScrollView>
    )
}
