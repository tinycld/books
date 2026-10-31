// How close to the end of a scrolled list the next page starts loading: about ten rows,
// so the rows are there before the person reaches the end.
export const NEAR_END_PX = 600

export type ScrollMetrics = {
    contentOffset: { y: number }
    layoutMeasurement: { height: number }
    contentSize: { height: number }
}

export function isNearEnd({
    contentOffset,
    layoutMeasurement,
    contentSize,
}: ScrollMetrics): boolean {
    return contentOffset.y + layoutMeasurement.height >= contentSize.height - NEAR_END_PX
}
