import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // Как в интеграционном: мок `@/payload.config` покрывает и импорт через `@payload-config` — это один файл.
      '@payload-config': fileURLToPath(new URL('./src/payload.config.ts', import.meta.url)),
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
