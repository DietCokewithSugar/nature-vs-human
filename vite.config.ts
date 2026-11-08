/// <reference types="vitest/config" />
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/@supabase')) return 'supabase';
          return undefined;
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
