import { PRIZES, playerOutcome } from './game-engine.mjs?v=20260915-3';

const byAmount = (left, right) => right.amount - left.amount || left.player.id - right.player.id;
const playerBoxValue = (game, player) => game.boxes.find((box) => box.id === player.boxId)?.amount ?? 0;

export function buildMatchSummary(game) {
  const ranking = game.players.map((player) => ({ player, amount: playerOutcome(game, player.id), boxValue: playerBoxValue(game, player) })).sort(byAmount);
  const playerEvents = (id) => game.decisions.filter((entry) => entry.playerId === id);
  const awards = [];
  const brave = game.players.map((player) => {
    const rejected = playerEvents(player.id).filter((entry) => entry.decision === 'continue');
    return { player, count: rejected.length, total: rejected.reduce((sum, entry) => sum + entry.offer, 0) };
  }).sort((a, b) => b.count - a.count || b.total - a.total)[0];
  if (brave?.count) awards.push({ id: 'brave', icon: '🔥', title: 'EN CESUR', playerId: brave.player.id, text: `${brave.count} teklifi reddetti (${brave.total.toLocaleString('tr-TR')} TL).` });

  const deals = ranking.filter(({ player }) => player.status === 'dealt');
  const beat = deals.map((entry) => ({ ...entry, difference: entry.amount - entry.boxValue })).filter((entry) => entry.difference > 0).sort((a, b) => b.difference - a.difference)[0];
  if (beat) awards.push({ id: 'beat-banker', icon: '🧠', title: 'BANKACIYI YENDİ', playerId: beat.player.id, text: `${beat.difference.toLocaleString('tr-TR')} TL avantaj sağladı.` });
  const regret = deals.map((entry) => ({ ...entry, difference: entry.boxValue - entry.amount })).filter((entry) => entry.difference > 0).sort((a, b) => b.difference - a.difference)[0];
  if (regret) awards.push({ id: 'regret', icon: '💀', title: 'GECENİN PİŞMANLIĞI', playerId: regret.player.id, text: `${regret.difference.toLocaleString('tr-TR')} TL daha fazlasını kutusunda bıraktı.` });
  const close = deals.map((entry) => ({ ...entry, ratio: Math.abs(entry.amount - entry.boxValue) / Math.max(entry.amount, entry.boxValue, 1) })).filter((entry) => entry.ratio <= .1).sort((a, b) => a.ratio - b.ratio)[0];
  if (close) awards.push({ id: 'close', icon: '🎯', title: 'KIL PAYI', playerId: close.player.id, text: `Teklif ve kutu değeri neredeyse aynıydı.` });
  game.players.filter((player) => player.status !== 'dealt').forEach((player) => awards.push({ id: `finish-${player.id}`, icon: '🛡️', title: 'SONUNA KADAR', playerId: player.id, text: 'Hiçbir teklifi kabul etmeden finale kaldı.' }));
  ranking.filter((entry) => entry.boxValue >= Math.max(...PRIZES) * .8).forEach((entry) => awards.push({ id: `jackpot-${entry.player.id}`, icon: '💰', title: 'JACKPOT AVCISI', playerId: entry.player.id, text: `Final kutusunda ${entry.boxValue.toLocaleString('tr-TR')} TL vardı.` }));
  const favorite = game.players.map((player) => ({ player, total: playerEvents(player.id).reduce((sum, entry) => sum + entry.offer, 0) })).sort((a, b) => b.total - a.total)[0];
  if (favorite?.total) awards.push({ id: 'favorite', icon: '⭐', title: 'BANKACININ FAVORİSİ', playerId: favorite.player.id, text: `Toplam ${favorite.total.toLocaleString('tr-TR')} TL teklif aldı.` });
  const highlights = game.decisions.slice(-6).map((entry) => ({ ...entry, boxValue: playerBoxValue(game, game.players.find((player) => player.id === entry.playerId)) }));
  return { ranking, awards: awards.slice(0, 4), highlights };
}
