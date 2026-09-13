import { contentPages } from "./pageContent";

export const SITE_URL = "https://www.satxink.com";
export const SOCIAL_IMAGE = `${SITE_URL}/media/satx-ink-social-card.png`;

type PageMetadata = { title: string; description: string; path: string; indexable: boolean };

// Only real, public routes belong here. This list also drives HTML and sitemap output.
export const publicPages: PageMetadata[] = [
  {
    path: "/",
    title: "Tattoo Shop Software & Booking Websites in Texas | SATX INK",
    description: "Tattoo shop software for artist invitations, flash sheets, booking requests and Stripe deposits. Branded websites or portals. Texas launch: September 20, 2026.",
    indexable: true,
  },
  {
    path: "/privacy",
    title: "Privacy Policy | SATX INK",
    description: "Learn how the SATX INK marketing website handles demo inquiries, browsing information and questions about your information.",
    indexable: true,
  },
  {
    path: "/terms",
    title: "Website Information & Terms | SATX INK",
    description: "Information about the SATX INK software website, demo inquiries, shop installations, third-party services and illustrative product visuals.",
    indexable: true,
  },
  ...contentPages.map(({ path, title, description }) => ({ path, title, description, indexable: true })),
];

export function getPageMetadata(pathname: string): PageMetadata {
  const path = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  return publicPages.find(page => page.path === path) ?? {
    path, title: "Page Not Found | SATX INK",
    description: "This page is no longer available. Explore SATX INK tattoo shop software or contact us about your shop.",
    indexable: false,
  };
}

export function getStructuredData(page: PageMetadata) {
  if (!page.indexable) return null;
  if (page.path !== "/") {
    const contentPage = contentPages.find(item => item.path === page.path);
    if (!contentPage) return null;
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: contentPage.label, item: `${SITE_URL}${page.path}` },
      ],
    };
  }
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization", "@id": `${SITE_URL}/#organization`,
        name: "SATX INK", url: `${SITE_URL}/`,
        logo: `${SITE_URL}/apple-touch-icon-modern.png`, email: "support@satxink.com",
        description: "Tattoo shop software with branded websites, artist workspaces, flash publishing and booking tools. Initial service area: Texas.",
      },
      {
        "@type": "WebSite", "@id": `${SITE_URL}/#website`,
        name: "SATX INK", alternateName: "SATX Ink", url: `${SITE_URL}/`,
        publisher: { "@id": `${SITE_URL}/#organization` }, inLanguage: "en-US",
      },
    ],
  };
}

export function getMetaTags(page: PageMetadata) {
  return [
    { name: "description", content: page.description },
    { name: "robots", content: page.indexable ? "index, follow, max-image-preview:large" : "noindex, follow" },
    { property: "og:title", content: page.title },
    { property: "og:description", content: page.description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "SATX INK" },
    { property: "og:locale", content: "en_US" },
    ...(page.indexable ? [{ property: "og:url", content: `${SITE_URL}${page.path}` }] : []),
    { property: "og:image", content: SOCIAL_IMAGE },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: "SATX INK tattoo shop software: flash collection in a demo studio." },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: page.title },
    { name: "twitter:description", content: page.description },
    { name: "twitter:image", content: SOCIAL_IMAGE },
    { name: "twitter:image:alt", content: "SATX INK tattoo shop software: flash collection in a demo studio." },
  ];
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function serializeStructuredData(value: object) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function renderSeoHead(pathname: string) {
  const page = getPageMetadata(pathname);
  const structuredData = getStructuredData(page);
  return [
    `<title>${escapeHtml(page.title)}</title>`,
    ...getMetaTags(page).map(({ name, property, content }) =>
      `<meta data-seo="true" ${name ? `name="${name}"` : `property="${property}"`} content="${escapeHtml(content)}" />`),
    ...(page.indexable ? [`<link data-seo="true" rel="canonical" href="${SITE_URL}${page.path}" />`] : []),
    ...(structuredData ? [`<script data-seo="true" type="application/ld+json">${serializeStructuredData(structuredData)}</script>`] : []),
  ].join("\n    ");
}

export function updateSeoHead(pathname: string) {
  const page = getPageMetadata(pathname);
  document.title = page.title;
  document.head.querySelectorAll("[data-seo]").forEach(element => element.remove());
  for (const { name, property, content } of getMetaTags(page)) {
    const meta = document.createElement("meta");
    meta.dataset.seo = "true";
    if (name) meta.name = name;
    else meta.setAttribute("property", property!);
    meta.content = content;
    document.head.appendChild(meta);
  }
  if (page.indexable) {
    const canonical = document.createElement("link");
    canonical.dataset.seo = "true";
    canonical.rel = "canonical";
    canonical.href = `${SITE_URL}${page.path}`;
    document.head.appendChild(canonical);
  }
  const structuredData = getStructuredData(page);
  if (structuredData) {
    const script = document.createElement("script");
    script.dataset.seo = "true";
    script.type = "application/ld+json";
    script.textContent = serializeStructuredData(structuredData);
    document.head.appendChild(script);
  }
}
