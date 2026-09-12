export type Chapter = "collection" | "booking";
export type Triple = [number, number, number];
export type Transform = { position: Triple; rotationDegrees: Triple; scale: Triple; visible: boolean };
export type CameraGuide = { position: Triple; target: Triple; verticalSpan: number; aspect: number };
export type Manifest = {
  nodeNames: string[];
  poses: Record<string, Record<string, Transform>>;
  cameras: Record<string, { desktop: CameraGuide }>;
};
export const assetBase = "/media/flash-story/";

// Explicit hold intervals, including an atomic sheet-to-cards handoff at 40%.
export function storyFrame(chapter: Chapter, progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  const stops: [number, string][] = chapter === "collection"
    ? [[0, "closed-portfolio"], [.14, "closed-portfolio"], [.32, "sheet-lift"], [.4, "sheet-lift"],
      [.4, "extraction-start"], [.46, "extraction-start"], [.72, "online-collection"], [1, "online-collection"]]
    : [[0, "request"], [.16, "request"], [.3, "artist-review"], [.4, "artist-review"],
      [.56, "artist-offer"], [.65, "artist-offer"], [.83, "deposit"], [1, "deposit"]];
  let i = 0;
  while (i < stops.length - 2 && p >= stops[i + 1][0]) i++;
  const [start, from] = stops[i];
  const [end, to] = stops[i + 1];
  const linear = end === start ? 1 : (p - start) / (end - start);
  const t = Math.max(0, Math.min(1, linear));
  return { from, to, mix: t * t * (3 - 2 * t), extracted: chapter === "booking" || p >= .4,
    step: chapter === "collection" ? (p < .18 ? 0 : p < .4 ? 1 : p < .67 ? 2 : 3)
      : (p < .22 ? 0 : p < .47 ? 1 : p < .74 ? 2 : 3) };
}

export function eligibleForStory(width: number, height: number, reduced: boolean, saveData: boolean) {
  return width >= 1024 && height >= 700 && !reduced && !saveData;
}
