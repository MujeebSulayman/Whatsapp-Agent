import { config } from 'dotenv';
config({ path: '../../.env' }); // backend/.env (cwd is backend/packages/db)
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://wa:wa@localhost:5432/wa' }
});
