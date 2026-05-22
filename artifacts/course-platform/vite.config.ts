import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const port = Number(process.env.PORT) || 3000;

const basePath = process.env.BASE_PATH || "/";

function pixelHeadInjectorPlugin(): Plugin {
  return {
    name: "pixel-head-injector",
    transformIndexHtml: {
      order: "post",
      async handler(html) {
        try {
          const resp = await fetch("http://localhost:8080/api/pixel-config");
          if (!resp.ok) return html;
          const data = await resp.json() as { enabled: boolean; pixelId: string | null; baseCode: string | null };
          if (!data.enabled) return html;
          if (data.baseCode && data.baseCode.trim()) {
            return html.replace("</head>", `${data.baseCode.trim()}\n</head>`);
          }
          if (data.pixelId) {
            const fallback = `<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${data.pixelId}');fbq('track','PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=${data.pixelId}&ev=PageView&noscript=1"/></noscript>
<!-- End Meta Pixel Code -->`;
            return html.replace("</head>", `${fallback}\n</head>`);
          }
        } catch {
          // API not yet ready — silently skip injection
        }
        return html;
      },
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    pixelHeadInjectorPlugin(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay({
      filter: (err: { message?: string; name?: string }) =>
        !(err.message === "signal is aborted without reason" || err.name === "AbortError"),
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
