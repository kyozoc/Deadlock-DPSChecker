import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages では https://kyozoc.github.io/Deadlock-DPSChecker/ に置かれる
  base: '/Deadlock-DPSChecker/',
  plugins: [react()],
  build: {
    // ゲームデータ JSON (約600KB) を同梱しているため。gzip 後は十分小さい
    chunkSizeWarningLimit: 1000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
