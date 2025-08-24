import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Configure base path for GitHub Pages deployment
  // This will be '/' for TradingGoose.github.io
  base: '/',
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Ensure assets are properly referenced with base path
    assetsDir: 'assets',
    sourcemap: false, // Disable sourcemaps for production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    target: 'es2015',
    modulePreload: {
      polyfill: true,
    },
    rollupOptions: {
      output: {
        // Ensure JS files have proper extensions and format for GitHub Pages
        format: 'es',
        entryFileNames: '[name]-[hash].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.names?.[0] || '';
          if (/\.(css)$/.test(info)) {
            return 'css/[name]-[hash][extname]';
          }
          if (/\.(png|jpg|jpeg|gif|svg|ico|webp)$/.test(info)) {
            return 'images/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
        manualChunks: undefined
      }
    }
  },
}));
