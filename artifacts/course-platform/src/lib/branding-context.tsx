import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useTheme } from "@/lib/theme-context";

export interface Branding {
  siteName: string;
  /** Logo used on dark backgrounds (Dark + Midnight themes). Falls back
   *  for every theme when `siteLogoLight` is null. */
  siteLogo: string | null;
  /** Optional logo used on the LIGHT theme. When null, `siteLogo` is
   *  reused so the brand mark always shows up regardless of theme. */
  siteLogoLight: string | null;
  logoSize: number;
  logoSizeMobile: number;
  favicon: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

const DEFAULT: Branding = {
  siteName: "ClickOcean",
  siteLogo: null,
  siteLogoLight: null,
  logoSize: 34,
  logoSizeMobile: 28,
  favicon: null,
  metaTitle: null,
  metaDescription: null,
};

const BrandingContext = createContext<Branding>(DEFAULT);

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT);

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/public/branding`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .then((data: Branding | null) => {
        if (data) setBranding({ ...DEFAULT, ...data });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Update every favicon-ish <link> (icon, shortcut icon, apple-touch-icon)
    // so desktop AND mobile (iOS home-screen, Android tab) all reflect the
    // brand favicon. When no brand favicon is set, fall back to a transparent
    // 1x1 PNG so no default mark is shown anywhere.
    const TRANSPARENT_PNG =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const href = branding.favicon || TRANSPARENT_PNG;
    const links = document.querySelectorAll<HTMLLinkElement>(
      "link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']"
    );
    links.forEach(link => {
      if (branding.favicon) link.removeAttribute("type");
      link.href = href;
    });
  }, [branding.favicon]);

  useEffect(() => {
    document.title = branding.metaTitle || branding.siteName || "Academy";
  }, [branding.metaTitle, branding.siteName]);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}

/**
 * Picks the right uploaded logo URL for the active theme.
 *   • Light theme → `siteLogoLight` (falls back to `siteLogo` if not set)
 *   • Dark / Midnight → `siteLogo` (falls back to `siteLogoLight` if not set)
 * Returns `null` when neither logo has been uploaded — callers should
 * render their built-in `UpcalifyLogo` fallback in that case.
 */
export function useThemedLogo(): string | null {
  const { siteLogo, siteLogoLight } = useBranding();
  const { theme } = useTheme();
  if (theme === "light") return siteLogoLight || siteLogo || null;
  return siteLogo || siteLogoLight || null;
}
