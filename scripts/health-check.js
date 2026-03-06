#!/usr/bin/env node
/**
 * Health check - pings backend /api/health
 * Run from cron to verify service is up
 */
import axios from 'axios';

const BACKEND_URL = process.env.BACKEND_URL || 'https://dividendflow-backend.onrender.com';

async function main() {
  try {
    const { data } = await axios.get(`${BACKEND_URL}/api/health`, { timeout: 10000 });
    console.log('Health OK:', data);
    process.exit(0);
  } catch (err) {
    console.error('Health check failed:', err.message);
    process.exit(1);
  }
}

main();
