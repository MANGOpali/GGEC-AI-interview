import { configure } from './config.js';
const days = Number(process.env.RETENTION_DAYS || 90);
if (!Number.isInteger(days) || days < 1)
  throw new Error('RETENTION_DAYS must be a positive integer.');
const { repo } = await configure();
console.log(`Purged ${await repo.cleanup(days)} answer transcripts.`);
