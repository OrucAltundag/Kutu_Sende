import assert from 'node:assert/strict';
import test from 'node:test';
import { PRIZES, ROUND_SIZES, activePlayers, createGame, currentPlayer, decideOffer, expectedValue, openBox, outcomeAmount, playerOutcome, selectPlayerBox } from '../game-engine.mjs';

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
});

test('ana kutu açılmadan oyunun sonuna ulaşılır', () => {
  let game = selectPlayerBox(createGame(deterministic), 1);
  while (game.status !== 'finished') {
    if (game.status === 'offer') { game = decideOffer(game, 'continue'); continue; }
    const next = game.boxes.find((box) => box.id !== 1 && !box.opened);
    game = openBox(game, next.id);
  }
  assert.equal(game.boxes.filter((box) => !box.opened).length, 1);
  assert.equal(outcomeAmount(game), game.boxes.find((box) => box.id === 1).amount);
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
  game = decideOffer(game, 'continue');
  assert.equal(game.status, 'opening');
  assert.equal(currentPlayer(game).id, 2);
  assert.equal(activePlayers(game).length, 1);
});
