import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface Branding {
  siteName: string;
  siteLogo: string | null;
  logoSize: number;
  logoSizeMobile: number;
  favicon: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

const DEFAULT: Branding = {
  siteName: "ClickOcean",
  siteLogo: null,
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
