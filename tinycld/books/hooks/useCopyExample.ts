import { log } from '@tinycld/core/lib/logger'
import { setStringAsync } from 'expo-clipboard'
import { useEffect, useRef, useState } from 'react'
import { importExampleCsv } from '../lib/account-import'

type CopyState = 'idle' | 'copied' | 'failed'

const LABELS: Record<CopyState, string> = {
    idle: 'Copy example',
    copied: 'Copied',
    failed: 'Could not copy',
}

const RESET_AFTER_MS = 2000

export function useCopyExample() {
    const [state, setState] = useState<CopyState>('idle')
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current)
        },
        []
    )

    const show = (next: CopyState) => {
        if (timer.current) clearTimeout(timer.current)
        setState(next)
        timer.current = setTimeout(() => setState('idle'), RESET_AFTER_MS)
    }

    const copy = async () => {
        try {
            await setStringAsync(importExampleCsv)
            show('copied')
        } catch (error) {
            log.error('books.import', error)
            show('failed')
        }
    }

    return { copy, label: LABELS[state] }
}
