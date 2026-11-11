function getDatabaseOptions() {
  const useSsl = process.env.DATABASE_SSL === 'true' || process.env.NODE_ENV === 'production';
  const connectionString = process.env.DATABASE_URL?.trim();

  const options = connectionString
    ? { connectionString }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number.parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'bingnondo_db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
      };

  return {
    ...options,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  };
}

module.exports = getDatabaseOptions;
