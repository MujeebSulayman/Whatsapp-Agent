import { config } from 'dotenv';
config({ path: '../../.env' }); // backend/.env (cwd is backend/packages/db)
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  // Migrations use DIRECT_URL when set (Neon: the non-pooled string); otherwise the same DATABASE_URL as the app.
  datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://wa:wa@localhost:5432/wa' }
});
