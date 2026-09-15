import assert from 'node:assert/strict';
import test from 'node:test';
import { BANKER_LIST, analyzeRemainingRewards, calculateBankerOffer } from '../bankers.mjs';
import { PRIZES, ROUND_CONFIG_BY_PLAYER_COUNT, activePlayers, createGame, currentPlayer, decideOffer, decideOfferBatch, getRoundConfiguration, openBox, offerFor, outcomeAmount, playerOutcome, selectPlayerBox, winningPlayers } from '../game-engine.mjs';
import { buildMatchSummary } from '../match-summary.mjs';

const deterministic = () => .42;
const selectAll = (game) => game.players.reduce((state, player) => selectPlayerBox(state, player.id), game);
const openIds = (game, ids) => ids.reduce((state, id) => openBox(state, id), game);
const choicesFor = (game, decision = 'continue') => Object.fromEntries(game.offerPlayerIds.map((id) => [id, decision]));

test('ödül havuzu 25 benzersiz kutu girişi içerir', () => {
  const game = createGame(deterministic);
  assert.equal(game.boxes.length, 25);
  assert.deepEqual([...game.boxes.map((box) => box.amount)].sort((a, b) => a - b), PRIZES);
  assert.equal(new Set(PRIZES).size, 25);
});

for (const playerCount of [1, 2, 3, 4]) {
  test(`${playerCount} oyuncunun tur konfigürasyonu korunur ve toplamı doğru olur`, () => {
    const rounds = getRoundConfiguration(playerCount);
    assert.equal(rounds.reduce((sum, amount) => sum + amount, 0), 25 - playerCount);
    assert.equal(rounds.every((amount) => Number.isInteger(amount) && amount > 0), true);
    assert.deepEqual(rounds, ROUND_CONFIG_BY_PLAYER_COUNT[playerCount]);
  });
}

test('tur planı oyun başında kilitlenir; oyuncu ayrılınca değişmez', () => {
  let game = selectAll(createGame(deterministic, 2));
  const schedule = [...game.roundConfiguration];
  game = openIds(game, [3, 4, 5, 6, 7]);
  game = decideOfferBatch(game, { 1: 'deal', 2: 'continue' });
  assert.deepEqual(game.roundConfiguration, schedule);
  assert.equal(game.roundConfiguration.length, 8);
});

test('teklif anında ödül havuzu snapshot olarak dondurulur ve teklifler aynı state üzerinden oluşur', () => {
  let game = selectAll(createGame({ random: deterministic, playerCount: 3, seed: 412 }));
  game = openIds(game, [4, 5, 6, 7, 8]);
  assert.equal(game.status, 'offer');
  const snapshot = game.bankerPhase.snapshot;
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.remainingRewards), true);
  assert.deepEqual(snapshot.activePlayerIds, [1, 2, 3]);
  const quoted = game.offerPlayerIds.map((id) => offerFor(game, id));
  assert.equal(quoted.every((amount) => amount > 0), true);
  const unchanged = [...snapshot.remainingRewards];
  const after = decideOfferBatch(game, { 1: 'deal', 2: 'continue', 3: 'continue' });
  assert.deepEqual(snapshot.remainingRewards, unchanged);
  assert.equal(after.players.find((player) => player.id === 1).status, 'dealt');
  assert.equal(after.players.find((player) => player.id === 1).dealAmount, quoted[0]);
});

test('4 oyunculu tur döngüsü, kota oyuncu sayısına bölünmese de sonraki oyuncudan devam eder', () => {
  let game = selectAll(createGame({ random: deterministic, playerCount: 4, seed: 7 }));
  game = openIds(game, [5, 6, 7, 8]);
  assert.equal(game.status, 'offer');
  assert.equal(game.offerReturnPlayerId, 1);
  game = decideOfferBatch(game, choicesFor(game));
  assert.equal(currentPlayer(game).id, 1);
  game = openIds(game, [9, 10, 11, 12]);
  game = decideOfferBatch(game, choicesFor(game));
  assert.equal(currentPlayer(game).id, 1);
  game = openIds(game, [13, 14, 15]);
  assert.equal(game.offerReturnPlayerId, 4);
  game = decideOfferBatch(game, choicesFor(game));
  assert.equal(currentPlayer(game).id, 4);
});

test('çok oyunculu kabul kararları önce kilitlenir ve teklifler oyuncuya özgüdür', () => {
  let game = selectAll(createGame({ random: deterministic, playerCount: 2, seed: 1 }));
  game = openIds(game, [3, 4, 5, 6, 7]);
  const playerOneOffer = offerFor(game, 1);
  const playerTwoOffer = offerFor(game, 2);
  game = decideOffer(game, 'deal');
  assert.equal(game.status, 'offer');
  assert.equal(game.boxes.find((box) => box.id === 1).opened, false);
  assert.equal(game.bankerPhase.decisionsByPlayerId[1], 'deal');
  game = decideOffer(game, 'continue');
  assert.equal(game.players[0].dealAmount, playerOneOffer);
  assert.equal(game.players[1].dealAmount, null);
  assert.equal(playerTwoOffer > 0, true);
});

