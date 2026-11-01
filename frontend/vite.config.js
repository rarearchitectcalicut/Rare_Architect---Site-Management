
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const { VITE_BASE_PATH = '/' } = loadEnv(mode, process.cwd(), 'VITE_')

  if (
    !VITE_BASE_PATH.startsWith('/') ||
    !VITE_BASE_PATH.endsWith('/') ||
    /[?#]/.test(VITE_BASE_PATH)
  ) {
    throw new Error(
      'VITE_BASE_PATH must be an absolute pathname ending in /'
    )
  }

  const base = VITE_BASE_PATH.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  )

  // Only React routes get the public shell.
  // Django admin and other backend routes remain server-controlled.
  const id = '[0-9a-fA-F-]{36}'

  const admin = `admin/(?:dashboard|settings|projects(?:/(?:new|${id})(?:/(?:tasks(?:/${id})?|daily-reports|documents|delays))?)?|categories/[^/?]+|tasks|approvals|supervisors(?:/(?:new|[0-9]+|${id}))?|reports|daily-reports|documents|delays|notifications|activity)`

  const supervisor = `supervisor/(?:dashboard|settings|projects(?:/${id}(?:/(?:tasks|timeline|delays|documents|daily-reports|overview))?)?|tasks|reports|documents|delays|notifications)`

  return {
    base: VITE_BASE_PATH,

    // ------------------------------------
    // LOCAL DEVELOPMENT + PHONE LAN ACCESS
    // ------------------------------------
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,

      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        '/media': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },

    plugins: [
      react(),

      tailwindcss(),

      VitePWA({
        strategies: 'generateSW',

        registerType: 'prompt',

        injectRegister: false,

        includeAssets: [
          'rare-logo.png',
          'apple-touch-icon.png',
        ],

        manifest: {
          id: '.',

          name: 'RARE | Project & Site Management',

          short_name: 'RARE',

          description:
            'RARE Architect - Project & Site Management System',

          lang: 'en',

          start_url: '.',

          scope: '.',

          display: 'standalone',

          theme_color: '#f1eadf',

          background_color: '#f1eadf',

          icons: [
            {
              src: 'pwa-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },

        workbox: {
          cacheId: 'rare-static',

          // Cache only public frontend build files.
          // Do not cache authenticated API responses,
          // private documents, or report attachments.
          globPatterns: [
            'index.html',
            'assets/*.{js,css,woff,woff2}',
            'assets/rare-logo-*.png',
          ],

          runtimeCaching: [],

          navigateFallback: 'index.html',

          navigateFallbackAllowlist: [
            new RegExp(
              `^${base}(?:login|change-password|unauthorized|${admin}|${supervisor})?(?:\\?.*)?$`
            ),
          ],

          cleanupOutdatedCaches: true,

          skipWaiting: false,

          clientsClaim: false,
        },

        // Keep service worker disabled during normal Vite development.
        devOptions: {
          enabled: false,
        },
      }),
    ],
  }
})
