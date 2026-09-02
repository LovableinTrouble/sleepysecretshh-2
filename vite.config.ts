// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Lovable Cloud's public client configuration is safe to ship to browsers.
// Keep explicit fallbacks here so auth still initializes when a production
// deployment does not forward workspace environment variables into Vite.
const cloudUrl = "https://fuqmlxjbwajgvjaeeodo.supabase.co";
const cloudPublishableKey = "sb_publishable_J3v5tnrNGtRjMDa_ECQPHA_mZyG4x_Y";

export default defineConfig({
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(cloudUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(cloudPublishableKey),
      "process.env.SUPABASE_URL": JSON.stringify(cloudUrl),
      "process.env.SUPABASE_PUBLISHABLE_KEY": JSON.stringify(cloudPublishableKey),
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
