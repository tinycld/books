import { Text, View } from 'react-native'
import { useBackToReports } from '../../hooks/useBackToReports'
import { ReportBackLink } from './ReportHeader'

export function ReportNotFound() {
    const onBack = useBackToReports()
    return (
        <View className="flex-1 bg-background">
            <View className="px-4 pt-2">
                <ReportBackLink onBack={onBack} />
            </View>
            <View className="items-center p-8">
                <Text testID="report-not-found" className="text-base text-foreground">
                    This report does not exist
                </Text>
            </View>
        </View>
    )
}
