import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Phaser's source gates optional features behind `typeof FLAG` checks that its
 * own webpack build replaces with literals. esbuild's `define` cannot target
 * `typeof` expressions, so this replaces them in Phaser's source files during
 * the production build, letting the minifier drop the unused branches.
 */
const PHASER_FLAGS: Record<string, boolean> = {
  CANVAS_RENDERER: true,
  WEBGL_RENDERER: true,
  WEBGL_DEBUG: false,
  EXPERIMENTAL: false,
  PLUGIN_3D: false,
  PLUGIN_CAMERA3D: false,
  PLUGIN_FBINSTANT: false,
  FEATURE_SOUND: false, // the game's audio uses Web Audio directly (src/audio)
};

function phaserFlags(): Plugin {
  const pattern = new RegExp(`typeof (${Object.keys(PHASER_FLAGS).join('|')})\\b`, 'g');
  return {
    name: 'phaser-feature-flags',
    enforce: 'pre',
    apply: 'build',
    transform(code, id) {
      if (!/[\\/]phaser[\\/]src[\\/]/.test(id) || !code.includes('typeof ')) return null;
      return { code: code.replace(pattern, (_, flag: string) => String(PHASER_FLAGS[flag])), map: null };
    },
  };
}

// The production build is served by the Node host (apps/server); this dev
// server is only for development and proxies the WebSocket to the host.
export default defineConfig({
  plugins: [phaserFlags(), react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@twentynine/shared', replacement: fileURLToPath(new URL('../../packages/shared/src/browser.ts', import.meta.url)) },
      // Slim Phaser (core + Container); see src/game/phaser/phaserCore.js.
      { find: /^phaser$/, replacement: fileURLToPath(new URL('./src/game/phaser/phaserCore.js', import.meta.url)) },
    ],
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:5050', ws: true },
      '/api': { target: 'http://localhost:5050' },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    reportCompressedSize: true,
    cssMinify: 'lightningcss',
    minify: 'terser',
    terserOptions: {
      ecma: 2020,
      module: true,
      toplevel: true,
      // Safe options only: Phaser's class system needs real function prototypes,
      // which unsafe_arrows / unsafe_methods would remove.
      compress: { passes: 3, drop_debugger: true },
      mangle: { toplevel: true },
      format: { comments: false },
    },
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: React (incl. react-dom/client + scheduler) and Phaser.
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (/[\\/]node_modules[\\/]phaser[\\/]/.test(id) || id.includes('phaserCore')) return 'phaser';
          return undefined;
        },
      },
    },
  },
});
