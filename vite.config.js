// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    watch: {
      usePolling: true,
      interval: 100 // ms; increase or decrease as needed
    }
  }
});