test('3 ve 4 oyunculu erken teklifler sonrası yalnız aktif oyuncular sırada kalır', () => {
  let three = selectAll(createGame({ random: deterministic, playerCount: 3 }));
  three = openIds(three, [4, 5, 6, 7, 8]);
  three = decideOfferBatch(three, { 1: 'continue', 2: 'deal', 3: 'continue' });
  assert.deepEqual(activePlayers(three).map((player) => player.id), [1, 3]);
  assert.equal([1, 3].includes(currentPlayer(three).id), true);

  let four = selectAll(createGame({ random: deterministic, playerCount: 4 }));
  four = openIds(four, [5, 6, 7, 8]);
  four = decideOfferBatch(four, { 1: 'continue', 2: 'deal', 3: 'continue', 4: 'continue' });
  four = openIds(four, [9, 10, 11, 12]);
  four = decideOfferBatch(four, { 1: 'continue', 3: 'continue', 4: 'deal' });
  assert.deepEqual(activePlayers(four).map((player) => player.id), [1, 3]);
  assert.equal([1, 3].includes(currentPlayer(four).id), true);
});

test('aynı kutu ikinci kez açılamaz ve yeni oyun önceki state taşımamaktadır', () => {
  let game = selectPlayerBox(createGame(deterministic), 1);
  game = openBox(game, 2);
  assert.throws(() => openBox(game, 2), /kullanılamaz/);
  const fresh = createGame({ random: deterministic, playerCount: 4, bankerMode: 'dynamic' });
  assert.equal(fresh.status, 'selecting');
  assert.equal(fresh.round, 0);
  assert.equal(fresh.decisions.length, 0);
  assert.equal(fresh.players.every((player) => player.boxId === null && player.status === 'active'), true);
});

test('son teklifte kabul veya red, tüm kutuları açar; kabul edilen teklif sonucu sabitler', () => {
  let game = selectPlayerBox(createGame({ random: deterministic, seed: 10 }), 1);
  while (!(game.status === 'offer' && game.finalOffer)) {
    if (game.status === 'offer') game = decideOffer(game, 'continue');
    else game = openBox(game, game.boxes.find((box) => !box.opened && box.id !== 1).id);
  }
  const offer = offerFor(game);
  game = decideOffer(game, 'deal');
  assert.equal(game.status, 'dealt');
  assert.equal(outcomeAmount(game), offer);
  assert.equal(game.boxes.every((box) => box.opened), true);
});

test('analist geç oyunda ortalama değere yaklaşır ve NaN üretmez', () => {
  const stats = analyzeRemainingRewards([1, 50_000, 250_000, 750_000, 5_000_000]);
  const early = calculateBankerOffer({ banker: BANKER_LIST.find((banker) => banker.id === 'analyst'), mood: 'dengeli', statistics: stats, roundIndex: 0, totalRounds: 9, nextRoundBoxes: 5, playerId: 1, seed: 4 });
  const late = calculateBankerOffer({ banker: BANKER_LIST.find((banker) => banker.id === 'analyst'), mood: 'dengeli', statistics: stats, roundIndex: 8, totalRounds: 9, nextRoundBoxes: 1, playerId: 1, seed: 4 });
  assert.equal(Number.isFinite(late.amount), true);
  assert.equal(late.amount > early.amount, true);
  assert.equal(late.amount <= stats.mean * 1.08, true);
});

test('stratejist risk skoru ve sınırlı yem hamlesini karar geçmişinden kullanır', () => {
  const strategist = BANKER_LIST.find((banker) => banker.id === 'strategist');
  const stats = analyzeRemainingRewards([1_000, 10_000, 50_000, 500_000]);
  const calm = calculateBankerOffer({ banker: strategist, mood: 'dengeli', statistics: stats, roundIndex: 3, totalRounds: 8, nextRoundBoxes: 2, playerId: 1, riskScore: 0, history: [], seed: 99 });
  const risky = calculateBankerOffer({ banker: strategist, mood: 'dengeli', statistics: stats, roundIndex: 3, totalRounds: 8, nextRoundBoxes: 2, playerId: 1, riskScore: 90, history: [], seed: 99 });
  const history = [{ playerId: 1, decision: 'continue', bait: true }, { playerId: 1, decision: 'continue', bait: true }];
  const capped = calculateBankerOffer({ banker: strategist, mood: 'dengeli', statistics: stats, roundIndex: 3, totalRounds: 8, nextRoundBoxes: 2, playerId: 1, riskScore: 0, history, seed: 99 });
  assert.equal(calm.amount > risky.amount, true);
  assert.equal(capped.bait, false);
});

