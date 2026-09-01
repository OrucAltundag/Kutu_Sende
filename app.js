import { ROUND_SIZES, createGame, decideOffer, decideOfferBatch, expectedValue, openBox, outcomeAmount, playerOutcome, remainingAmounts, selectPlayerBox, winningPlayers } from './game-engine.mjs?v=20260901-3';

const currency = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
const els = {
  topBoxes: document.querySelector('#top-boxes'), leftBoxes: document.querySelector('#left-boxes'), rightBoxes: document.querySelector('#right-boxes'), prizeList: document.querySelector('#prize-list'), round: document.querySelector('#round-label'),
  title: document.querySelector('#status-title'), copy: document.querySelector('#status-copy'), progress: document.querySelector('#progress-bar'),
  remaining: document.querySelector('#remaining-count'), expected: document.querySelector('#expected-value'), bankerName: document.querySelector('#banker-name'), bankerMessage: document.querySelector('#banker-message'),
  offerDialog: document.querySelector('#offer-dialog'), offerValue: document.querySelector('#offer-value'), offerCopy: document.querySelector('#offer-copy'), offerActions: document.querySelector('#offer-actions'), partyOfferDecisions: document.querySelector('#party-offer-decisions'), partyOfferConfirm: document.querySelector('#party-offer-confirm'),
  resultDialog: document.querySelector('#result-dialog'), resultTitle: document.querySelector('#result-title'), resultCopy: document.querySelector('#result-copy'), resultValue: document.querySelector('#result-value'), resultBreakdown: document.querySelector('#result-breakdown'),
  playerTable: document.querySelector('#player-table'), playerTableTitle: document.querySelector('#player-table-title'), playerBox: document.querySelector('#player-box-holder'),
  revealCard: document.querySelector('#reveal-card'), revealLabel: document.querySelector('#reveal-label'), revealNumber: document.querySelector('#reveal-number'), revealValue: document.querySelector('#reveal-value'),
  modeButton: document.querySelector('#mode-button'), turnDialog: document.querySelector('#turn-dialog'), turnTitle: document.querySelector('#turn-title'), turnCopy: document.querySelector('#turn-copy'), turnStart: document.querySelector('#turn-start-button')
};
const homeScreen = document.querySelector('#home-screen');
const gameScreen = document.querySelector('.app-shell');
const fullscreenButton = document.querySelector('#fullscreen-button');

function applyTouchLayout() {
  const touchDevice = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  document.documentElement.classList.toggle('touch-layout', touchDevice);
  document.documentElement.classList.toggle('touch-narrow', touchDevice && Math.min(window.innerWidth, window.innerHeight) < 480);
}
applyTouchLayout();
window.addEventListener('resize', applyTouchLayout);

let playerCount = 1;
let pendingPlayerCount = 1;
let game = createGame();
let activePlayer = 0;
let isRevealing = false;
let turnReady = true;
let partyOfferChoices = {};
let partyOfferKey = '';
let audioContext;

function isPartyMode() { return playerCount > 1; }
function syncCurrentPlayer() { activePlayer = Math.max(0, game.currentPlayerId - 1); }
function playerName(playerId = game.currentPlayerId) { return playerCount === 1 ? 'SEN' : `OYUNCU ${playerId}`; }
function format(value) { return currency.format(value); }
function prizeTone(amount) { return amount >= 750_000 ? 'danger' : amount >= 100_000 ? 'premium' : 'standard'; }

function playRevealSound(tone) {
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  if (!AudioEngine) return;
  audioContext ??= new AudioEngine();
  const notes = tone === 'danger' ? [[230, 0], [170, .12], [110, .24]] : tone === 'premium' ? [[370, 0], [310, .13], [330, .26]] : [[523, 0], [659, .1], [784, .2]];
  const wave = tone === 'danger' ? 'sawtooth' : tone === 'premium' ? 'triangle' : 'sine';
  audioContext.resume().then(() => notes.forEach(([frequency, offset]) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = audioContext.currentTime + offset;
    oscillator.type = wave; oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(.11, start + .018); gain.gain.exponentialRampToValueAtTime(.0001, start + .16);
    oscillator.connect(gain).connect(audioContext.destination); oscillator.start(start); oscillator.stop(start + .17);
  })).catch(() => {});
}

