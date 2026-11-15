/**
 * Plain share links (no third-party scripts, so the CSP stays as it is).
 * Every shared address carries UTM tags naming the network.
 */

export const SHARE_NETWORKS = ["linkedin", "x", "facebook", "whatsapp", "reddit", "telegram", "email"] as const;
export type ShareNetwork = (typeof SHARE_NETWORKS)[number];

export const SHARE_LABELS: Record<ShareNetwork | "copy", string> = {
  linkedin: "LinkedIn",
  x: "X",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  reddit: "Reddit",
  telegram: "Telegram",
  email: "Email",
  copy: "Copy link",
};

/** The page address with utm_source=<network>&utm_medium=social&utm_campaign=share. */
export function withUtm(url: string, source: string): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", "social");
  u.searchParams.set("utm_campaign", "share");
  return u.toString();
}

export function shareUrl(network: ShareNetwork, pageUrl: string, title: string): string {
  const url = withUtm(pageUrl, network);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  switch (network) {
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case "x":
      return `https://twitter.com/intent/tweet?url=${u}&text=${t}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`;
    case "reddit":
      return `https://www.reddit.com/submit?url=${u}&title=${t}`;
    case "telegram":
      return `https://t.me/share/url?url=${u}&text=${t}`;
    case "email":
      return `mailto:?subject=${t}&body=${encodeURIComponent(`${title}\n\n${url}`)}`;
  }
}

/** Open Graph + Twitter card tags for a shared public page, so previews render. */
export function socialMetadata(opts: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article" | "profile";
}) {
  return {
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: opts.path,
      type: opts.type ?? "website",
      siteName: "Remote AI Platform",
      images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "Remote AI Platform" }],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: opts.title,
      description: opts.description,
      images: ["/twitter-image.png"],
    },
  };
}
