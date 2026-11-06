import { Button, ButtonText } from '@tinycld/core/ui/button'
import { View } from 'react-native'
import { useDocumentPreview } from '../../hooks/useDocumentPreview'
import { FieldNote, SectionCard } from './SectionCard'

const NOTE =
    'See how invoices and other documents print, with your saved company details and the logo and brand color from the organization settings.'

export function DocumentPreviewCard() {
    const { preview, isPending, label } = useDocumentPreview()
    return (
        <SectionCard title="Printed documents">
            <View className="gap-3 py-3">
                <FieldNote text={NOTE} />
                <View className="flex-row">
                    <Button
                        testID="books-settings-preview-pdf"
                        variant="outline"
                        isDisabled={isPending}
                        onPress={preview}
                    >
                        <ButtonText>{label}</ButtonText>
                    </Button>
                </View>
            </View>
        </SectionCard>
    )
}
