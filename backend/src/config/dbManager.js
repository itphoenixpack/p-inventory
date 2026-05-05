const { Pool } = require('pg');
const knex = require('knex');
const knexConfig = require('../../knexfile');

const normalizeCompany = (value) => {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'phoenix' || v === 'phx') return 'phoenix';
  if (v === 'impack' || v === 'inpack' || v === 'imp' || v === 'inp') return 'impack';
  return null;
};

const commonConfig = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  password: process.env.DB_PASSWORD || 'root',
  port: Number(process.env.DB_PORT || 5432),
};

const getPoolConfig = (dbEnvName, defaultDbName, urlEnvName) => {
  if (process.env[urlEnvName]) {
    return {
      connectionString: process.env[urlEnvName],
      ssl: { rejectUnauthorized: false }
    };
  } else if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    };
  }
  return {
    ...commonConfig,
    database: process.env[dbEnvName] || defaultDbName
  };
};

const phoenixPool = new Pool(getPoolConfig('PHOENIX_DB', 'inventory_system', 'DATABASE_URL'));
const impackPool = new Pool(getPoolConfig('IMPACK_DB', 'impack_db', 'DATABASE_URL_IMPACK'));

// Knex Instances helper
const createKnex = (config) => {
  const connection = config.connectionString ? { connectionString: config.connectionString, ssl: config.ssl } : config;
  return knex({
    client: 'pg',
    connection: connection,
    pool: { min: 2, max: 10 }
  });
};

const phoenixKnex = createKnex(getPoolConfig('PHOENIX_DB', 'inventory_system', 'DATABASE_URL'));
const impackKnex = createKnex(getPoolConfig('IMPACK_DB', 'impack_db', 'DATABASE_URL_IMPACK'));

const getDB = (companyRaw) => {
  const company = normalizeCompany(companyRaw) || 'phoenix';
  if (company === 'phoenix') return phoenixPool;
  if (company === 'impack') return impackPool;
  return phoenixPool;
};

const getKnex = (companyRaw) => {
  const company = normalizeCompany(companyRaw) || 'phoenix';
  if (company === 'phoenix') return phoenixKnex;
  if (company === 'impack') return impackKnex;
  return phoenixKnex;
};

module.exports = {
  getDB,
  getKnex,
  normalizeCompany,
  pools: { phoenixPool, impackPool },
  knexs: { phoenixKnex, impackKnex },
};

