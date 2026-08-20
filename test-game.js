const http = require('http');
const API_PORT = 3001;

function req(method, path, data, hdrs) {
  return new Promise((resolve, reject) => {
    const opts = { method, hostname: 'localhost', port: API_PORT, path, headers: { ...hdrs } };
    if (data) {
      const body = JSON.stringify(data);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }
    const r = http.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ error: d }); } });
    });
    r.on('error', reject);
    if (data) r.write(JSON.stringify(data));
    r.end();
  });
}

const RV = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14};
function rv(c) { return RV[c[0]] || 0; }

async function main() {
  const app = require('./server/app');
  const server = app.listen(API_PORT, () => console.log('Test server on ' + API_PORT));

  // Clear Redis first
  try {
    const { Redis } = require('@upstash/redis');
    const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
    const keys = await redis.keys('rh:*');
    for (const k of keys) await redis.del(k);
    console.log('Cleared', keys.length, 'Redis keys');
  } catch(e) { console.log('Redis clear skipped:', e.message); }

  await new Promise(r => setTimeout(r, 500));

  // Register
  const a1 = await req('POST', '/api/register', { walletAddress: '0xaaa1111', handle: 'hero' });
  const a2 = await req('POST', '/api/register', { walletAddress: '0xbbbb2222', handle: 'villain' });
  console.log(`hero: ${a1.agentId} | villain: ${a2.agentId}`);

  // Join
  const j1 = await req('POST', '/api/join', {}, { 'x-api-key': a1.apiKey });
  const j2 = await req('POST', '/api/join', {}, { 'x-api-key': a2.apiKey });
  console.log(`Join: ${j1.status} ${j2.status}`);
  await new Promise(r => setTimeout(r, 500));

  // Play 5 hands
  let handsPlayed = 0;
  for (let h = 0; h < 5; h++) {
    await new Promise(r => setTimeout(r, 1000));
    
    for (let step = 0; step < 40; step++) {
      let handDone = false;
      
      for (const [name, agent] of [['hero', a1], ['villain', a2]]) {
        const p = await req('GET', '/api/pending', null, { 'x-api-key': agent.apiKey });
        if (!p.tables || !p.tables.length) continue;
        const t = p.tables[0];
        
        // Check cached showdown
        if (t.lastHand && t.lastHand.winners) {
          const w = t.lastHand.winners[0];
          handsPlayed++;
          console.log(`  Hand ${handsPlayed}: pot=${t.lastHand.pot} ${w.hand} board=${t.lastHand.board.join(' ')}`);
          handDone = true;
          break;
        }
        
        if (!t.isMyTurn || !t.actions || !t.actions.length) continue;
        
        const cards = t.holeCards || [];
        const r1 = rv(cards[0]) || 0;
        const r2 = rv(cards[1]) || 0;
        const high = Math.max(r1, r2);
        
        let act = 'fold';
        let amt = 0;
        
        if (t.actions.includes('check')) {
          act = 'check';
        } else if (t.actions.includes('call')) {
          // Only call if cheap or have a decent hand
          if (t.callAmount <= 15 || high >= 12) {
            act = 'call';
            amt = t.callAmount;
          }
        }
        
        // Raise less aggressively
        if (t.actions.includes('raise') && high >= 13 && t.pot < 50 && step < 5) {
          act = 'raise';
          amt = Math.min(20, t.chips);
        }
        
        await req('POST', '/api/action', { tableId: t.tableId, action: act, amount: amt }, { 'x-api-key': agent.apiKey });
      }
      
      if (handDone) break;
    }
  }

  console.log(`\n=== ${handsPlayed} hands played ===`);
  
  const lb = await req('GET', '/api/leaderboard');
  for (const x of lb) {
    if (x.handsPlayed > 0) {
      const profit = x.chips - 10000;
      console.log(`  ${x.name} ${x.chips}ch (${profit >= 0 ? '+' : ''}${profit}) ${x.handsPlayed}h ${x.handsWon}w ${x.winRate}%`);
    }
  }

  server.close();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
