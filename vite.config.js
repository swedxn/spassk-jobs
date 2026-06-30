import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/spassk-jobs/',
  plugins: [react()],
  build: {
    target: 'es2022',
    cssMinify: 'lightningcss',
    sourcemap: false,
  },
});
