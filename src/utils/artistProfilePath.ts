import slugify from "slugify";

export type ArtistProfileTarget = {
  id: string;
  slug?: string | null;
  displayName?: string | null;
  name?: string | null;
};

// Artist profiles live at the root (for example, /the-dev), so application
// routes must never be issued as artist slugs.
const RESERVED_ARTIST_SLUGS = new Set([
  "about",
  "admin",
  "api",
  "artist-dashboard",
  "artists",
  "assets",
  "client-dashboard",
  "client-posts",
  "client-profile-setup",
  "clients",
  "dashboard",
  "dev-add-docs",
  "flash",
  "flash-sheet",
  "login-page",
  "payment",
  "payment-success",
  "privacy",
  "robots",
  "sitemap",
  "signup",
  "terms",
]);

export const normalizeArtistSlug = (value: string | null | undefined) =>
  slugify(value || "", { lower: true, strict: true }).trim();

export const isReservedArtistSlug = (
  value: string | null | undefined
) => {
  const slug = normalizeArtistSlug(value);
  return !slug || RESERVED_ARTIST_SLUGS.has(slug);
};

export const getArtistProfileSlug = (artist: ArtistProfileTarget) => {
  const candidates = [artist.slug, artist.displayName, artist.name];

  for (const candidate of candidates) {
    const slug = normalizeArtistSlug(candidate);
    if (slug && !isReservedArtistSlug(slug)) return slug;
  }

  return "";
};

export const getArtistProfilePath = (artist: ArtistProfileTarget) => {
  const slug = getArtistProfileSlug(artist);
  return slug ? `/${slug}` : `/artists/${artist.id}`;
};
