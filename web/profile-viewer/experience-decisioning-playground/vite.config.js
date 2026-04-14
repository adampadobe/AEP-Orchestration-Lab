import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Embeds under Data viewer; built assets go to ../experience-decisioning
export default defineConfig({
  plugins: [react()],
  base: '/profile-viewer/experience-decisioning/',
  server: { open: true },
  build: {
    outDir: '../experience-decisioning',
    emptyOutDir: true,
    cssCodeSplit: false,
    codeSplitting: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/edp.js',
        assetFileNames: (assetInfo) =>
          assetInfo.name && assetInfo.name.endsWith('.css') ? 'assets/edp.css' : 'assets/edp-[name][extname]',
      },
    },
  },
});
