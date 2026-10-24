const FVG_DEFAULTS = {
  atrPeriod: 14,
  minBodyAtr: 0.8,
  minGapAtr: 0.1,
  maxWait: 6,
  slBufferAtr: 0.1,
  rr: 2
};

function normalizeFvgOptions(options = {}) {
  const input = { ...FVG_DEFAULTS, ...(options && typeof options === "object" ? options : {}) };
  const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  return {
    atrPeriod: Math.max(1, Math.min(500, Math.floor(numberOr(input.atrPeriod, FVG_DEFAULTS.atrPeriod)))),
    minBodyAtr: Math.max(0, Math.min(20, numberOr(input.minBodyAtr, FVG_DEFAULTS.minBodyAtr))),
    minGapAtr: Math.max(0, Math.min(20, numberOr(input.minGapAtr, FVG_DEFAULTS.minGapAtr))),
    maxWait: Math.max(1, Math.min(500, Math.floor(numberOr(input.maxWait, FVG_DEFAULTS.maxWait)))),
    slBufferAtr: Math.max(0, Math.min(20, numberOr(input.slBufferAtr, FVG_DEFAULTS.slBufferAtr))),
    rr: Math.max(0.01, Math.min(100, numberOr(input.rr, FVG_DEFAULTS.rr)))
  };
}

function validCandle(candle) {
  return Boolean(candle) &&
    [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) &&
    candle.high >= Math.max(candle.open, candle.close) &&
    candle.low <= Math.min(candle.open, candle.close);
}

function atrAt(candles, index, period) {
  const start = Math.max(0, index - period + 1);
  let sum = 0;
  let count = 0;
  for (let i = start; i <= index; i += 1) {
    const candle = candles[i];
    const previousClose = i > 0 ? candles[i - 1].close : candle.open;
    sum += Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
    count += 1;
  }
  return count ? sum / count : 0;
}

function scanFVG(candles, options = {}) {
  const settings = normalizeFvgOptions(options);
  if (!Array.isArray(candles) || candles.length < 4 || !candles.every(validCandle)) return [];

  const signals = [];
  for (let i = 2; i < candles.length; i += 1) {
    const first = candles[i - 2];
    const displacement = candles[i - 1];
    const third = candles[i];
    const atr = atrAt(candles, i - 1, settings.atrPeriod);
    if (!(atr > 0)) continue;

    if (Math.abs(displacement.close - displacement.open) < settings.minBodyAtr * atr) continue;

    let direction = null;
    let top;
    let bottom;
    if (displacement.close > displacement.open && third.low > first.high) {
      direction = "ขาขึ้น";
      top = third.low;
      bottom = first.high;
    } else if (displacement.close < displacement.open && third.high < first.low) {
      direction = "ขาลง";
      top = first.low;
      bottom = third.high;
    }
    if (!direction || top - bottom < settings.minGapAtr * atr) continue;

    const bullish = direction === "ขาขึ้น";
    let touched = false;
    let extreme = bullish ? Infinity : -Infinity;
    const lastWaitIndex = Math.min(candles.length - 1, i + settings.maxWait);

    for (let k = i + 1; k <= lastWaitIndex; k += 1) {
      const candle = candles[k];
      if (bullish ? candle.close < bottom : candle.close > top) break;

      if (bullish ? candle.low <= top : candle.high >= bottom) {
        touched = true;
        extreme = bullish ? Math.min(extreme, candle.low) : Math.max(extreme, candle.high);
      }
      if (!touched) continue;

      const confirmed = bullish
        ? candle.close > candle.open && candle.close > top
        : candle.close < candle.open && candle.close < bottom;
      if (!confirmed) continue;

      const buffer = settings.slBufferAtr * atrAt(candles, k, settings.atrPeriod);
      const entry = candle.close;
      const stopLoss = bullish ? extreme - buffer : extreme + buffer;
      const risk = Math.abs(entry - stopLoss);
      if (!(risk > 0)) break;
      const takeProfit = bullish ? entry + settings.rr * risk : entry - settings.rr * risk;
      signals.push({
        index: k,
        fvgIndex: i - 1,
        direction,
        entry,
        stopLoss,
        takeProfit,
        gap: { top, bottom },
        rr: settings.rr
      });
      break;
    }
  }
  return signals.sort((a, b) => a.index - b.index || a.fvgIndex - b.fvgIndex);
}

function detectPattern(candles, options = {}) {
  if (!Array.isArray(candles) || !candles.length) return null;
  const signals = scanFVG(candles, options);
  const last = signals[signals.length - 1];
  return last && last.index === candles.length - 1 ? last : null;
}

function buildFvgDetectorCode(options = {}) {
  const settings = normalizeFvgOptions(options);
  return [
    "/** Fair Value Gap: displacement, three-candle gap, pullback and rejection. */",
    `const FVG_DEFAULTS = Object.freeze(${JSON.stringify(settings, null, 2)});`,
    normalizeFvgOptions.toString(),
    validCandle.toString(),
    atrAt.toString(),
    scanFVG.toString(),
    detectPattern.toString(),
    "if (typeof module !== 'undefined') module.exports = { scanFVG, detectPattern, FVG_DEFAULTS };"
  ].join("\n\n");
}

module.exports = { FVG_DEFAULTS, buildFvgDetectorCode, detectPattern, scanFVG };
