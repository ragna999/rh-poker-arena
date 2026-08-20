import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const matchmakerModule = require('../../server/engine/redis-matchmaker.js');

export function getMatchmaker() {
  if (!(globalThis as any).__matchmaker) {
    (globalThis as any).__matchmaker = new matchmakerModule.RedisMatchmaker({
      minPlayers: 2,
      maxPlayers: 6,
      startingChips: 10000,
      smallBlind: 5,
      bigBlind: 10,
    });
  }
  return (globalThis as any).__matchmaker;
}
