import 'dotenv/config';

export const env = {
  PORT: Number(process.env.PORT || 4000),
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  DATABASE_URL: process.env.DATABASE_URL || '',
};
