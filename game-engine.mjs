export const PRIZES = [
  1, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1_000, 2_500,
  5_000, 10_000, 25_000, 50_000, 100_000, 250_000,
  500_000, 750_000, 1_000_000, 2_500_000, 3_000_000, 5_000_000, 5_000_000
];

export const ROUND_SIZES = [5, 4, 3, 3, 3, 2, 2, 1, 1];

const bankerProfiles = [
  { name: 'Analist', factor: 0.88, message: 'Olasılıkları dikkatle izliyorum.' },
  { name: 'Stratejist', factor: 0.91, message: 'Cesaretinin bir bedeli olmalı.' },
  { name: 'Risk Avcısı', factor: 0.85, message: 'Belirsizlik arttıkça pazarlık güçlenir.' }
];

export function shuffled(values, random = Math.random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createGame(random = Math.random, playerCount = 1) {
  const count = Math.min(4, Math.max(1, Number(playerCount) || 1));
  const profile = bankerProfiles[Math.floor(random() * bankerProfiles.length)];
  return {
    boxes: shuffled(PRIZES, random).map((amount, index) => ({ id: index + 1, amount, opened: false })),
    players: Array.from({ length: count }, (_, index) => ({ id: index + 1, boxId: null, status: 'active', dealAmount: null })),
    playerBoxId: null,
    currentPlayerId: 1,
    round: 0,
    openedThisRound: 0,
    status: 'selecting',
    offer: null,
    offerPlayerIds: [],
    offerDecisionIndex: 0,
    finalOffer: false,
    banker: profile,
    decisions: []
  };
}

export function activePlayers(game) {
  return game.players.filter((player) => player.status === 'active' && player.boxId !== null);
}

export function currentPlayer(game) {
  return game.players.find((player) => player.id === game.currentPlayerId) ?? game.players[0];
}

export function protectedBoxIds(game) {
  return activePlayers(game).map((player) => player.boxId);
}

export function selectableBoxes(game) {
  const protectedIds = new Set(protectedBoxIds(game));
  return game.boxes.filter((box) => !box.opened && !protectedIds.has(box.id));
}

export function remainingAmounts(game) {
  return game.boxes.filter((box) => !box.opened).map((box) => box.amount);
}

export function expectedValue(game) {
  const amounts = remainingAmounts(game);
  if (!amounts.length) return 0;
  return amounts.reduce((total, amount) => total + amount, 0) / amounts.length;
}

export function offerFor(game) {
  const progress = game.round / ROUND_SIZES.length;
  const amounts = remainingAmounts(game);
  const volatility = amounts.length > 1 ? Math.max(...amounts) / expectedValue(game) : 1;
  const progressionFactor = 0.59 + (progress * 0.35);
  const uncertaintyDiscount = Math.min(0.1, Math.max(0, (volatility - 2) * 0.018));
  const rawOffer = expectedValue(game) * (progressionFactor - uncertaintyDiscount) * game.banker.factor;
  return Math.max(1, Math.round(rawOffer / 100) * 100);
}

function nextUnselectedPlayer(players) {
  return players.find((player) => player.boxId === null);
}

function nextActivePlayerId(players, afterId) {
  const active = players.filter((player) => player.status === 'active' && player.boxId !== null);
  if (!active.length) return null;
  const position = active.findIndex((player) => player.id === afterId);
  return active[(position + 1 + active.length) % active.length].id;
}

export function selectPlayerBox(game, boxId) {
  if (game.status !== 'selecting') throw new Error('Oyuncu kutusu bu aşamada seçilemez.');
  if (!game.boxes.some((box) => box.id === boxId)) throw new Error('Geçersiz kutu.');
  if (game.players.some((player) => player.boxId === boxId)) throw new Error('Bu kutu başka bir oyuncuya ait.');

  const selectingPlayer = currentPlayer(game);
  if (selectingPlayer.boxId !== null) throw new Error('Bu oyuncu kutusunu zaten seçti.');
  const players = game.players.map((player) => player.id === selectingPlayer.id ? { ...player, boxId } : player);
  const next = nextUnselectedPlayer(players);

  if (next) return { ...game, players, playerBoxId: players.length === 1 ? boxId : null, currentPlayerId: next.id };
  return { ...game, players, playerBoxId: players.length === 1 ? boxId : null, currentPlayerId: 1, status: 'opening' };
}

function offerRound(game, boxes, openedThisRound, finalOffer = false) {
  const readyForOffer = { ...game, boxes, openedThisRound };
  const offerPlayerIds = activePlayers(readyForOffer).map((player) => player.id);
  if (!offerPlayerIds.length) return { ...readyForOffer, status: 'finished' };
  return { ...readyForOffer, offer: offerFor(readyForOffer), offerPlayerIds, offerDecisionIndex: 0, finalOffer, currentPlayerId: offerPlayerIds[0], status: 'offer' };
}

function revealAll(boxes) {
  return boxes.map((box) => box.opened ? box : { ...box, opened: true });
}

export function openBox(game, boxId) {
  if (game.status !== 'opening') throw new Error('Bu aşamada kutu açılamaz.');
  if (protectedBoxIds(game).includes(boxId)) throw new Error('Aktif oyuncunun kutusu açılamaz.');
  const box = game.boxes.find((candidate) => candidate.id === boxId);
  if (!box || box.opened) throw new Error('Bu kutu kullanılamaz.');

  const boxes = game.boxes.map((candidate) => candidate.id === boxId ? { ...candidate, opened: true } : candidate);
  const openedThisRound = game.openedThisRound + 1;
  const commonBoxesLeft = boxes.filter((candidate) => !candidate.opened && !protectedBoxIds(game).includes(candidate.id)).length;
  if (commonBoxesLeft <= 1) return offerRound(game, boxes, openedThisRound, true);
  if (openedThisRound === ROUND_SIZES[game.round]) return offerRound(game, boxes, openedThisRound);

  return { ...game, boxes, openedThisRound, currentPlayerId: nextActivePlayerId(game.players, game.currentPlayerId) };
}

export function decideOffer(game, decision) {
  if (game.status !== 'offer') throw new Error('Şu anda açık bir teklif yok.');
  if (!['deal', 'continue'].includes(decision)) throw new Error('Geçersiz karar.');
  const decisionPlayer = currentPlayer(game);
  if (!game.offerPlayerIds.includes(decisionPlayer.id)) throw new Error('Bu oyuncunun teklif sırası değil.');

  const decisions = [...game.decisions, { playerId: decisionPlayer.id, decision, offer: game.offer, round: game.round + 1 }];
  const boxes = decision === 'deal'
    ? game.boxes.map((box) => box.id === decisionPlayer.boxId ? { ...box, opened: true } : box)
    : game.boxes;
  const players = game.players.map((player) => player.id !== decisionPlayer.id ? player : {
    ...player,
    status: decision === 'deal' ? 'dealt' : 'active',
    dealAmount: decision === 'deal' ? game.offer : null
  });
  if (game.players.length === 1 && decision === 'deal') return { ...game, boxes: revealAll(boxes), players, decisions, status: 'dealt' };
  const nextDecisionIndex = game.offerDecisionIndex + 1;

  if (nextDecisionIndex < game.offerPlayerIds.length) {
    return { ...game, boxes, players, decisions, offerDecisionIndex: nextDecisionIndex, currentPlayerId: game.offerPlayerIds[nextDecisionIndex] };
  }

  if (game.finalOffer) {
    return {
      ...game,
      boxes: revealAll(boxes),
      players,
      decisions,
      offer: null,
      offerPlayerIds: [],
      offerDecisionIndex: 0,
      finalOffer: false,
      status: 'finished'
    };
  }

  const continuing = players.filter((player) => player.status === 'active' && player.boxId !== null);
  if (!continuing.length) return { ...game, boxes: revealAll(boxes), players, decisions, status: 'finished' };
  return {
    ...game,
    boxes,
    players,
    decisions,
    currentPlayerId: continuing[0].id,
    round: game.round + 1,
    openedThisRound: 0,
    offer: null,
    offerPlayerIds: [],
    offerDecisionIndex: 0,
    finalOffer: false,
    status: 'opening'
  };
}

export function decideOfferBatch(game, choices) {
  if (game.status !== 'offer') throw new Error('Şu anda açık bir teklif yok.');
  const playerIds = game.offerPlayerIds;
  if (!playerIds.length || playerIds.some((id) => !['deal', 'continue'].includes(choices[id]))) {
    throw new Error('Her aktif oyuncu teklif için karar vermeli.');
  }

  const decisions = [
    ...game.decisions,
    ...playerIds.map((playerId) => ({ playerId, decision: choices[playerId], offer: game.offer, round: game.round + 1 }))
  ];
  const dealBoxIds = new Set(game.players
    .filter((player) => choices[player.id] === 'deal')
    .map((player) => player.boxId));
  const boxes = game.boxes.map((box) => dealBoxIds.has(box.id) ? { ...box, opened: true } : box);
  const players = game.players.map((player) => {
    const decision = choices[player.id];
    if (!decision) return player;
    return { ...player, status: decision === 'deal' ? 'dealt' : 'active', dealAmount: decision === 'deal' ? game.offer : null };
  });

  if (game.finalOffer) {
    return {
      ...game,
      boxes: revealAll(boxes),
      players,
      decisions,
      offer: null,
      offerPlayerIds: [],
      offerDecisionIndex: 0,
      finalOffer: false,
      status: 'finished'
    };
  }

  const continuing = players.filter((player) => player.status === 'active' && player.boxId !== null);
  if (!continuing.length) return { ...game, boxes: revealAll(boxes), players, decisions, status: 'finished' };
  return {
    ...game,
    boxes,
    players,
    decisions,
    currentPlayerId: continuing[0].id,
    round: game.round + 1,
    openedThisRound: 0,
    offer: null,
    offerPlayerIds: [],
    offerDecisionIndex: 0,
    finalOffer: false,
    status: 'opening'
  };
}

export function playerOutcome(game, playerId) {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) return 0;
  if (player.status === 'dealt') return player.dealAmount ?? 0;
  return game.boxes.find((box) => box.id === player.boxId)?.amount ?? 0;
}

export function winningPlayers(game) {
  const outcomes = game.players.map((player) => ({ player, amount: playerOutcome(game, player.id) }));
  const highest = Math.max(...outcomes.map((entry) => entry.amount));
  return outcomes.filter((entry) => entry.amount === highest);
}

export function outcomeAmount(game) {
  return playerOutcome(game, 1);
}
