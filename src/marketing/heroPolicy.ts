export type DeviceHints = {
  reducedMotion: boolean;
  saveData?: boolean;
  effectiveType?: string;
  memory?: number;
  cores?: number;
  width: number;
};

// Missing hardware hints are not treated as a guarantee of fast hardware.
// The renderer also checks WebGL and sustained frame rate at runtime.
export function shouldAutoLoad3D(hints: DeviceHints): boolean {
  return (
    !hints.reducedMotion &&
    !hints.saveData &&
    !["slow-2g", "2g", "3g"].includes(hints.effectiveType ?? "") &&
    (hints.memory === undefined || hints.memory > 4) &&
    (hints.cores === undefined || hints.cores > 4) &&
    hints.width >= 768
  );
}

export function heroViewForWidth(width: number) {
  return width <= 599
    ? { camera: "Hero_Mobile", posterAspect: 4 / 5 }
    : { camera: "Hero_Copy_Right", posterAspect: 21 / 9 };
}

export function posterMatchedFieldOfView(
  exportedFov: number,
  exportedAspect: number,
  posterAspect: number,
  canvasAspect: number,
): number {
  // Blender AUTO sensor fit uses the larger image dimension. The GLB cameras
  // were exported at 16:9, while the posters were rendered at 21:9 and 4:5.
  const halfTangent =
    Math.tan((exportedFov * Math.PI) / 360) * Math.max(exportedAspect, 1);
  const posterHalfTangent = halfTangent / Math.max(posterAspect, 1);
  return (
    (2 *
      Math.atan(posterHalfTangent * Math.min(1, posterAspect / canvasAspect)) *
      180) /
    Math.PI
  );
}

export function isSustainedLowFrameRate(
  frames: number,
  elapsedMs: number,
): boolean {
  return elapsedMs >= 3000 && frames / (elapsedMs / 1000) < 20;
}