function showBoxSelectionPrompt(message) {
  if (!isPartyMode()) return;
  turnReady = false;
  els.turnTitle.textContent = `${playerName()}, kutunu seç`;
  els.turnCopy.textContent = message ?? `Kendine ait final kutusunu seç. Seçiminden sonra sıra diğer oyuncuya geçecek.`;
  if (!els.turnDialog.open) els.turnDialog.showModal();
}

function titleForGame() {
  if (game.status === 'selecting') {
    return ['BAŞLANGIÇ', 'Kutunu seç', isPartyMode() ? `${playerName()} kendi final kutusunu seçsin. Herkes kendi kutusuyla oyuna devam edecek.` : 'Bu kutu finalde senin olacak. Seçimin değiştirilemez.'];
  }
  if (game.status === 'opening') return [`TUR ${game.round + 1} / ${ROUND_SIZES.length}`, `${ROUND_SIZES[game.round] - game.openedThisRound} kutu aç`, isPartyMode() ? `${playerName()} sırada. Sıra her açılışta otomatik ilerler.` : 'Ana kutun hariç bir kutu seç ve risk tablosunu daralt.'];
  if (game.status === 'offer') return [`TUR ${game.round + 1} TAMAMLANDI`, 'Teklif masada', isPartyMode() ? 'Aynı teklif tüm aktif oyuncular için geçerli. Herkes kararını vermeli.' : 'Kazanımını güvenceye alabilir ya da oyuna devam edebilirsin.'];
  if (game.status === 'dealt') return ['KARAR VERİLDİ', 'Teklif kabul edildi', 'Güvenli çıkışı seçtin.'];
  return ['FİNAL', 'Kutular açılıyor', isPartyMode() ? 'Oyunda kalan herkesin kendi kutusundaki sonuç belli oldu.' : 'Sonuç, seçtiğin kutudaydı.'];
}

function renderPrizes() {
  const badge = (box) => `<div class="prize ${prizeTone(box.amount)} ${box.opened ? 'gone' : ''}"><span>${format(box.amount)}</span></div>`;
  const ordered = [...game.boxes].sort((a, b) => a.amount - b.amount);
  const center = ordered[12];
  els.prizeList.innerHTML = `<div class="prize-column">${ordered.slice(0, 12).map(badge).join('')}</div><div class="prize-column">${ordered.slice(13).reverse().map(badge).join('')}</div><div class="prize prize-center ${prizeTone(center.amount)} ${center.opened ? 'gone' : ''}"><span>${format(center.amount)}</span></div>`;
}

function renderBoxes() {
  const makeBox = (box) => {
    const owner = game.players.find((player) => player.boxId === box.id);
    const protectedBox = owner?.status === 'active';
    if (owner && game.status === 'selecting') {
      return `<div class="box selected locked" aria-label="${playerName(owner.id)} kutusu"><span class="box-number">${box.id}</span><span class="box-caption">${playerName(owner.id)}</span></div>`;
    }
    if (protectedBox && game.status !== 'finished' && game.status !== 'dealt') return '<div class="box-slot" aria-hidden="true"></div>';
    const label = box.opened ? format(box.amount) : `KUTU ${box.id}`;
      const caption = box.opened ? 'AÇILDI' : 'MÜHÜRLÜ';
    const disabled = isRevealing || (isPartyMode() && !turnReady) || (game.status !== 'selecting' && game.status !== 'opening');
    return `<button class="box ${box.opened ? `opened ${prizeTone(box.amount)}` : ''}" data-box-id="${box.id}" ${disabled || box.opened ? 'disabled' : ''} aria-label="${label}"><span class="box-number">${box.opened ? label : box.id}</span><span class="box-caption">${caption}</span></button>`;
  };
  els.topBoxes.innerHTML = game.boxes.slice(0, 9).map(makeBox).join('');
  els.leftBoxes.innerHTML = game.boxes.slice(9, 17).map(makeBox).join('');
  els.rightBoxes.innerHTML = game.boxes.slice(17).map(makeBox).join('');
}

