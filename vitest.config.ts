import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules', 'dist', '**/*.rules.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/features/planning/services/decisionEngine.ts',
        'src/features/planning/services/mpps7Parser.ts',
        'src/features/planning/services/mpps7ImportService.ts',
        'src/config/rolePermissions.ts'
      ]
    }
  },
});
