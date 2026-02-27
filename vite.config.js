import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        port: 3000,
        open: true,
        proxy: {
            '/api/infodengue': {
                target: 'https://info.dengue.mat.br',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/infodengue/, '/api'),
                secure: false,
            },
        },
    },
    build: {
        outDir: 'dist',
    },
});
