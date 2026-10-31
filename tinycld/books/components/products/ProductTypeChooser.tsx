import { useThemeColor } from '@tinycld/core/lib/use-app-theme'
import { Button, ButtonText } from '@tinycld/core/ui/button'
import { router } from 'expo-router'
import { ChevronRight } from 'lucide-react-native'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useDetailSurface } from '../../hooks/useDetailSurface'
import { useProductNavigation } from '../../hooks/useProductNavigation'
import { formRowClassFor } from '../../lib/detail-surface'
import { CHOOSER_READ_ONLY } from '../../lib/product-messages'
import { PRODUCT_TYPES, type ProductType } from '../../lib/product-types'
import { RecordSurface } from '../RecordSurface'

interface ChooserRowProps {
    type: ProductType
    label: string
    sentence: string
    isDisabled: boolean
}

// Setting the param swaps the chooser for the form in place, with no history entry, so
// Back from the form returns to the list.
function ChooserRow({ type, label, sentence, isDisabled }: ChooserRowProps) {
    const chevron = useThemeColor('muted-foreground')
    const look = isDisabled ? 'opacity-60' : ''
    return (
        <Pressable
            testID={`product-type-${type}`}
            accessibilityRole="button"
            disabled={isDisabled}
            onPress={() => router.setParams({ type })}
            className={`flex-row items-center gap-3 border-b border-border py-3 active:bg-accent ${look}`}
            style={{ minHeight: 64 }}
        >
            <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-base font-semibold text-foreground">{label}</Text>
                <Text className="text-sm text-muted-foreground">{sentence}</Text>
            </View>
            <ChevronRight size={16} color={chevron} />
        </Pressable>
    )
}

function ReadOnlyLine({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID="product-type-read-only" className="pb-2 text-sm text-muted-foreground">
            {CHOOSER_READ_ONLY}
        </Text>
    )
}

/** The first step of a new product: pick its type. A reader sees the rows disabled. */
export function ProductTypeChooser({ canWrite }: { canWrite: boolean }) {
    const surface = useDetailSurface()
    const { leave } = useProductNavigation()
    const rows = PRODUCT_TYPES.map(entry => (
        <ChooserRow
            key={entry.key}
            type={entry.key}
            label={entry.label}
            sentence={entry.sentence}
            isDisabled={!canWrite}
        />
    ))
    const footer = (
        <Button testID="product-cancel" variant="outline" onPress={leave}>
            <ButtonText>Cancel</ButtonText>
        </Button>
    )
    return (
        <RecordSurface
            surface={surface}
            testIdPrefix="product"
            backLabel="Products and services"
            title="New product or service"
            onLeave={leave}
            footer={footer}
        >
            <ScrollView testID="product-type-chooser" className="flex-1">
                <View className={`pt-2 ${formRowClassFor(surface)}`}>
                    <ReadOnlyLine isVisible={!canWrite} />
                    {rows}
                </View>
            </ScrollView>
        </RecordSurface>
    )
}
