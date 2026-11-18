import { useLeaveGuard } from '@tinycld/core/components/forms-builder/use-leave-guard'

// The form's own Discard question, which its Cancel opens.
interface CancelQuestion {
    isOpen: boolean
    discard(): void
    keepEditing(): void
}

interface FormLeaveGuardInput {
    // The form holds edits that leaving would drop.
    isDirty: boolean
    // A save, post or delete runs, or succeeded and is leaving: the move it makes is the
    // write's own and asks nothing.
    isWriting: boolean
    // The form's Cancel: its own question when it has unsaved edits, else it leaves.
    cancel(): void
    // Leaves the form with no question of its own.
    leave(): void
    question: CancelQuestion
    // Runs before the guard's Discard lets the held move go on (a form's pending files).
    onDiscard?(): void
}

/**
 * Asks before a dirty Books transaction form is left by any way: Cancel and the header
 * Back, the browser's Back or Forward, a reload or tab close, a list key or a row press
 * beside the form. Core `useLeaveGuard` holds the move; the form's one Discard dialog
 * shows the question.
 *
 * One question per move: while the guard is on, Cancel leaves and the guard holds that
 * move, so Cancel asks through the guard. While a write runs the guard is off, so the
 * move the write makes (a saved form opening its record, Post & new, a deleted draft
 * leaving) asks nothing; Cancel then asks the form's own question, which also counts text
 * typed after the submit.
 *
 * expo-router applies a write's `router.back()` / `router.replace()` after the write's
 * pending state has ended. So `isWriting` of a write that leaves stays true from its
 * success until the form goes: the mutation's `isSuccess`, or a flag set before the write
 * starts or before the move, never a `useState` set from a promise continuation, which
 * can render after the move is held. A save or post makes the form clean (its values
 * become the baseline) before it moves, so it needs no such flag; a write that stays on
 * the form (Pay & new) resets it.
 */
export function useFormLeaveGuard({
    isDirty,
    isWriting,
    cancel,
    leave,
    question,
    onDiscard,
}: FormLeaveGuardInput) {
    const isGuarding = isDirty && !isWriting
    const guard = useLeaveGuard(isGuarding)
    const discardHeld = () => {
        onDiscard?.()
        guard.discard()
    }
    const dialog = guard.isConfirming
        ? { isVisible: true, onDiscard: discardHeld, onKeepEditing: guard.cancel }
        : {
              isVisible: question.isOpen,
              onDiscard: question.discard,
              onKeepEditing: question.keepEditing,
          }
    return { cancel: isGuarding ? leave : cancel, dialog }
}
