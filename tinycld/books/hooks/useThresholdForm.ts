import {
    type ThresholdValues,
    thresholdCents,
    thresholdSchema,
    thresholdValues,
} from '../lib/threshold-schema'
import type { BooksSettings } from '../types'
import { useSettingsForm } from './useSettingsForm'

// The field has the column's name, so a server refusal that names threshold_1099 lands
// under the input instead of in a toast.
export function useThresholdForm(settings: BooksSettings) {
    return useSettingsForm<ThresholdValues>({
        schema: thresholdSchema(settings.currency),
        values: thresholdValues(settings),
        toPatch: values => ({
            threshold_1099: thresholdCents(values.threshold_1099, settings.currency),
        }),
    })
}
