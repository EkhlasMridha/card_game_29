// Privacy/legality audit: four headless clients play complete matches through a running host
// (npm start) and inspect every snapshot for leaked cards or hidden trump.
// Usage: node scripts/bot-audit.mjs [matches]
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const WebSocket = require('ws');

const WS_URL = process.env.WS_URL || 'ws://localhost:5050/ws';
const ORIGIN = WS_URL.replace(/^ws/, 'http').replace('/ws', '');
const MATCHES = Number(process.argv[2] || 2);
const rules = {
  preset: 'bangladesh', direction: 'counterclockwise', minBid: 16, biddingStyle: 'priority', allPass: 'redeal',
  lastTrickBonus: false, seventhCard: true, revealMode: 'mandatory',
  pair: { enabled: true, timing: 'afterRevealTrick', bidderReduction: 4, opponentIncrease: 4, minTarget: 16, bidderMinBid: 19 },
  doubling: 'redouble', redealFirstTwoNoPoints: true, redealSeventhCardWeak: true, matchTarget: 4,
};
const stats = { leaks: [], rejected: 0, matches: 0, msgs: 0, illegalTests: 0 };

function bot(name) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL, { headers: { Origin: ORIGIN } });
    const b = { name, ws, game: null, room: null, code: null, token: null, msgs: [] };
    b.send = (m) => ws.send(JSON.stringify({ v: 1, ...m }));
    ws.on('message', (d) => {
      stats.msgs++;
      const raw = d.toString();
      const m = JSON.parse(raw);
      b.msgs.push(m);
      if (m.type === 'ROOM_JOINED') { b.code = m.code; b.token = m.token; }
      if (m.type === 'STATE') { b.rev = m.rev; b.room = m.room; b.game = m.game; audit(b, m, raw); b.onState?.(); }
      if (m.type === 'ACTION_REJECTED') { stats.rejected++; b.actedRev = -1; }
      if (m.type === 'ERROR') { stats.errors = (stats.errors||0)+1; setTimeout(() => { b.actedRev = -1; }, 300); }
    });
    ws.on('open', () => resolve(b));
  });
}

// Every card a seat is not entitled to see must be absent from that seat's snapshot.
function audit(b, m, raw) {
  const g = m.game;
  if (!g) return;
  const me = g.yourSeat;
  if (!g.contract || g.phase === 'DEAL_SUMMARY' || g.phase === 'MATCH_FINISHED') return;
  if (g.contract.bidder !== me && !g.trump.revealed && g.trump.suit !== null) stats.leaks.push(`${b.name}: trump suit visible`);
  if (g.contract.bidder !== me && g.trump.seventhCard) stats.leaks.push(`${b.name}: seventh card visible`);
  // other hands: the snapshot only contains yourHand + played cards
  const visible = new Set([...g.yourHand, ...(g.currentTrick?.plays ?? []).map((p) => p.card), ...(g.lastTrick?.plays ?? []).map((p) => p.card)]);
  if (g.trump.seventhCard) visible.add(g.trump.seventhCard);
  const cards = raw.match(/"(10|[789JQKA])[HDCS]"/g) ?? [];
  for (const c of cards) if (!visible.has(c.slice(1, -1))) stats.leaks.push(`${b.name}: unexpected card ${c}`);
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];

