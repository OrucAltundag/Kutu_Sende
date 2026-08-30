import { ROUND_SIZES, createGame, decideOffer, expectedValue, openBox, outcomeAmount, remainingAmounts, selectPlayerBox } from './game-engine.mjs';

const currency = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
const els = {
  topBoxes: document.querySelector('#top-boxes'), leftBoxes: document.querySelector('#left-boxes'), rightBoxes: document.querySelector('#right-boxes'), prizeList: document.querySelector('#prize-list'), round: document.querySelector('#round-label'),
  title: document.querySelector('#status-title'), copy: document.querySelector('#status-copy'), progress: document.querySelector('#progress-bar'),
  remaining: document.querySelector('#remaining-count'), expected: document.querySelector('#expected-value'), bankerName: document.querySelector('#banker-name'), bankerMessage: document.querySelector('#banker-message'),
  offerDialog: document.querySelector('#offer-dialog'), offerValue: document.querySelector('#offer-value'), offerCopy: document.querySelector('#offer-copy'),
  resultDialog: document.querySelector('#result-dialog'), resultTitle: document.querySelector('#result-title'), resultCopy: document.querySelector('#result-copy'), resultValue: document.querySelector('#result-value'),
  playerTable: document.querySelector('#player-table'), playerBox: document.querySelector('#player-box-holder'), revealCard: document.querySelector('#reveal-card'), revealLabel: document.querySelector('#reveal-label'), revealNumber: document.querySelector('#reveal-number'), revealValue: document.querySelector('#reveal-value')
};
const homeScreen = document.querySelector('#home-screen');
const gameScreen = document.querySelector('.app-shell');
let game = createGame();
let isRevealing = false;
let playerCount = 1;
let activePlayer = 0;
let pendingPlayerCount = 1;

function playerName() { return playerCount === 1 ? 'SEN' : `OYUNCU ${activePlayer + 1}`; }
function advancePlayer() { if (playerCount > 1) activePlayer = (activePlayer + 1) % playerCount; }

function format(value) { return currency.format(value); }
function titleForGame() {
  if (game.status === 'selecting') return ['BAŞLANGIÇ', 'Kutunu seç', playerCount === 1 ? 'Bu kutu finalde senin olacak. Seçimin değiştirilemez.' : `${playerName()} ortak kutuyu seçsin; ardından herkes sırayla oynayacak.`];
  if (game.status === 'opening') return [`TUR ${game.round + 1} / ${ROUND_SIZES.length}`, `${ROUND_SIZES[game.round] - game.openedThisRound} kutu aç`, playerCount === 1 ? 'Ana kutun hariç bir kutu seç ve risk tablosunu daralt.' : `${playerName()} sırada. Bir kutu seç ve cihazı sonraki oyuncuya ver.`];
  if (game.status === 'offer') return [`TUR ${game.round + 1} TAMAMLANDI`, 'Teklif masada', playerCount === 1 ? 'Kazanımını güvenceye alabilir ya da oyuna devam edebilirsin.' : `${playerName()} teklif kararını veriyor.`];
  if (game.status === 'dealt') return ['KARAR VERİLDİ', 'Teklif kabul edildi', 'Güvenli çıkışı seçtin.'];
  return ['FİNAL', 'Ana kutun açılıyor', 'Sonuç, seçtiğin kutudaydı.'];
}
function renderPrizes() {
  const classFor = (box) => box.amount >= 750_000 ? 'danger' : box.amount >= 100_000 ? 'premium' : 'standard';
  const badge = (box) => {
    return `<div class="prize ${classFor(box)} ${box.opened ? 'gone' : ''}"><span>${format(box.amount)}</span></div>`;
  };
  const ordered = [...game.boxes].sort((a, b) => a.amount - b.amount);
  const center = ordered[12];
  els.prizeList.innerHTML = `<div class="prize-column">${ordered.slice(0, 12).map(badge).join('')}</div><div class="prize-column">${ordered.slice(13).reverse().map(badge).join('')}</div><div class="prize prize-center ${classFor(center)} ${center.opened ? 'gone' : ''}"><span>${format(center.amount)}</span></div>`;
}
function renderBoxes() {
  const makeBox = (box) => {
    if (box.id === game.playerBoxId && game.status !== 'selecting') return '<div class="box-slot" aria-hidden="true"></div>';
    const playerBox = box.id === game.playerBoxId;
    const label = box.opened ? format(box.amount) : `KUTU ${box.id}`;
    const caption = box.opened ? 'AÇILDI' : playerBox ? 'SENİN KUTUN' : 'MÜHÜRLÜ';
    const disabled = isRevealing || (game.status !== 'selecting' && game.status !== 'opening');
    return `<button class="box ${box.opened ? 'opened' : ''} ${playerBox ? 'selected' : ''}" data-box-id="${box.id}" ${disabled || box.opened ? 'disabled' : ''} aria-label="${label}"><span class="box-number">${box.opened ? label : box.id}</span><span class="box-caption">${caption}</span></button>`;
  };
  els.topBoxes.innerHTML = game.boxes.slice(0, 9).map(makeBox).join('');
  els.leftBoxes.innerHTML = game.boxes.slice(9, 17).map(makeBox).join('');
  els.rightBoxes.innerHTML = game.boxes.slice(17).map(makeBox).join('');
}
function renderPlayerBox() {
  if (!game.playerBoxId) { els.playerTable.classList.remove('visible'); els.playerBox.innerHTML = ''; return; }
  const box = game.boxes.find((candidate) => candidate.id === game.playerBoxId);
  const final = game.status === 'finished';
  els.playerTable.classList.add('visible');
  els.playerBox.innerHTML = `<div class="table-case ${final ? 'final-open' : ''}"><span>${final ? format(box.amount) : box.id}</span><small>${final ? 'FİNALDE AÇILDI' : 'MÜHÜRLÜ'}</small></div>`;
}
function render() {
  const [round, title, copy] = titleForGame();
  els.round.textContent = round; els.title.textContent = title; els.copy.textContent = copy;
  els.remaining.textContent = remainingAmounts(game).length;
  els.expected.textContent = format(expectedValue(game));
  els.bankerName.textContent = playerCount === 1 ? game.banker.name.toUpperCase() : `${playerName()} SIRADA`;
  els.bankerMessage.textContent = playerCount === 1 ? game.banker.message : `Parti modu: ${playerCount} oyuncu, tek cihaz.`;
  els.progress.innerHTML = ROUND_SIZES.map((_, index) => `<span class="progress-step ${index < game.round ? 'done' : index === game.round ? 'current' : ''}"></span>`).join('');
  renderPrizes(); renderBoxes(); renderPlayerBox();
  if (game.status === 'offer' && !isRevealing) { els.offerValue.textContent = format(game.offer); els.offerCopy.textContent = `${game.banker.name}: “${game.banker.message}”`; els.offerDialog.showModal(); }
  if ((game.status === 'dealt' || game.status === 'finished') && !isRevealing) showResult();
}
function showResult() {
  const won = outcomeAmount(game);
  const deal = game.status === 'dealt';
  const playerBox = game.boxes.find((box) => box.id === game.playerBoxId);
  els.resultTitle.textContent = deal ? 'Teklif güvence altında' : 'Final kutun açıldı';
  els.resultCopy.textContent = deal ? `Tur ${game.round + 1}'de doğru hissettiğin anı yakaladın. Ana kutunda ${format(playerBox.amount)} vardı.` : `Son ana kadar devam ettin. Risk yolculuğun burada tamamlandı.`;
  els.resultValue.textContent = format(won);
  if (!els.resultDialog.open) els.resultDialog.showModal();
}
function reset() { [...document.querySelectorAll('dialog')].forEach((dialog) => dialog.close()); game = createGame(); activePlayer = 0; render(); }
function startSinglePlayer() { playerCount = 1; activePlayer = 0; document.querySelector('#mode-button').textContent = 'KLASİK MOD'; reset(); homeScreen.hidden = true; gameScreen.classList.add('playing'); window.scrollTo({ top: 0, behavior: 'instant' }); }
function showHome() { [...document.querySelectorAll('dialog')].forEach((dialog) => dialog.close()); homeScreen.hidden = false; gameScreen.classList.remove('playing'); window.scrollTo({ top: 0, behavior: 'instant' }); }
function showReveal(box) {
  isRevealing = true;
  els.revealLabel.textContent = 'AÇILAN KUTU';
  els.revealNumber.textContent = box.id;
  els.revealValue.textContent = format(box.amount);
  els.revealCard.classList.remove('playing');
  void els.revealCard.offsetWidth;
  els.revealCard.classList.add('playing');
  render();
  setTimeout(() => { isRevealing = false; els.revealCard.classList.remove('playing'); render(); }, 1450);
}

