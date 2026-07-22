import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL || 'http://localhost:4501';
  const port = Number(env.VITE_PORT) || 4500;

  return {
    plugins: [react()],
    server: {
      port,
      proxy: {
        '/api': apiUrl,
      },
    },
  };
});
