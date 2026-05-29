export const TATTOO_STYLE_OPTIONS = [
  { value: "Blackwork", aliases: [] },
  {
    value: "Black & Grey",
    aliases: ["Black and Grey", "Black & Gray", "Black and Gray"],
  },
  { value: "Fine Line", aliases: ["Fineline"] },
  { value: "Linework", aliases: ["Line Work"] },
  { value: "Dotwork", aliases: ["Dot Work"] },
  { value: "Realism", aliases: ["Realistic", "Photo Realism", "Photorealism"] },
  { value: "Portrait", aliases: ["Portraiture"] },
  {
    value: "Color Realism",
    aliases: ["Color", "Colour", "Colour Realism", "Color-realism"],
  },
  { value: "Traditional", aliases: ["American Traditional", "Old School"] },
  { value: "Neo-Traditional", aliases: ["Neo Traditional", "Neotraditional"] },
  { value: "Japanese", aliases: ["Irezumi", "Japanese Traditional"] },
  { value: "Chicano", aliases: [] },
  { value: "Script", aliases: ["Lettering", "Typography"] },
  { value: "Minimalist", aliases: ["Minimalism"] },
  { value: "Geometric", aliases: [] },
  { value: "Ornamental", aliases: [] },
  { value: "Mandala", aliases: [] },
  { value: "Anime", aliases: [] },
  { value: "Illustrative", aliases: ["Illustration"] },
  { value: "Tribal", aliases: ["Polynesian", "Maori"] },
  { value: "Watercolor", aliases: ["Watercolour"] },
  { value: "Surrealism", aliases: ["Surrealist"] },
  { value: "New School", aliases: ["New-school"] },
  { value: "Abstract", aliases: [] },
  { value: "Sketch", aliases: ["Sketchwork", "Sketch Work"] },
  { value: "Trash Polka", aliases: [] },
  { value: "Biomechanical", aliases: ["Bio-mechanical"] },
  { value: "Micro Realism", aliases: ["Micro", "Microrealism", "Micro-realism"] },
] as const;

export type TattooStyle = (typeof TATTOO_STYLE_OPTIONS)[number]["value"];

export const TATTOO_STYLES = TATTOO_STYLE_OPTIONS.map(
  (option) => option.value
) as TattooStyle[];

export const FEATURED_TATTOO_STYLES: TattooStyle[] = [
  "Blackwork",
  "Black & Grey",
  "Fine Line",
  "Realism",
  "Traditional",
  "Neo-Traditional",
  "Japanese",
  "Chicano",
];

const normalizeTattooStyleToken = (style: string) =>
  style
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ");

export const resolveTattooStyle = (style: string): TattooStyle | "" => {
  const normalizedStyle = normalizeTattooStyleToken(style);
  if (!normalizedStyle) return "";

  const option = TATTOO_STYLE_OPTIONS.find((item) => {
    const terms = [item.value, ...item.aliases].map(normalizeTattooStyleToken);
    return terms.includes(normalizedStyle);
  });

  return option?.value || "";
};

export const getTattooStyleSearchTerms = (style: string) => {
  const resolvedStyle = resolveTattooStyle(style);
  const option = TATTOO_STYLE_OPTIONS.find(
    (item) => item.value === resolvedStyle
  );

  return [style, option?.value, ...(option?.aliases || [])]
    .filter((term): term is string => Boolean(term))
    .map(normalizeTattooStyleToken);
};

export const getTattooStyleLabel = (style: string) =>
  resolveTattooStyle(style) || style.trim();

export const getCanonicalTattooStyles = (styles: string[] | undefined) => {
  const seen = new Set<string>();

  return (styles || []).reduce<string[]>((result, style) => {
    const label = getTattooStyleLabel(style);
    const key = normalizeTattooStyleToken(label);
    if (!label || seen.has(key)) return result;

    seen.add(key);
    result.push(label);
    return result;
  }, []);
};

export const artistHasTattooStyle = (
  specialties: string[] | undefined,
  style: string
) => {
  if (!style) return true;

  const searchTerms = getTattooStyleSearchTerms(style);
  return Boolean(
    specialties?.some((specialty) =>
      searchTerms.includes(normalizeTattooStyleToken(specialty))
    )
  );
};
