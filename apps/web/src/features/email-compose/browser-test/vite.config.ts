import { fileURLToPath } from 'node:url';
import tailwind from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import solidSvg from 'vite-plugin-solid-svg';
import tsconfigPaths from 'vite-tsconfig-paths';

const directory = fileURLToPath(new URL('.', import.meta.url));
const webDirectory = fileURLToPath(new URL('../../../../', import.meta.url));
const workspaceDirectory = fileURLToPath(
  new URL('../../../../../../', import.meta.url)
);

export default defineConfig({
  root: directory,
  cacheDir: `${directory}/.vite`,
  plugins: [
    {
      name: 'sender-fixture-context',
      enforce: 'pre',
      resolveId(source, importer) {
        if (
          importer?.endsWith('/email-view/components/EmailInboxSelector.tsx') &&
          source === '../email-view-context'
        )
          return fileURLToPath(
            new URL('./sender-adapters.tsx', import.meta.url)
          );
      },
    },
    solidPlugin(),
    solidSvg({ defaultAsComponent: true }),
    tsconfigPaths({ projects: [`${webDirectory}/tsconfig.json`] }),
    tailwind(),
  ],
  resolve: {
    dedupe: ['solid-js'],
    alias: {
      '@ui': fileURLToPath(new URL('./ui-shim.ts', import.meta.url)),
      ...Object.fromEntries(
        [
          '@core/component/UserIcon',
          '@core/component/inboxIcon',
          '@queries/email/mail-accounts',
          '@app/lib/analytics/posthog',
          '@core/email-link',
          '@app/components/view-shell',
        ].map((name) => [
          name,
          fileURLToPath(new URL('./sender-adapters.tsx', import.meta.url)),
        ])
      ),
      'loro-crdt': 'loro-crdt/base64',
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3018,
    strictPort: true,
    fs: { allow: [workspaceDirectory] },
  },
  build: {
    target: 'esnext',
    outDir: `${directory}/.dist`,
    emptyOutDir: true,
  },
});
