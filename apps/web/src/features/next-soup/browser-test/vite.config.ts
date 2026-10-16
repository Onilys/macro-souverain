import { fileURLToPath } from 'node:url';
import tailwind from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import solidSvg from 'vite-plugin-solid-svg';
import tsconfigPaths from 'vite-tsconfig-paths';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [
    solid(),
    solidSvg({ defaultAsComponent: true }),
    tsconfigPaths({
      projects: [
        fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url)),
      ],
    }),
    tailwind(),
  ],
  resolve: {
    dedupe: ['solid-js'],
    alias: {
      '@core': fileURLToPath(new URL('../../../lib/core', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3027,
    strictPort: true,
    fs: {
      allow: [fileURLToPath(new URL('../../../../../..', import.meta.url))],
    },
  },
});
