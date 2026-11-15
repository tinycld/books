import type { PickedFile } from '@tinycld/core/file-viewer/picked-file'
import { create } from '@tinycld/core/lib/store'
import type { AttachmentUploadState } from '../lib/attachments-fixture'

// A picked or dropped file that is not stored yet: pending (a form's), uploading, or
// failed with the text its row shows.
export type AttachmentDraft = {
    key: string
    file: PickedFile
    name: string
    mimeType: string
    size: number
    state: AttachmentUploadState
}

// One screen's files that are not stored yet, the stored rows it will delete at its save
// (a form's pending removals), and the refusal under its add area.
export type AttachmentSession = {
    drafts: AttachmentDraft[]
    removals: string[]
    refusal: string | null
}

const READ_SESSION_PREFIX = 'read:'

// The session key of a document's read view; a read view uploads each file at once.
export function readSessionKey(recordId: string): string {
    return `${READ_SESSION_PREFIX}${recordId}`
}

export function isReadSession(sessionKey: string): boolean {
    return sessionKey.startsWith(READ_SESSION_PREFIX)
}

interface AttachmentsState {
    sessions: Record<string, AttachmentSession>
    // How many mounted screens hold each session: a stack can keep an earlier instance of
    // the same document's screen mounted under a new one, and the first to unmount must
    // not drop the session the other still shows.
    holders: Record<string, number>
    open: (sessionKey: string) => void
    drop: (sessionKey: string) => void
    add: (sessionKey: string, drafts: AttachmentDraft[]) => void
    setState: (sessionKey: string, key: string, state: AttachmentUploadState) => void
    discard: (sessionKey: string, key: string) => void
    markRemoval: (sessionKey: string, id: string) => void
    unmarkRemovals: (sessionKey: string) => void
    setRefusal: (sessionKey: string, text: string | null) => void
}

function emptySession(): AttachmentSession {
    return { drafts: [], removals: [], refusal: null }
}

type Sessions = AttachmentsState['sessions']

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
    return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key))
}

// Changes one open session. A session that was dropped stays dropped: an upload that
// ends after its screen unmounted has nothing to update.
function changed(
    sessions: Sessions,
    sessionKey: string,
    change: (session: AttachmentSession) => AttachmentSession
): Partial<AttachmentsState> {
    const session = sessions[sessionKey]
    if (!session) return {}
    return { sessions: { ...sessions, [sessionKey]: change(session) } }
}

/**
 * The attachments that are not stored yet, per screen session (spec §3.2). Files are not
 * serializable, so nothing persists: a session lives while its screen is mounted.
 */
export const useAttachmentsStore = create<AttachmentsState>()(set => ({
    sessions: {},
    holders: {},
    open: sessionKey =>
        set(s => {
            if (s.sessions[sessionKey]) {
                const held = (s.holders[sessionKey] ?? 0) + 1
                return { holders: { ...s.holders, [sessionKey]: held } }
            }
            return {
                sessions: { ...s.sessions, [sessionKey]: emptySession() },
                holders: { ...s.holders, [sessionKey]: 1 },
            }
        }),
    drop: sessionKey =>
        set(s => {
            if (!s.sessions[sessionKey]) return {}
            const held = (s.holders[sessionKey] ?? 1) - 1
            if (held > 0) return { holders: { ...s.holders, [sessionKey]: held } }
            return {
                sessions: without(s.sessions, sessionKey),
                holders: without(s.holders, sessionKey),
            }
        }),
    add: (sessionKey, drafts) =>
        set(s =>
            changed(s.sessions, sessionKey, session => ({
                ...session,
                drafts: [...session.drafts, ...drafts],
            }))
        ),
    setState: (sessionKey, key, state) =>
        set(s =>
            changed(s.sessions, sessionKey, session => ({
                ...session,
                drafts: session.drafts.map(draft =>
                    draft.key === key ? { ...draft, state } : draft
                ),
            }))
        ),
    discard: (sessionKey, key) =>
        set(s =>
            changed(s.sessions, sessionKey, session => ({
                ...session,
                drafts: session.drafts.filter(draft => draft.key !== key),
            }))
        ),
    markRemoval: (sessionKey, id) =>
        set(s =>
            changed(s.sessions, sessionKey, session => ({
                ...session,
                removals: session.removals.includes(id)
                    ? session.removals
                    : [...session.removals, id],
            }))
        ),
    unmarkRemovals: sessionKey =>
        set(s => changed(s.sessions, sessionKey, session => ({ ...session, removals: [] }))),
    setRefusal: (sessionKey, text) =>
        set(s => changed(s.sessions, sessionKey, session => ({ ...session, refusal: text }))),
}))
