import { analyzeRemainingRewards, calculateBankerOffer, chooseBanker, chooseMood, nextRiskScore } from './bankers.mjs';

export const PRIZES = [1, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 750_000, 1_000_000, 2_500_000, 3_000_000, 5_000_000, 5_000_000];
export const ROUND_CONFIG_BY_PLAYER_COUNT = Object.freeze({
  1: Object.freeze([5, 4, 3, 3, 3, 2, 2, 1, 1]),
  2: Object.freeze([5, 4, 4, 3, 3, 2, 1, 1]),
  3: Object.freeze([5, 4, 3, 3, 2, 2, 2, 1]),
  4: Object.freeze([4, 4, 3, 3, 2, 2, 2, 1])
});
// Eski entegrasyonlar için tek oyunculu varsayılanı korur.
export const ROUND_SIZES = ROUND_CONFIG_BY_PLAYER_COUNT[1];

export function getRoundConfiguration(playerCount) {
  const count = Number(playerCount);
  if (!Number.isInteger(count) || !ROUND_CONFIG_BY_PLAYER_COUNT[count]) throw new Error('Oyuncu sayısı 1 ile 4 arasında olmalı.');
  return [...ROUND_CONFIG_BY_PLAYER_COUNT[count]];
}

export function shuffled(values, random = Math.random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function normalizeOptions(randomOrOptions, playerCount) {
  if (typeof randomOrOptions === 'object' && randomOrOptions !== null) return { random: randomOrOptions.random ?? Math.random, playerCount: randomOrOptions.playerCount ?? 1, seed: randomOrOptions.seed };
  return { random: randomOrOptions ?? Math.random, playerCount };
}

export function createGame(randomOrOptions = Math.random, suppliedPlayerCount = 1) {
  const { random, playerCount, seed: suppliedSeed } = normalizeOptions(randomOrOptions, suppliedPlayerCount);
  const count = Math.min(4, Math.max(1, Number(playerCount) || 1));
  const seed = Number.isFinite(suppliedSeed) ? Math.floor(suppliedSeed) >>> 0 : Math.floor(random() * 4294967296) >>> 0;
  const banker = chooseBanker(seed);
  return {
    boxes: shuffled(PRIZES, random).map((amount, index) => ({ id: index + 1, amount, opened: false })),
    players: Array.from({ length: count }, (_, index) => ({ id: index + 1, boxId: null, status: 'active', dealAmount: null, riskScore: 0, offerHistory: [] })),
    playerBoxId: null, playerCount: count, roundConfiguration: getRoundConfiguration(count), gameSeed: seed,
    banker: { ...banker, mood: chooseMood(seed) }, currentPlayerId: 1, selectionCursorPlayerId: 1,
    round: 0, openedThisRound: 0, status: 'selecting', offer: null, offerPlayerIds: [], offerDecisionIndex: 0,
    offerReturnPlayerId: null, bankerPhase: null, bankerHistory: [], finalOffer: false, decisions: []
  };
}

export function activePlayers(game) { return game.players.filter((player) => player.status === 'active' && player.boxId !== null); }
export function currentPlayer(game) { return game.players.find((player) => player.id === game.currentPlayerId) ?? game.players[0]; }
export function protectedBoxIds(game) { return activePlayers(game).map((player) => player.boxId); }
export function selectableBoxes(game) { const ids = new Set(protectedBoxIds(game)); return game.boxes.filter((box) => !box.opened && !ids.has(box.id)); }
export function remainingAmounts(game) { return game.boxes.filter((box) => !box.opened).map((box) => box.amount); }
export function expectedValue(game) { const amounts = remainingAmounts(game); return amounts.length ? amounts.reduce((total, amount) => total + amount, 0) / amounts.length : 0; }
export function offerFor(game, playerId = game.currentPlayerId) { return game.bankerPhase?.offersByPlayerId?.[playerId]?.amount ?? game.offer ?? 0; }

function nextUnselectedPlayer(players) { return players.find((player) => player.boxId === null); }
function nextActivePlayerId(players, afterId) {
  const position = players.findIndex((player) => player.id === afterId);
  for (let offset = 1; offset <= players.length; offset += 1) {
    const candidate = players[(Math.max(position, 0) + offset) % players.length];
    if (candidate.status === 'active' && candidate.boxId !== null) return candidate.id;
  }
  return null;
}
function resumePlayerId(players, preferredId) { return players.some((player) => player.id === preferredId && player.status === 'active' && player.boxId !== null) ? preferredId : nextActivePlayerId(players, preferredId); }

export function selectPlayerBox(game, boxId) {
  if (game.status !== 'selecting') throw new Error('Oyuncu kutusu bu aşamada seçilemez.');
  if (!game.boxes.some((box) => box.id === boxId)) throw new Error('Geçersiz kutu.');
  if (game.players.some((player) => player.boxId === boxId)) throw new Error('Bu kutu başka bir oyuncuya ait.');
  const selectingPlayer = currentPlayer(game);
  if (selectingPlayer.boxId !== null) throw new Error('Bu oyuncu kutusunu zaten seçti.');
  const players = game.players.map((player) => player.id === selectingPlayer.id ? { ...player, boxId } : player);
  const next = nextUnselectedPlayer(players);
  if (next) return { ...game, players, playerBoxId: players.length === 1 ? boxId : null, currentPlayerId: next.id };
  return { ...game, players, playerBoxId: players.length === 1 ? boxId : null, currentPlayerId: 1, selectionCursorPlayerId: 1, status: 'opening' };
}

function commonBoxesLeft(boxes, players) {
  const protectedIds = new Set(players.filter((player) => player.status === 'active' && player.boxId !== null).map((player) => player.boxId));
  return boxes.filter((box) => !box.opened && !protectedIds.has(box.id)).length;
}

function createBankerPhase(game, finalOffer) {
  const active = activePlayers(game);
  const rewards = remainingAmounts(game);
  const statistics = analyzeRemainingRewards(rewards);
  const snapshot = Object.freeze({ roundIndex: game.round, totalRounds: game.roundConfiguration.length, remainingRewards: Object.freeze([...rewards]), remainingBoxCount: rewards.length, activePlayerIds: Object.freeze(active.map((player) => player.id)), nextRoundBoxes: Math.min(game.roundConfiguration[game.round] ?? 1, commonBoxesLeft(game.boxes, game.players)), statistics: Object.freeze({ ...statistics }) });
  const offersByPlayerId = Object.fromEntries(active.map((player) => [player.id, calculateBankerOffer({ banker: game.banker, mood: game.banker.mood, statistics, roundIndex: game.round, totalRounds: game.roundConfiguration.length, nextRoundBoxes: snapshot.nextRoundBoxes, playerId: player.id, riskScore: player.riskScore, history: player.offerHistory, seed: game.gameSeed })]));
  return { id: `${game.gameSeed}-${game.round}-${game.decisions.length}`, status: 'decision', finalOffer, snapshot, offersByPlayerId, decisionsByPlayerId: Object.fromEntries(active.map((player) => [player.id, null])) };
}

function offerRound(game, boxes, openedThisRound, finalOffer = false) {
  const ready = { ...game, boxes, openedThisRound };
  const offerPlayerIds = activePlayers(ready).map((player) => player.id);
  if (!offerPlayerIds.length) return { ...ready, status: 'finished' };
  const bankerPhase = createBankerPhase(ready, finalOffer);
  return { ...ready, offer: bankerPhase.offersByPlayerId[offerPlayerIds[0]].amount, offerPlayerIds, offerDecisionIndex: 0, offerReturnPlayerId: game.selectionCursorPlayerId, currentPlayerId: offerPlayerIds[0], bankerPhase, finalOffer, status: 'offer' };
}

function revealAll(boxes) { return boxes.map((box) => box.opened ? box : { ...box, opened: true }); }

export function openBox(game, boxId) {
  if (game.status !== 'opening') throw new Error('Bu aşamada kutu açılamaz.');
  if (protectedBoxIds(game).includes(boxId)) throw new Error('Aktif oyuncunun kutusu açılamaz.');
  const box = game.boxes.find((candidate) => candidate.id === boxId);
  if (!box || box.opened) throw new Error('Bu kutu kullanılamaz.');
  const boxes = game.boxes.map((candidate) => candidate.id === boxId ? { ...candidate, opened: true } : candidate);
  const openedThisRound = game.openedThisRound + 1;
  const cursor = nextActivePlayerId(game.players, game.currentPlayerId);
  const remaining = commonBoxesLeft(boxes, game.players);
  if (remaining <= 1) return offerRound({ ...game, selectionCursorPlayerId: cursor }, boxes, openedThisRound, true);
  const quota = Math.min(game.roundConfiguration[game.round] ?? remaining, remaining);
  if (openedThisRound >= quota) return offerRound({ ...game, selectionCursorPlayerId: cursor }, boxes, openedThisRound);
  return { ...game, boxes, openedThisRound, currentPlayerId: cursor, selectionCursorPlayerId: cursor };
}

function decisionRecord(game, playerId, decision) {
  const quoted = game.bankerPhase.offersByPlayerId[playerId];
  const player = game.players.find((entry) => entry.id === playerId);
  return { playerId, decision, offer: quoted.amount, round: game.round + 1, bankerId: game.banker.id, snapshotId: game.bankerPhase.id, bait: quoted.bait, riskScoreBefore: player.riskScore, riskScoreAfter: nextRiskScore(player.riskScore, decision, quoted.amount, game.bankerPhase.snapshot.statistics.mean) };
}

function resolveOffer(game, choices) {
  const records = game.offerPlayerIds.map((id) => decisionRecord(game, id, choices[id]));
  const recordByPlayer = Object.fromEntries(records.map((record) => [record.playerId, record]));
  const phase = { ...game.bankerPhase, status: 'locked', decisionsByPlayerId: { ...choices } };
  const players = game.players.map((player) => {
    const record = recordByPlayer[player.id];
    return record ? { ...player, status: record.decision === 'deal' ? 'dealt' : 'active', dealAmount: record.decision === 'deal' ? record.offer : null, riskScore: record.riskScoreAfter, offerHistory: [...player.offerHistory, record] } : player;
  });
  const dealBoxes = new Set(players.filter((player) => player.status === 'dealt').map((player) => player.boxId));
  const boxes = game.boxes.map((box) => dealBoxes.has(box.id) ? { ...box, opened: true } : box);
  const base = { ...game, boxes, players, decisions: [...game.decisions, ...records], bankerHistory: [...game.bankerHistory, phase] };
  const continuing = activePlayers(base);
  if (game.finalOffer || !continuing.length) {
    const status = game.players.length === 1 && records[0]?.decision === 'deal' ? 'dealt' : 'finished';
    return { ...base, boxes: revealAll(boxes), offer: null, offerPlayerIds: [], offerDecisionIndex: 0, offerReturnPlayerId: null, bankerPhase: phase, finalOffer: false, status };
  }
  const nextId = resumePlayerId(players, game.offerReturnPlayerId);
  return { ...base, currentPlayerId: nextId, selectionCursorPlayerId: nextId, round: game.round + 1, openedThisRound: 0, offer: null, offerPlayerIds: [], offerDecisionIndex: 0, offerReturnPlayerId: null, bankerPhase: phase, finalOffer: false, status: 'opening' };
}

export function decideOffer(game, decision) {
  if (game.status !== 'offer' || game.bankerPhase?.status !== 'decision') throw new Error('Şu anda açık bir teklif yok.');
  if (!['deal', 'continue'].includes(decision)) throw new Error('Geçersiz karar.');
  const id = currentPlayer(game).id;
  if (!game.offerPlayerIds.includes(id)) throw new Error('Bu oyuncunun teklif sırası değil.');
  const choices = { ...game.bankerPhase.decisionsByPlayerId, [id]: decision };
  const nextIndex = game.offerDecisionIndex + 1;
  if (nextIndex < game.offerPlayerIds.length) return { ...game, bankerPhase: { ...game.bankerPhase, decisionsByPlayerId: choices }, offerDecisionIndex: nextIndex, currentPlayerId: game.offerPlayerIds[nextIndex] };
  return resolveOffer(game, choices);
}

export function decideOfferBatch(game, choices) {
  if (game.status !== 'offer' || game.bankerPhase?.status !== 'decision') throw new Error('Şu anda açık bir teklif yok.');
  const ids = game.offerPlayerIds;
  if (!ids.length || ids.some((id) => !['deal', 'continue'].includes(choices[id]))) throw new Error('Her aktif oyuncu teklif için karar vermeli.');
  return resolveOffer(game, choices);
}

export function playerOutcome(game, playerId) { const player = game.players.find((candidate) => candidate.id === playerId); return !player ? 0 : player.status === 'dealt' ? player.dealAmount ?? 0 : game.boxes.find((box) => box.id === player.boxId)?.amount ?? 0; }
export function winningPlayers(game) { const outcomes = game.players.map((player) => ({ player, amount: playerOutcome(game, player.id) })); const highest = Math.max(...outcomes.map((entry) => entry.amount)); return outcomes.filter((entry) => entry.amount === highest); }
export function outcomeAmount(game) { return playerOutcome(game, 1); }