document.querySelector('.stage-scene').addEventListener('click', (event) => {
  const button = event.target.closest('[data-box-id]'); if (!button) return;
  const id = Number(button.dataset.boxId);
  try {
    if (game.status === 'selecting') { game = selectPlayerBox(game, id); if (playerCount > 1) advancePlayer(); render(); return; }
    game = openBox(game, id);
    showReveal(game.boxes.find((box) => box.id === id));
    advancePlayer();
  } catch (error) { console.warn(error.message); }
});
document.querySelector('#deal-button').addEventListener('click', () => { els.offerDialog.close(); game = decideOffer(game, 'deal'); render(); });
document.querySelector('#continue-button').addEventListener('click', () => { els.offerDialog.close(); game = decideOffer(game, 'continue'); advancePlayer(); render(); });
document.querySelector('#restart-button').addEventListener('click', reset);
document.querySelector('#play-again-button').addEventListener('click', reset);
document.querySelector('#rules-button').addEventListener('click', () => document.querySelector('#rules-dialog').showModal());
document.querySelector('#home-rules-button').addEventListener('click', () => document.querySelector('#home-rules-dialog').showModal());
document.querySelector('#start-single-button').addEventListener('click', startSinglePlayer);
document.querySelector('#home-link').addEventListener('click', (event) => { event.preventDefault(); showHome(); });
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => document.querySelector(`#${button.dataset.close}`).close()));
document.querySelector('#mode-button').addEventListener('click', () => { pendingPlayerCount = playerCount; document.querySelectorAll('.mode-option').forEach((button) => button.classList.toggle('active', Number(button.dataset.playerCount) === pendingPlayerCount)); document.querySelector('#mode-dialog').showModal(); });
document.querySelectorAll('.mode-option').forEach((button) => button.addEventListener('click', () => { pendingPlayerCount = Number(button.dataset.playerCount); document.querySelectorAll('.mode-option').forEach((item) => item.classList.toggle('active', item === button)); }));
document.querySelector('#start-mode-button').addEventListener('click', () => { playerCount = pendingPlayerCount; document.querySelector('#mode-button').textContent = playerCount === 1 ? 'KLASİK MOD' : `${playerCount} OYUNCULU PARTİ`; reset(); });
render();
