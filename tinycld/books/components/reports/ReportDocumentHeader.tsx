import { Text, View } from 'react-native'

function BusinessName({ name, isVisible }: { name: string; isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID="report-business-name" className="text-xs text-muted-foreground">
            {name}
        </Text>
    )
}

function ThousandsNote({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text testID="report-thousands-note" className="text-sm text-muted-foreground">
            Amounts in thousands
        </Text>
    )
}

interface ReportDocumentHeaderProps {
    businessName: string
    title: string
    periodWords: string
    basisLabel: string | null
    isThousands: boolean
}

export function ReportDocumentHeader({
    businessName,
    title,
    periodWords,
    basisLabel,
    isThousands,
}: ReportDocumentHeaderProps) {
    const period = basisLabel ? `${periodWords} · ${basisLabel}` : periodWords
    const hasBusinessName = businessName.trim() !== ''
    return (
        <View
            testID="report-document-header"
            className="gap-0.5 border-y border-border bg-card px-4 py-3"
        >
            <BusinessName name={businessName} isVisible={hasBusinessName} />
            <Text testID="report-document-title" className="text-lg font-semibold text-foreground">
                {title}
            </Text>
            <Text testID="report-document-period" className="text-sm text-muted-foreground">
                {period}
            </Text>
            <ThousandsNote isVisible={isThousands} />
        </View>
    )
}
