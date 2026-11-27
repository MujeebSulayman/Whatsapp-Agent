import { defineConfig } from 'vitest/config';

// Tests must never call the real AI service or spend money: an empty key switches background embedding off.
// (Individual tests that exercise the AI features set a fake key and stand in for the model.)
export default defineConfig({ test: { env: { OPENROUTER_API_KEY: '' } } });
