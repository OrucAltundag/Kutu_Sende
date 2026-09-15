const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const BANKERS = {
  analyst: {
    id: 'analyst',
    name: 'Analist',
    icon: '◈',
    story: 'Sayılardaki küçük değişimleri izler; dengeli bir havuz gördüğünde masaya daha güçlü gelir.',
    message: 'Olasılıkları dikkatle izliyorum.'
  },
  strategist: {
    id: 'strategist',
    name: 'Stratejist',
    icon: '♟',
    story: 'Karar geçmişini okur ve doğru anda cesaretini sınar. Her teklif onun için bir pazarlık hamlesidir.',
    message: 'Cesaretinin bir bedeli olmalı.'
  },
  riskHunter: {
    id: 'riskHunter',
    name: 'Risk Avcısı',
    icon: '⚡',
    story: 'Büyük ödüller ile düşük tabanlı havuzların gerilimini kovalar; belirsizlikten beslenir.',
    message: 'Belirsizlik arttıkça pazarlık güçlenir.'
  }
};

export const BANKER_LIST = Object.values(BANKERS);

function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function seededUnit(seed, key = '') {
  return hash(`${seed}:${key}`) / 4294967296;
}

export function chooseBanker(seed) {
  return BANKER_LIST[Math.floor(seededUnit(seed, 'banker') * BANKER_LIST.length)] ?? BANKER_LIST[0];
}

export function chooseMood(seed) {
  const value = seededUnit(seed, 'mood');
  return value < .25 ? 'temkinli' : value > .75 ? 'agresif' : 'dengeli';
}

export function analyzeRemainingRewards(rewards) {
  const values = [...rewards].filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return { count: 0, sum: 0, mean: 0, median: 0, min: 0, max: 0, variance: 0, stdDev: 0, coefficientOfVariation: 0, highValueCount: 0, highValueShare: 0, floorShare: 0 };
  const sum = values.reduce((total, value) => total + value, 0);
  const mean = sum / values.length;
  const median = values.length % 2 ? values[(values.length - 1) / 2] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
  const variance = values.reduce((total, value) => total + ((value - mean) ** 2), 0) / values.length;
  const highThreshold = Math.max(100_000, mean * 2);
  const highValues = values.filter((value) => value >= highThreshold);
  const floorValues = values.filter((value) => value <= Math.max(median, mean * .25));
  return {
    count: values.length, sum, mean, median, min: values[0], max: values.at(-1), variance,
    stdDev: Math.sqrt(variance), coefficientOfVariation: mean ? Math.sqrt(variance) / mean : 0,
    highValueCount: highValues.length, highValueShare: highValues.reduce((total, value) => total + value, 0) / sum,
    floorShare: floorValues.length / values.length
  };
}

function moodMultiplier(mood, range) {
  return mood === 'agresif' ? 1 - range : mood === 'temkinli' ? 1 + range : 1;
}

function playerHistory(history, playerId) {
  return history.filter((entry) => entry.playerId === playerId);
}

function roundOffer(value) {
  return Math.max(1, Math.round(value / 100) * 100);
}

export function calculateBankerOffer({ banker, mood, statistics, roundIndex, totalRounds, nextRoundBoxes, playerId, riskScore = 0, history = [], seed = 1 }) {
  const progress = clamp((roundIndex + 1) / Math.max(totalRounds, 1), 0, 1);
  const volatility = clamp(statistics.coefficientOfVariation, 0, 4);
  const previous = playerHistory(history, playerId);
  const unit = seededUnit(seed, `${banker.id}:${roundIndex}:${playerId}:${previous.length}`);
  let factor;
  let note;

  if (banker.id === 'analyst') {
    factor = .64 + progress * .31 - Math.min(.12, volatility * .035);
    factor *= moodMultiplier(mood, .025) * (.975 + unit * .05);
    note = volatility > 1.5 ? 'Havuz dalgalı; denge payını koruyorum.' : 'Veriler masadaki dengeyi gösteriyor.';
  } else if (banker.id === 'strategist') {
    const baitCount = previous.filter((entry) => entry.bait).length;
    const hasRepeatedContinue = previous.slice(-2).every((entry) => entry.decision === 'continue') && previous.length >= 2;
    const bait = hasRepeatedContinue && baitCount < 2 && progress < .8;
    factor = .62 + progress * .30 - volatility * .025;
    factor += clamp((45 - riskScore) / 1000, -.045, .045);
    if (bait) factor += .05;
    factor *= moodMultiplier(mood, .035) * (.97 + unit * .06);
    note = bait ? 'Bu tur masada kalmanı istiyorum.' : riskScore > 65 ? 'Cesaretini ölçen bir teklif.' : 'Pazarlık için dengeli bir an.';
  } else {
    const highHitChance = statistics.count ? 1 - ((Math.max(statistics.count - statistics.highValueCount, 0) / statistics.count) ** Math.max(nextRoundBoxes, 1)) : 0;
    const downside = statistics.floorShare * .07;
    factor = .66 + progress * .27 - volatility * .045 - highHitChance * .08 + downside;
    factor *= moodMultiplier(mood, .06) * (.92 + unit * .16);
    note = highHitChance > .4 ? 'Büyük ödüller hâlâ oyunu keskin tutuyor.' : 'Risk tabanı zayıfladı; teklifimi yükseltiyorum.';
  }

  const capped = clamp(statistics.mean * factor, 1, statistics.mean * 1.08);
  return { amount: roundOffer(capped), factor, note, bait: banker.id === 'strategist' && note.startsWith('Bu tur') };
}

export function nextRiskScore(currentScore, decision, offeredAmount, expectedValue) {
  const ratio = expectedValue ? offeredAmount / expectedValue : 0;
  if (decision === 'deal') return clamp(currentScore - (ratio >= .8 ? 10 : 5), 0, 100);
  return clamp(currentScore + (ratio >= .85 ? 12 : ratio >= .65 ? 7 : 3), 0, 100);
}
