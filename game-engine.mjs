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

export function createGame(random = Math.random) {
  const profile = bankerProfiles[Math.floor(random() * bankerProfiles.length)];
  return {
    boxes: shuffled(PRIZES, random).map((amount, index) => ({ id: index + 1, amount, opened: false })),
    playerBoxId: null,
    round: 0,
    openedThisRound: 0,
    status: 'selecting',
    offer: null,
    banker: profile,
    decisions: []
  };
}

export function selectableBoxes(game) {
  return game.boxes.filter((box) => !box.opened && box.id !== game.playerBoxId);
}

export function remainingAmounts(game) {
  return game.boxes.filter((box) => !box.opened).map((box) => box.amount);
}

export function expectedValue(game) {
  const amounts = remainingAmounts(game);
  return amounts.reduce((total, amount) => total + amount, 0) / amounts.length;
}

export function offerFor(game) {
  const progress = game.round / ROUND_SIZES.length;
  const volatility = remainingAmounts(game).length > 1
    ? Math.max(...remainingAmounts(game)) / expectedValue(game)
    : 1;
  const progressionFactor = 0.59 + (progress * 0.35);
  const uncertaintyDiscount = Math.min(0.1, Math.max(0, (volatility - 2) * 0.018));
  const rawOffer = expectedValue(game) * (progressionFactor - uncertaintyDiscount) * game.banker.factor;
  return Math.max(1, Math.round(rawOffer / 100) * 100);
}

export function selectPlayerBox(game, boxId) {
  if (game.status !== 'selecting') throw new Error('Oyuncu kutusu bu aşamada seçilemez.');
  if (!game.boxes.some((box) => box.id === boxId)) throw new Error('Geçersiz kutu.');
  return { ...game, playerBoxId: boxId, status: 'opening' };
}

export function openBox(game, boxId) {
  if (game.status !== 'opening') throw new Error('Bu aşamada kutu açılamaz.');
  if (boxId === game.playerBoxId) throw new Error('Ana kutu açılamaz.');
  const box = game.boxes.find((candidate) => candidate.id === boxId);
  if (!box || box.opened) throw new Error('Bu kutu kullanılamaz.');

  const boxes = game.boxes.map((candidate) => candidate.id === boxId ? { ...candidate, opened: true } : candidate);
  const openedThisRound = game.openedThisRound + 1;
  const required = ROUND_SIZES[game.round];
  const allOtherBoxesOpen = boxes.every((candidate) => candidate.id === game.playerBoxId || candidate.opened);

  if (allOtherBoxesOpen) {
    return { ...game, boxes, openedThisRound, status: 'finished' };
  }
  if (openedThisRound === required) {
    const readyForOffer = { ...game, boxes, openedThisRound };
    return { ...readyForOffer, offer: offerFor(readyForOffer), status: 'offer' };
  }
  return { ...game, boxes, openedThisRound };
}

export function decideOffer(game, decision) {
  if (game.status !== 'offer') throw new Error('Şu anda açık bir teklif yok.');
  if (!['deal', 'continue'].includes(decision)) throw new Error('Geçersiz karar.');
  const decisions = [...game.decisions, { decision, offer: game.offer, round: game.round + 1 }];
  if (decision === 'deal') return { ...game, decisions, status: 'dealt' };
  return {
    ...game,
    decisions,
    round: game.round + 1,
    openedThisRound: 0,
    offer: null,
    status: 'opening'
  };
}

export function outcomeAmount(game) {
  if (game.status === 'dealt') return game.offer;
  const playerBox = game.boxes.find((box) => box.id === game.playerBoxId);
  return playerBox?.amount ?? 0;
}
