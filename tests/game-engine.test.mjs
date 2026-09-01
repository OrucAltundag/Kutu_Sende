import assert from 'node:assert/strict';
import test from 'node:test';
import { PRIZES, ROUND_SIZES, activePlayers, createGame, currentPlayer, decideOffer, decideOfferBatch, expectedValue, openBox, outcomeAmount, playerOutcome, selectPlayerBox, winningPlayers } from '../game-engine.mjs';

const deterministic = () => 0.42;

test('yeni oyunda tüm ödüller bir kez bulunur', () => {
  const game = createGame(deterministic);
  assert.equal(game.boxes.length, 25);
  assert.deepEqual([...game.boxes.map((box) => box.amount)].sort((a,b) => a-b), PRIZES);
  assert.equal(expectedValue(game), PRIZES.reduce((sum, prize) => sum + prize, 0) / PRIZES.length);
});

test('tur kotası dolunca pozitif teklif gelir ve devam kararı yeni tura geçer', () => {
  let game = selectPlayerBox(createGame(deterministic), 1);
  const openingIds = game.boxes.filter((box) => box.id !== 1).slice(0, ROUND_SIZES[0]).map((box) => box.id);
  for (const id of openingIds) game = openBox(game, id);
  assert.equal(game.status, 'offer');
  assert.ok(game.offer > 0);
  game = decideOffer(game, 'continue');
  assert.equal(game.status, 'opening');
  assert.equal(game.round, 1);
  assert.equal(game.openedThisRound, 0);
});

test('teklif kabulü sonucu teklife sabitler', () => {
  let game = selectPlayerBox(createGame(deterministic), 1);
  for (const box of game.boxes.filter((candidate) => candidate.id !== 1).slice(0, 5)) game = openBox(game, box.id);
  const offer = game.offer;
  game = decideOffer(game, 'deal');
  assert.equal(game.status, 'dealt');
  assert.equal(outcomeAmount(game), offer);
  assert.equal(game.boxes.every((box) => box.opened), true);
});

test('son teklif reddedilince ana kutu otomatik açılarak oyun biter', () => {
  let game = selectPlayerBox(createGame(deterministic), 1);
  while (game.status !== 'finished') {
    if (game.status === 'offer') { game = decideOffer(game, 'continue'); continue; }
    const next = game.boxes.find((box) => box.id !== 1 && !box.opened);
    game = openBox(game, next.id);
  }
  assert.equal(game.boxes.filter((box) => !box.opened).length, 0);
  assert.equal(outcomeAmount(game), game.boxes.find((box) => box.id === 1).amount);
});

test('son teklif kabul edilince kişisel ve ortadaki son kutu açılır', () => {
  let game = selectPlayerBox(createGame(deterministic), 1);
  while (!(game.status === 'offer' && game.finalOffer)) {
    if (game.status === 'offer') { game = decideOffer(game, 'continue'); continue; }
    const next = game.boxes.find((box) => box.id !== 1 && !box.opened);
    game = openBox(game, next.id);
  }
  assert.equal(game.boxes.filter((box) => !box.opened && box.id !== 1).length, 1);
  const offer = game.offer;
  game = decideOffer(game, 'deal');
  assert.equal(game.status, 'dealt');
  assert.equal(outcomeAmount(game), offer);
  assert.equal(game.boxes.every((box) => box.opened), true);
});

test('parti modunda herkes kendi kutusunu seçer ve açma sırası döner', () => {
  let game = createGame(deterministic, 3);
  game = selectPlayerBox(game, 1);
  assert.equal(currentPlayer(game).id, 2);
  game = selectPlayerBox(game, 2);
  assert.equal(currentPlayer(game).id, 3);
  game = selectPlayerBox(game, 3);
  assert.equal(game.status, 'opening');
  assert.deepEqual(activePlayers(game).map((player) => player.boxId), [1, 2, 3]);
  game = openBox(game, 4);
  assert.equal(currentPlayer(game).id, 2);
  game = openBox(game, 5);
  assert.equal(currentPlayer(game).id, 3);
});

