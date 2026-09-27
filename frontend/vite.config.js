import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend dev server on :5173. API/socket base URLs come from env
// (VITE_API_URL) so the same build works locally and in production.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