test('risk avcısı oynak havuzda güvenli havuza göre daha düşük teklif verir', () => {
  const banker = BANKER_LIST.find((entry) => entry.id === 'riskHunter');
  const volatile = calculateBankerOffer({ banker, mood: 'dengeli', statistics: analyzeRemainingRewards([1, 5, 10, 5_000_000]), roundIndex: 3, totalRounds: 8, nextRoundBoxes: 2, playerId: 1, seed: 5 });
  const stable = calculateBankerOffer({ banker, mood: 'dengeli', statistics: analyzeRemainingRewards([250_000, 300_000, 350_000, 400_000]), roundIndex: 3, totalRounds: 8, nextRoundBoxes: 2, playerId: 1, seed: 5 });
  assert.equal(volatile.factor < stable.factor, true);
});

test('aynı seed bankacıyı ve teklifleri tekrar üretir', () => {
  let first = selectPlayerBox(createGame({ random: deterministic, playerCount: 1, seed: 123456 }), 1);
  let second = selectPlayerBox(createGame({ random: deterministic, playerCount: 1, seed: 123456 }), 1);
  first = openIds(first, [2, 3, 4, 5, 6]); second = openIds(second, [2, 3, 4, 5, 6]);
  assert.equal(first.banker.id, second.banker.id);
  assert.equal(offerFor(first), offerFor(second));
});

test('seed seçimi üç bankacı kişiliğini de erişilebilir tutar', () => {
  const bankers = [0, 1, 2].map((seed) => createGame({ random: deterministic, seed, bankerMode: 'dynamic' }).banker.id);
  assert.deepEqual(new Set(bankers), new Set(['analyst', 'strategist', 'riskHunter']));
});

test('klasik bankacı varsayılandır; değişken mod seçili bankacıyı oyun boyunca korur', () => {
  const classic = createGame({ random: deterministic, seed: 2 });
  const dynamic = createGame({ random: deterministic, seed: 2, bankerMode: 'dynamic' });
  assert.equal(classic.bankerMode, 'classic');
  assert.equal(classic.banker.id, 'classic');
  assert.equal(dynamic.bankerMode, 'dynamic');
  assert.equal(dynamic.banker.id, 'riskHunter');
});

for (const playerCount of [1, 2, 3, 4]) {
  test(`${playerCount} oyunculu tam oyun güvenle sonlanır`, () => {
    let game = selectAll(createGame({ random: deterministic, playerCount, seed: playerCount * 111 }));
    while (!['finished', 'dealt'].includes(game.status)) {
      if (game.status === 'offer') game = playerCount === 1 ? decideOffer(game, 'continue') : decideOfferBatch(game, choicesFor(game));
      else game = openBox(game, game.boxes.find((box) => !box.opened && !activePlayers(game).some((player) => player.boxId === box.id)).id);
    }
    assert.equal(game.boxes.every((box) => box.opened), true);
    assert.equal(winningPlayers(game).length >= 1, true);
  });
}

test('çok oyunculuda en yüksek sonuç kazananı belirler', () => {
  const game = { ...createGame(deterministic, 3), players: [{ id: 1, boxId: 1, status: 'dealt', dealAmount: 750_000 }, { id: 2, boxId: 2, status: 'active', dealAmount: null }, { id: 3, boxId: 3, status: 'dealt', dealAmount: 500_000 }], boxes: [{ id: 1, amount: 1, opened: true }, { id: 2, amount: 1_000_000, opened: true }, { id: 3, amount: 5, opened: true }] };
  assert.deepEqual(winningPlayers(game).map(({ player }) => player.id), [2]);
  assert.equal(playerOutcome(game, 1), 750_000);
});

test('maç özeti sıralama ve anlamlı özel ödüller üretir', () => {
  const game = {
    ...createGame({ random: deterministic, playerCount: 2 }),
    players: [{ id: 1, boxId: 1, status: 'dealt', dealAmount: 500_000 }, { id: 2, boxId: 2, status: 'active', dealAmount: null }],
    boxes: [{ id: 1, amount: 100_000, opened: true }, { id: 2, amount: 5_000_000, opened: true }],
    decisions: [{ playerId: 1, decision: 'deal', offer: 500_000, round: 2 }, { playerId: 2, decision: 'continue', offer: 200_000, round: 2 }]
  };
  const summary = buildMatchSummary(game);
  assert.equal(summary.ranking[0].player.id, 2);
  assert.equal(summary.awards.some((award) => award.id === 'beat-banker'), true);
  assert.equal(summary.awards.some((award) => award.id === 'jackpot-2'), true);
});
