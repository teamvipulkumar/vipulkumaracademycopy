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
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (branding.favicon) {
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = branding.favicon;
    }
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