function renderPlayerBoxes() {
  const selected = game.players.filter((player) => player.boxId !== null);
  if (!selected.length) { els.playerTable.classList.remove('visible'); els.playerBox.innerHTML = ''; return; }
  const complete = game.status === 'finished' || game.status === 'dealt';
  els.playerTable.classList.add('visible');
  els.playerTableTitle.textContent = isPartyMode() ? 'OYUNCU KUTULARI' : 'SENİN KUTUN';
  if (!isPartyMode()) {
    const player = selected[0];
    const box = game.boxes.find((candidate) => candidate.id === player.boxId);
    els.playerBox.innerHTML = `<div class="table-case ${complete ? 'final-open' : ''}"><span>${complete ? format(box.amount) : box.id}</span><small>${complete ? 'KUTUNDAKİ TUTAR' : 'MÜHÜRLÜ'}</small></div>`;
    return;
  }
  els.playerBox.innerHTML = `<div class="party-cases players-${selected.length}">${selected.map((player) => {
    const settled = player.status === 'dealt' || complete;
    const personalAmount = game.boxes.find((box) => box.id === player.boxId).amount;
    const state = player.status === 'dealt' ? `KUTUSU: ${format(personalAmount)}` : complete ? 'KUTUSU AÇILDI' : 'MÜHÜRLÜ';
    return `<div class="party-case ${settled ? 'settled' : ''} ${player.id === game.currentPlayerId ? 'current' : ''}"><b>${playerName(player.id)}</b><span>${settled ? format(personalAmount) : `KUTU ${player.boxId}`}</span><small>${state}</small></div>`;
  }).join('')}</div>`;
}

function render() {
  syncCurrentPlayer();
  const [round, title, copy] = titleForGame();
  els.round.textContent = round; els.title.textContent = title; els.copy.textContent = copy;
  els.remaining.textContent = remainingAmounts(game).length;
  els.expected.textContent = format(expectedValue(game));
  els.modeButton.textContent = playerCount === 1 ? 'KLASİK MOD' : `${playerCount}P • ${playerName()}`;
  els.bankerName.textContent = playerCount === 1 ? game.banker.name.toUpperCase() : `${playerName()} SIRADA`;
  els.bankerMessage.textContent = playerCount === 1 ? game.banker.message : `Her turdaki teklif tüm aktif oyuncular için aynıdır.`;
  els.progress.innerHTML = ROUND_SIZES.map((_, index) => `<span class="progress-step ${index < game.round ? 'done' : index === game.round ? 'current' : ''}"></span>`).join('');
  renderPrizes(); renderBoxes(); renderPlayerBoxes();
  if (game.status === 'offer' && !isRevealing) {
    els.offerValue.textContent = format(game.offer);
    if (isPartyMode()) {
      const key = `${game.round}:${game.offer}:${game.offerPlayerIds.join('-')}`;
      if (partyOfferKey !== key) { partyOfferKey = key; partyOfferChoices = {}; }
      els.offerCopy.textContent = 'Bu teklif, oyunda kalan tüm oyuncular için aynıdır. Herkes kararını verdikten sonra tur devam eder.';
      els.offerActions.hidden = true;
      els.partyOfferDecisions.hidden = false;
      els.partyOfferConfirm.hidden = false;
      els.partyOfferDecisions.innerHTML = game.offerPlayerIds.map((id) => {
        const choice = partyOfferChoices[id];
        return `<section class="player-offer-choice"><strong>${playerName(id)}</strong><div><button class="offer-choice ${choice === 'continue' ? 'selected continue' : ''}" data-player-id="${id}" data-choice="continue">DEVAM</button><button class="offer-choice ${choice === 'deal' ? 'selected deal' : ''}" data-player-id="${id}" data-choice="deal">KABUL</button></div><small>${choice === 'continue' ? 'Devam etmeyi seçti' : choice === 'deal' ? 'Teklifi kabul etti' : 'Karar bekleniyor'}</small></section>`;
      }).join('');
      els.partyOfferConfirm.disabled = game.offerPlayerIds.some((id) => !partyOfferChoices[id]);
    } else {
      els.offerCopy.textContent = `${game.banker.name}: “${game.banker.message}”`;
      els.offerActions.hidden = false;
      els.partyOfferDecisions.hidden = true;
      els.partyOfferConfirm.hidden = true;
    }
    if (!els.offerDialog.open) els.offerDialog.showModal();
  }
  if ((game.status === 'dealt' || game.status === 'finished') && !isRevealing) showResult();
}

