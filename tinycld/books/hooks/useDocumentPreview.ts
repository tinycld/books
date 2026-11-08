import { usePdfDownload } from './usePdfDownload'

// The Settings "Preview PDF" button: the sample invoice with the saved company
// details and the organization branding.
export function useDocumentPreview() {
    const download = usePdfDownload()
    return {
        preview: () => download.mutate({ kind: 'sample', fallbackName: 'sample-invoice' }),
        isPending: download.isPending,
        label: download.isPending ? 'Creating PDF…' : 'Preview PDF',
    }
}
