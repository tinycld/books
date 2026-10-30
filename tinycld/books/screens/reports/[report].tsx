import { useLocalSearchParams } from 'expo-router'
import { ReportNotFound } from '../../components/reports/ReportNotFound'
import { ReportScreen } from '../../components/reports/ReportScreenView'
import { reportDefinition } from '../../lib/reports/definitions'

export default function ReportRoute() {
    const { report } = useLocalSearchParams<{ report: string }>()
    const definition = reportDefinition(report)
    if (!definition) return <ReportNotFound />
    return <ReportScreen key={definition.id} definition={definition} />
}
