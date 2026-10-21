import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages では https://kyozoc.github.io/Deadlock-DPSChecker/ に置かれる
  base: '/Deadlock-DPSChecker/',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
