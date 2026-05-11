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
  siteName: "Vipul Kumar Academy",
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
    // Favicon resolution order:
    //   1. explicit branding.favicon (admin-uploaded favicon)
    //   2. branding.siteLogo (so a tenant who only uploaded a logo still
    //      gets a brand mark in the tab / home-screen)
    //   3. branding.siteLogoLight (last-ditch fallback)
    //   4. nothing — leave the default favicon.svg from index.html in place.
    //
    // We update every favicon-ish <link> (icon, shortcut icon,
    // apple-touch-icon) so desktop AND mobile (iOS home-screen, Android tab)
    // all reflect the resolved icon.
    const resolved = branding.favicon || branding.siteLogo || branding.siteLogoLight || null;
    if (!resolved) return;
    const links = document.querySelectorAll<HTMLLinkElement>(
      "link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']"
    );
    links.forEach(link => {
      link.removeAttribute("type");
      link.href = resolved;
    });
  }, [branding.favicon, branding.siteLogo, branding.siteLogoLight]);

  useEffect(() => {
    document.title = branding.metaTitle || branding.siteName || "Vipul Kumar Academy";
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