function act(b, all) {
  if (b.actedRev === b.rev) return;
  b.actedRev = b.rev;
  const g = b.game;
  if (!g) return;
  const me = g.yourSeat;
  const a = g.actions;
  if (a.canDeclarePair) return b.send({ type: 'DECLARE_PAIR' });
  if (g.phase === 'DEAL_SUMMARY' && a.canContinue) return b.send({ type: 'CONTINUE' });
  if (g.turn !== me) return;
  if (g.phase === 'BIDDING') {
    const o = g.bidding.yourOptions;
    if (!o) return;
    const r = Math.random();
    if (o.canDitto && r < 0.4) return b.send({ type: 'DITTO_BID' });
    if (o.minBid <= o.maxBid && r < 0.6) return b.send({ type: 'PLACE_BID', amount: o.minBid });
    return b.send({ type: 'PASS_BID' });
  }
  if (g.phase === 'TRUMP_SELECTION' && a.canSelectTrump) return b.send({ type: 'SELECT_TRUMP', choice: Math.random() < 0.3 ? 'SEVENTH' : pick(['H', 'D', 'C', 'S']) });
  if (g.phase === 'DOUBLING' && a.canDouble) return b.send({ type: 'DOUBLE_DECISION', double: Math.random() < 0.1 });
  if (g.phase === 'PLAYING') {
    if (a.mustRequestReveal) return b.send({ type: 'REQUEST_TRUMP_REVEAL' });
    // Occasionally attempt an illegal play; the server must reject it.
    const illegal = g.yourHand.find((c) => !a.legalCards.includes(c));
    if (illegal && Math.random() < 0.15 && !b.triedIllegal) { b.triedIllegal = true; stats.illegalTests++; return b.send({ type: 'PLAY_CARD', card: illegal }); }
    b.triedIllegal = false;
    if (a.legalCards.length) return b.send({ type: 'PLAY_CARD', card: pick(a.legalCards) });
  }
}

const host = await bot('Host');
host.send({ type: 'CREATE_ROOM', name: 'Host', roomName: 'Bot table', rules });
await new Promise((r) => setTimeout(r, 200));
const others = [];
for (const n of ['Ana', 'Bilal', 'Chandra']) {
  const b = await bot(n);
  b.send({ type: 'JOIN_ROOM', code: host.code, name: n });
  others.push(b);
}
const all = [host, ...others];
await new Promise((r) => setTimeout(r, 300));

// Fifth player must be refused.
const fifth = await bot('Fifth');
fifth.send({ type: 'JOIN_ROOM', code: host.code, name: 'Fifth' });
await new Promise((r) => setTimeout(r, 200));
const fifthErr = fifth.msgs.find((m) => m.type === 'ERROR');
console.log('fifth player:', fifthErr?.code, fifthErr?.message);
fifth.ws.close();

// Acting for another seat is impossible: a non-host cannot start.
others[0].send({ type: 'START_GAME' });
await new Promise((r) => setTimeout(r, 100));
host.send({ type: 'START_GAME' });

let done = 0;
let reconnectTested = false;
await new Promise((resolve) => {
  const tick = () => {
    for (const b of all) {
      const g = b.game;
      if (g?.phase === 'MATCH_FINISHED') {
        if (b === host && !b.counted) {
          b.counted = true;
          stats.matches++;
          done++;
          if (done >= MATCHES) return resolve();
          setTimeout(() => { for (const x of all) x.counted = false; host.send({ type: 'END_MATCH' }); setTimeout(() => host.send({ type: 'START_GAME' }), 200); }, 100);
        }
        continue;
      }
      act(b, all);
    }
    // Reconnect test: drop Ana mid-play once and resume with her token.
    if (!reconnectTested && others[0].game?.phase === 'PLAYING' && others[0].game.trickNumber >= 3) {
      reconnectTested = true;
      const old = others[0];
      const hand = old.game.yourHand.join(',');
      old.ws.close();
      setTimeout(async () => {
        const nb = await bot('Ana');
        nb.send({ type: 'RESUME', code: old.code, token: old.token });
        nb.code = old.code; nb.token = old.token;
        setTimeout(() => {
          const ok = nb.game && nb.game.yourSeat === old.game.yourSeat;
          console.log('reconnect:', ok ? 'seat restored' : 'FAILED', '| hand same:', nb.game?.yourHand.join(',') === hand || '(hand changed by play)');
          others[0] = nb; all[1] = nb;
        }, 300);
      }, 300);
    }
    setTimeout(tick, 40);
  };
  tick();
});
console.log({ ...stats, leaks: stats.leaks.slice(0, 5), leakCount: stats.leaks.length });
const summaries = host.msgs.filter((m) => m.type === 'EVENT' && m.event.type === 'DEAL_SCORED').length;
console.log('deal summaries seen by host:', summaries);
for (const b of all) b.ws.close();
process.exit(0);
