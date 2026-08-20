// Re-export db functions for Next.js
// Uses dynamic import to handle CommonJS modules

let redisModule: any = null;

async function getRedisModule() {
  if (!redisModule) {
    redisModule = await import('../../db/redis.js');
  }
  return redisModule;
}

export async function createAgent(...args: any[]) {
  const mod = await getRedisModule();
  return mod.createAgent(...args);
}

export async function getAgent(...args: any[]) {
  const mod = await getRedisModule();
  return mod.getAgent(...args);
}

export async function getAgentByApiKey(...args: any[]) {
  const mod = await getRedisModule();
  return mod.getAgentByApiKey(...args);
}

export async function getAgentByWallet(...args: any[]) {
  const mod = await getRedisModule();
  return mod.getAgentByWallet(...args);
}

export async function updateAgent(...args: any[]) {
  const mod = await getRedisModule();
  return mod.updateAgent(...args);
}

export async function updateChips(...args: any[]) {
  const mod = await getRedisModule();
  return mod.updateChips(...args);
}

export async function recordHandResult(...args: any[]) {
  const mod = await getRedisModule();
  return mod.recordHandResult(...args);
}

export async function getLeaderboard(...args: any[]) {
  const mod = await getRedisModule();
  return mod.getLeaderboard(...args);
}

export async function recordHand(...args: any[]) {
  const mod = await getRedisModule();
  return mod.recordHand(...args);
}

export async function getRecentHands(...args: any[]) {
  const mod = await getRedisModule();
  return mod.getRecentHands(...args);
}

export async function getStats() {
  const mod = await getRedisModule();
  return mod.getStats();
}

export async function getRedis() {
  const mod = await getRedisModule();
  return mod.getRedis();
}
