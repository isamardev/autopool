-- Prisma migrate uses PostgreSQL advisory locks. A crashed migrate / pooled connection can leave a
-- session holding the lock → P1002 (10s timeout). This terminates OTHER backends holding advisory
-- locks on the current database only. Use on a dedicated Neon DB; avoid on shared Postgres.
SELECT pg_terminate_backend(l.pid) AS terminated
FROM pg_locks AS l
WHERE l.locktype = 'advisory'
  AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND l.pid IS NOT NULL
  AND l.pid <> pg_backend_pid();