function showResult() {
  if (isPartyMode()) {
    const outcomes = game.players.map((player) => ({ player, amount: playerOutcome(game, player.id) }));
    const winners = winningPlayers(game);
    const highest = winners[0].amount;
    els.resultTitle.textContent = winners.length === 1 ? `Kazanan: ${playerName(winners[0].player.id)}` : 'Beraberlik';
    els.resultCopy.textContent = winners.length === 1 ? `${playerName(winners[0].player.id)} en yüksek tutarla yarışı kazandı.` : 'En yüksek tutar birden fazla oyuncuda olduğu için yarış berabere bitti.';
    els.resultValue.textContent = 'SONUÇLAR';
    els.resultBreakdown.innerHTML = outcomes.map(({ player, amount }) => {
      const personalAmount = game.boxes.find((box) => box.id === player.boxId).amount;
      const detail = player.status === 'dealt' ? `Teklif: ${format(amount)} · Kutusu: ${format(personalAmount)}` : `Kendi kutusu: ${format(personalAmount)}`;
      return `<div class="${amount === highest ? 'winner' : ''}"><span>${playerName(player.id)}</span><strong>${format(amount)}</strong><small>${amount === highest ? 'Kazanan • ' : ''}${detail}</small></div>`;
    }).join('');
  } else {
    const won = outcomeAmount(game);
    const deal = game.status === 'dealt';
    const playerBox = game.boxes.find((box) => box.id === game.playerBoxId);
    els.resultTitle.textContent = deal ? 'Teklif güvence altında' : 'Final kutun açıldı';
    els.resultCopy.textContent = deal ? `Tur ${game.round + 1}'de doğru hissettiğin anı yakaladın. Ana kutunda ${format(playerBox.amount)} vardı.` : 'Son ana kadar devam ettin. Risk yolculuğun burada tamamlandı.';
    els.resultValue.textContent = format(won);
    els.resultBreakdown.innerHTML = '';
  }
  if (!els.resultDialog.open) els.resultDialog.showModal();
}

function reset() {
  [...document.querySelectorAll('dialog')].forEach((dialog) => dialog.close());
  game = createGame(Math.random, playerCount);
  syncCurrentPlayer(); turnReady = !isPartyMode(); isRevealing = false; partyOfferChoices = {}; partyOfferKey = '';
  els.revealCard.classList.remove('has-reveal', 'playing', 'tone-standard', 'tone-premium', 'tone-danger');
  render();
}

function startSinglePlayer() { playerCount = 1; reset(); homeScreen.hidden = true; gameScreen.classList.add('playing'); window.scrollTo({ top: 0, behavior: 'instant' }); }
function openPartyMode() { pendingPlayerCount = 2; document.querySelectorAll('.mode-option').forEach((button) => button.classList.toggle('active', Number(button.dataset.playerCount) === pendingPlayerCount)); document.querySelector('#mode-dialog').showModal(); }
function restartGame() { reset(); if (isPartyMode()) showBoxSelectionPrompt(); }
function showHome() { [...document.querySelectorAll('dialog')].forEach((dialog) => dialog.close()); homeScreen.hidden = false; gameScreen.classList.remove('playing'); window.scrollTo({ top: 0, behavior: 'instant' }); }

function showReveal(box, openerName, afterReveal = () => {}) {
  isRevealing = true;
  const tone = prizeTone(box.amount);
  els.revealLabel.textContent = isPartyMode() ? `${openerName} AÇTI` : 'AÇILAN KUTU';
  els.revealLabel.append(' '); els.revealLabel.append(els.revealNumber);
  els.revealNumber.textContent = `#${box.id}`;
  els.revealValue.textContent = format(box.amount);
  els.revealCard.classList.remove('playing', 'tone-standard', 'tone-premium', 'tone-danger'); els.revealCard.classList.add('has-reveal', `tone-${tone}`);
  void els.revealCard.offsetWidth;
  els.revealCard.classList.add('playing'); render();
  playRevealSound(tone);
  setTimeout(() => {
    isRevealing = false;
    els.revealCard.classList.remove('has-reveal', 'playing');
    afterReveal(); render();
  }, 2300);
}

