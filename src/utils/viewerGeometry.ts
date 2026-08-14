export interface ViewerPoint {
  x: number
  y: number
}

export function calculateAnchoredPan(
  currentPan: ViewerPoint,
  anchor: ViewerPoint,
  scaleRatio: number,
): ViewerPoint {
  return {
    x: anchor.x - (anchor.x - currentPan.x) * scaleRatio,
    y: anchor.y - (anchor.y - currentPan.y) * scaleRatio,
  }
}
