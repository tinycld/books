import { useEffect } from 'react'

// Stands in for a dialog whose connection left the page (disconnected elsewhere): the
// store still names the dialog, so it is closed once, after render.
export function CloseOnMount({ onClose }: { onClose(): void }) {
    useEffect(() => {
        onClose()
    }, [onClose])
    return null
}
