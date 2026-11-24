import { moveFocus } from '@tinycld/core/lib/move-focus'
import { type RefObject, useLayoutEffect } from 'react'
import type { PressableInstance } from 'react-native'

export type MoveDirection = 'up' | 'down'

// The Move button pressed last, so that it can take the focus back after the move.
export interface FocusRequest {
    id: string
    direction: MoveDirection
}

interface MovedFocus {
    id: string
    // The index the list draws the row at, and the row's place in the saved order.
    index: number
    place: number
    isFirst: boolean
    isLast: boolean
    focusRequest: RefObject<FocusRequest | null>
    upRef: RefObject<PressableInstance | null>
    downRef: RefObject<PressableInstance | null>
}

// Core SortableList draws its rows in cells keyed by index, so a moved row is drawn in
// another cell and the focus stays on the old cell's button, which now belongs to another
// row. Once the moved row is drawn at its new place, its pressed Move button takes the
// focus back, or its other Move button when the pressed one is now disabled at an end.
export function useMovedFocus({
    id,
    index,
    place,
    isFirst,
    isLast,
    focusRequest,
    upRef,
    downRef,
}: MovedFocus) {
    useLayoutEffect(() => {
        const request = focusRequest.current
        if (!request || request.id !== id || index !== place) return
        focusRequest.current = null
        const isUp = request.direction === 'up'
        const isPressedAtEnd = isUp ? isFirst : isLast
        const pressed = isUp ? upRef : downRef
        const other = isUp ? downRef : upRef
        const target = isPressedAtEnd ? other.current : pressed.current
        if (target) moveFocus(target)
    }, [id, index, place, isFirst, isLast, focusRequest, upRef, downRef])
}
