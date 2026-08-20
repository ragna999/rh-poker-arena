// Re-export db functions for Next.js TypeScript
// The actual implementation is in ../../db/redis.js

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const redisModule = require('../../db/redis.js');

export const createAgent = redisModule.createAgent;
export const getAgent = redisModule.getAgent;
export const getAgentByApiKey = redisModule.getAgentByApiKey;
export const getAgentByWallet = redisModule.getAgentByWallet;
export const updateAgent = redisModule.updateAgent;
export const updateChips = redisModule.updateChips;
export const recordHandResult = redisModule.recordHandResult;
export const getLeaderboard = redisModule.getLeaderboard;
export const recordHand = redisModule.recordHand;
export const getRecentHands = redisModule.getRecentHands;
export const getStats = redisModule.getStats;
export const getRedis = redisModule.getRedis;
