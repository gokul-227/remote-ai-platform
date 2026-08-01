-- Remote AI Platform PostgreSQL Initialization Script
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE SCHEMA IF NOT EXISTS keycloak;

-- Ensure database encoding is UTF8
SET client_encoding = 'UTF8';