document.querySelector('.stage-scene').addEventListener('click', (event) => {
  const button = event.target.closest('[data-box-id]'); if (!button) return;
  const id = Number(button.dataset.boxId);
  try {
    if (game.status === 'selecting') {
      game = selectPlayerBox(game, id); syncCurrentPlayer();
      if (isPartyMode() && game.status === 'selecting') showBoxSelectionPrompt();
      render(); return;
    }
    const openerName = playerName();
    game = openBox(game, id); syncCurrentPlayer();
    showReveal(game.boxes.find((box) => box.id === id), openerName);
  } catch (error) { console.warn(error.message); }
});

function handleOffer(decision) {
  els.offerDialog.close();
  try {
    game = decideOffer(game, decision); syncCurrentPlayer();
    render();
  } catch (error) { console.warn(error.message); }
}

document.querySelector('#deal-button').addEventListener('click', () => handleOffer('deal'));
document.querySelector('#continue-button').addEventListener('click', () => handleOffer('continue'));
els.partyOfferDecisions.addEventListener('click', (event) => {
  const button = event.target.closest('[data-player-id][data-choice]'); if (!button) return;
  partyOfferChoices[Number(button.dataset.playerId)] = button.dataset.choice;
  render();
});
els.partyOfferConfirm.addEventListener('click', () => {
  if (game.offerPlayerIds.some((id) => !partyOfferChoices[id])) return;
  els.offerDialog.close();
  try { game = decideOfferBatch(game, partyOfferChoices); syncCurrentPlayer(); partyOfferChoices = {}; partyOfferKey = ''; render(); } catch (error) { console.warn(error.message); }
});
document.querySelector('#restart-button').addEventListener('click', restartGame);
document.querySelector('#play-again-button').addEventListener('click', restartGame);
document.querySelector('#rules-button').addEventListener('click', () => document.querySelector('#rules-dialog').showModal());
document.querySelector('#home-rules-button').addEventListener('click', () => document.querySelector('#home-rules-dialog').showModal());
document.querySelector('#start-single-button').addEventListener('click', startSinglePlayer);
document.querySelector('#start-party-button').addEventListener('click', openPartyMode);
document.querySelector('#home-link').addEventListener('click', (event) => { event.preventDefault(); showHome(); });
fullscreenButton.addEventListener('click', async () => {
  if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch (error) { console.warn('Tam ekrandan çıkılamadı:', error.message); } screen.orientation?.unlock?.(); return; }
  try { await gameScreen.requestFullscreen(); } catch (error) { console.warn('Tam ekran açılamadı:', error.message); return; }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* Yön kilidi yoksa uyumlu yatay sahne düzeni çalışır. */ }
});
document.addEventListener('fullscreenchange', () => {
  const active = document.fullscreenElement === gameScreen;
  fullscreenButton.textContent = active ? '×' : '⛶'; fullscreenButton.title = active ? 'Tam ekrandan çık' : 'Tam ekran';
  gameScreen.classList.toggle('fullscreen-active', active); gameScreen.classList.toggle('landscape-stage', active);
  if (!active) screen.orientation?.unlock?.();
});
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => document.querySelector(`#${button.dataset.close}`).close()));
els.modeButton.addEventListener('click', () => { pendingPlayerCount = playerCount; document.querySelectorAll('.mode-option').forEach((button) => button.classList.toggle('active', Number(button.dataset.playerCount) === pendingPlayerCount)); document.querySelector('#mode-dialog').showModal(); });
document.querySelectorAll('.mode-option').forEach((button) => button.addEventListener('click', () => { pendingPlayerCount = Number(button.dataset.playerCount); document.querySelectorAll('.mode-option').forEach((item) => item.classList.toggle('active', item === button)); }));
document.querySelector('#start-mode-button').addEventListener('click', () => {
  playerCount = pendingPlayerCount; reset(); homeScreen.hidden = true; gameScreen.classList.add('playing'); window.scrollTo({ top: 0, behavior: 'instant' });
  if (isPartyMode()) showBoxSelectionPrompt();
});
els.turnStart.addEventListener('click', () => { turnReady = true; els.turnDialog.close(); render(); });
render();
