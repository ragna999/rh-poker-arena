// Re-export matchmaker for Next.js
// Uses dynamic import to handle CommonJS modules

let matchmakerModule: any = null;

async function getMatchmakerModule() {
  if (!matchmakerModule) {
    matchmakerModule = await import('../../server/engine/redis-matchmaker.js');
  }
  return matchmakerModule;
}

let instance: any = null;

export async function getMatchmaker() {
  if (!instance) {
    const mod = await getMatchmakerModule();
    instance = new mod.RedisMatchmaker({
      minPlayers: 2,
      maxPlayers: 6,
      startingChips: 10000,
      smallBlind: 5,
      bigBlind: 10,
    });
  }
  return instance;
}
