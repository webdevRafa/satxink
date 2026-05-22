export const parseTags = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean)
    )
  );

export const formatTagsInput = (tags?: string[]) => (tags || []).join(", ");
