import { useToastStore } from '@tinycld/core/lib/stores/toast-store'
import { useForm, zodResolver } from '@tinycld/core/ui/form'
import { useState } from 'react'
import { DEFAULT_LASTS } from '../lib/overrides'
import { type OverrideValues, overrideSchema } from '../lib/settings-schema'
import { useBooksSettings } from './useBooksSettings'
import { type OverrideRow, useCloseOverrides } from './useCloseOverrides'

const BLANK_GRANT: OverrideValues = { user: '', reason: '', lasts: DEFAULT_LASTS }

type PanelPart = 'loading' | 'error' | 'no-close-date' | 'empty' | 'ready'

function panelPart(state: {
    isReady: boolean
    hasLoadError: boolean
    hasCloseDate: boolean
    isEmpty: boolean
}): PanelPart {
    if (state.hasLoadError) return 'error'
    if (!state.isReady) return 'loading'
    if (!state.hasCloseDate) return 'no-close-date'
    return state.isEmpty ? 'empty' : 'ready'
}

export function useOverridesPanel() {
    const {
        settings,
        isReady: settingsReady,
        hasLoadError: settingsFailed,
        retryLoad: retrySettings,
    } = useBooksSettings()
    const {
        active,
        past,
        grantableUsers,
        grant,
        revoke,
        isReady,
        hasLoadError,
        retryLoad: retryOverrides,
    } = useCloseOverrides()
    const addToast = useToastStore(s => s.addToast)
    // Dialog and history flags that no other component reads, so they stay local
    const [isHistoryOpen, setHistoryOpen] = useState(false)
    const [grantOpen, setGrantOpen] = useState(false)
    const [revokeTarget, setRevokeTarget] = useState<OverrideRow | null>(null)

    const grantForm = useForm<OverrideValues>({
        resolver: zodResolver(overrideSchema),
        defaultValues: BLANK_GRANT,
    })
    const { setError, reset, handleSubmit } = grantForm
    const hasCloseDate = !!settings && settings.close_date !== ''

    const dismissGrant = () => {
        setGrantOpen(false)
        reset(BLANK_GRANT)
    }

    // A dismiss mid-write would reset the form under the pending request
    const closeGrant = () => {
        if (grantForm.formState.isSubmitting) return
        dismissGrant()
    }

    const retryLoad = () => {
        retrySettings()
        retryOverrides()
    }

    const submit = handleSubmit(async values => {
        const outcome = await grant(values)
        if (outcome.ok) {
            dismissGrant()
            return
        }
        setError('root', { type: 'server', message: outcome.message })
    })

    const confirmRevoke = async () => {
        if (!revokeTarget) return
        const { id } = revokeTarget
        setRevokeTarget(null)
        const outcome = await revoke(id)
        if (!outcome.ok) addToast({ title: outcome.message, variant: 'error', duration: 5000 })
    }

    return {
        part: panelPart({
            isReady: isReady && settingsReady,
            hasLoadError: hasLoadError || settingsFailed,
            hasCloseDate,
            isEmpty: active.length === 0 && past.length === 0,
        }),
        retryLoad,
        hasCloseDate,
        active,
        past,
        isHistoryOpen,
        toggleHistory: () => setHistoryOpen(open => !open),
        grantOpen,
        openGrant: () => setGrantOpen(true),
        closeGrant,
        revokeTarget,
        askRevoke: (row: OverrideRow) => setRevokeTarget(row),
        cancelRevoke: () => setRevokeTarget(null),
        confirmRevoke: () => void confirmRevoke(),
        grantForm,
        submitGrant: () => void submit(),
        isSubmitting: grantForm.formState.isSubmitting,
        grantableUsers,
    }
}