test('aynı teklif aktif oyunculara sırayla sunulur, kabul eden oyuncu ayrılır', () => {
  let game = selectPlayerBox(createGame(deterministic, 2), 1);
  game = selectPlayerBox(game, 2);
  for (const id of [3, 4, 5, 6, 7]) game = openBox(game, id);
  assert.equal(game.status, 'offer');
  const sharedOffer = game.offer;
  assert.equal(currentPlayer(game).id, 1);
  game = decideOffer(game, 'deal');
  assert.equal(game.status, 'offer');
  assert.equal(currentPlayer(game).id, 2);
  assert.equal(game.offer, sharedOffer);
  assert.equal(playerOutcome(game, 1), sharedOffer);
  assert.equal(game.boxes.find((box) => box.id === 1).opened, true);
  game = decideOffer(game, 'continue');
  assert.equal(game.status, 'opening');
  assert.equal(currentPlayer(game).id, 2);
  assert.equal(activePlayers(game).length, 1);
  assert.equal(game.boxes.find((box) => box.id === 1).opened, true);
});

test('parti teklifinde tüm oyuncular kararı tek ekranda verir ve tur birlikte ilerler', () => {
  let game = selectPlayerBox(createGame(deterministic, 2), 1);
  game = selectPlayerBox(game, 2);
  for (const id of [3, 4, 5, 6, 7]) game = openBox(game, id);
  const sharedOffer = game.offer;
  assert.throws(() => decideOfferBatch(game, { 1: 'deal' }), /Her aktif oyuncu/);
  game = decideOfferBatch(game, { 1: 'deal', 2: 'continue' });
  assert.equal(game.status, 'opening');
  assert.equal(game.players[0].status, 'dealt');
  assert.equal(game.players[1].status, 'active');
  assert.equal(game.players[0].dealAmount, sharedOffer);
  assert.equal(game.boxes.find((box) => box.id === 1).opened, true);
  assert.equal(game.decisions.slice(-2).length, 2);
});

test('çok oyunculuda herkes teklifi kabul ederse bütün kutular açılır', () => {
  let game = selectPlayerBox(createGame(deterministic, 2), 1);
  game = selectPlayerBox(game, 2);
  for (const id of [3, 4, 5, 6, 7]) game = openBox(game, id);
  game = decideOfferBatch(game, { 1: 'deal', 2: 'deal' });
  assert.equal(game.status, 'finished');
  assert.equal(game.boxes.every((box) => box.opened), true);
});

test('son teklif reddedilirse aktif oyuncuların kutuları otomatik sonuca gider', () => {
  let game = selectPlayerBox(createGame(deterministic, 2), 1);
  game = selectPlayerBox(game, 2);
  while (!(game.status === 'offer' && game.finalOffer)) {
    if (game.status === 'offer') { game = decideOffer(game, 'continue'); continue; }
    const next = game.boxes.find((box) => !box.opened && ![1, 2].includes(box.id));
    game = openBox(game, next.id);
  }
  assert.equal(game.boxes.filter((box) => !box.opened && ![1, 2].includes(box.id)).length, 1);
  game = decideOffer(game, 'continue');
  assert.equal(game.status, 'offer');
  game = decideOffer(game, 'continue');
  assert.equal(game.status, 'finished');
  assert.equal(game.boxes.find((box) => box.id === 1).opened, true);
  assert.equal(game.boxes.find((box) => box.id === 2).opened, true);
  assert.equal(game.boxes.every((box) => box.opened), true);
  assert.equal(playerOutcome(game, 1), game.boxes.find((box) => box.id === 1).amount);
  assert.equal(playerOutcome(game, 2), game.boxes.find((box) => box.id === 2).amount);
});

test('çok oyunculu oyunda en yüksek kazanç yarışmacıyı kazanan yapar', () => {
  const game = {
    ...createGame(deterministic, 3),
    players: [
      { id: 1, boxId: 1, status: 'dealt', dealAmount: 750_000 },
      { id: 2, boxId: 2, status: 'active', dealAmount: null },
      { id: 3, boxId: 3, status: 'dealt', dealAmount: 500_000 }
    ],
    boxes: [{ id: 1, amount: 1, opened: true }, { id: 2, amount: 1_000_000, opened: true }, { id: 3, amount: 5, opened: true }]
  };
  assert.deepEqual(winningPlayers(game).map(({ player }) => player.id), [2]);
});
