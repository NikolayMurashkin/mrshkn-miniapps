import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    // SDK Telegram хранит состояние в модуле: инлайн нужен, чтобы vi.resetModules() давал тесту чистый SDK
    server: { deps: { inline: [/@telegram-apps\//] } },
  },
});
