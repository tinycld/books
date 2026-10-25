import { create } from '@tinycld/core/lib/store'

interface OpeningPostState {
    isPostPending: boolean
    setPostPending: (isPostPending: boolean) => void
}

// Posting flips the entry's status optimistically, before the server answers. The
// screen holds the form up while this is set; a store updates synchronously, so the
// flag is visible to the very render the optimistic flip triggers.
export const useOpeningPostStore = create<OpeningPostState>()(set => ({
    isPostPending: false,
    setPostPending: isPostPending => set({ isPostPending }),
}))
