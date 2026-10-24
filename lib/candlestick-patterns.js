const BASE_SETTINGS = {
  atrPeriod: 14,
  minBodyAtr: 0.35,
  largeBodyAtr: 0.65,
  dojiMaxBodyRatio: 0.12,
  smallBodyFraction: 0.35,
  longWickRatio: 2,
  shortWickFraction: 0.55,
  maxWickToBody: 0.8,
  engulfingToleranceAtr: 0.08,
  priceToleranceAtr: 0.1,
  trendPeriod: 4,
  minTrendAtr: 0.3,
  minSoldierBodyAtr: 0.35,
  maxMarubozuWickRatio: 0.12
};

const PRESETS = {
  strict: {
    minBodyAtr: 0.45, largeBodyAtr: 0.8, dojiMaxBodyRatio: 0.08,
    smallBodyFraction: 0.28, longWickRatio: 2.5, shortWickFraction: 0.38,
    maxWickToBody: 0.55, engulfingToleranceAtr: 0.04, priceToleranceAtr: 0.05,
    trendPeriod: 4, minTrendAtr: 0.45,
    minSoldierBodyAtr: 0.5, maxMarubozuWickRatio: 0.07
  },
  standard: {},
  flexible: {
    minBodyAtr: 0.22, largeBodyAtr: 0.5, dojiMaxBodyRatio: 0.18,
    smallBodyFraction: 0.48, longWickRatio: 1.5, shortWickFraction: 0.8,
    maxWickToBody: 1.1, engulfingToleranceAtr: 0.16, priceToleranceAtr: 0.18,
    trendPeriod: 3, minTrendAtr: 0.15,
    minSoldierBodyAtr: 0.24, maxMarubozuWickRatio: 0.2
  }
};

const PATTERN_LABELS = {
  doji: "Doji",
  hammer: "Hammer / ค้อนกลับตัวขาขึ้น",
  hangingMan: "Hanging Man",
  invertedHammer: "Inverted Hammer",
  shootingStar: "Shooting Star",
  bullishPinBar: "Bullish Pin Bar",
  bearishPinBar: "Bearish Pin Bar",
  bullishEngulfing: "Bullish Engulfing",
  bearishEngulfing: "Bearish Engulfing",
  bullishHarami: "Bullish Harami",
  bearishHarami: "Bearish Harami",
  morningStar: "Morning Star",
  eveningStar: "Evening Star",
  threeWhiteSoldiers: "Three White Soldiers",
  threeBlackCrows: "Three Black Crows",
  insideBar: "Inside Bar",
  tweezerBottom: "Tweezer Bottom",
  tweezerTop: "Tweezer Top",
  bullishPiercing: "Piercing Line",
  bearishDarkCloud: "Dark Cloud Cover",
  bullishMarubozu: "Bullish Marubozu",
  bearishMarubozu: "Bearish Marubozu"
};

function normalizeText(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s_-]+/g, " ").trim();
}

function classifyCandlestickPattern(patternName, description, bias = "neutral") {
  const text = normalizeText(patternName + " " + description);
  const has = (...terms) => terms.some(term => text.includes(term));
  if (has("three white soldiers", "three soldiers", "ทหารขาวสามนาย")) return "threeWhiteSoldiers";
  if (has("three black crows", "three crows", "อีกาสามตัว")) return "threeBlackCrows";
  if (has("morning star", "morning doji star", "ดาวรุ่ง")) return "morningStar";
  if (has("evening star", "evening doji star", "ดาวค่ำ")) return "eveningStar";
  if (has("dark cloud", "dark-cloud", "เมฆดำ")) return "bearishDarkCloud";
  if (has("piercing line", "piercing pattern", "piercing", "เส้น piercing")) return "bullishPiercing";
  if (has("shooting star", "shooting-star", "ดาวตก")) return "shootingStar";
  if (has("inverted hammer", "inverted-hammer", "ค้อนกลับหัว")) return "invertedHammer";
  if (has("hanging man", "hanging-man")) return "hangingMan";
  if (has("tweezer bottom", "tweezer low", "แหนบก้น")) return "tweezerBottom";
  if (has("tweezer top", "tweezer high", "แหนบยอด")) return "tweezerTop";
  if (has("inside bar", "inside candle", "แท่งใน")) return "insideBar";
  if (has("marubozu", "มารูโบซุ")) return bias === "bearish" || has("bearish", "ขาลง") ? "bearishMarubozu" : "bullishMarubozu";
  if (has("pin bar", "pinbar", "แท่ง pin", "แท่งปฏิเสธ")) return bias === "bearish" || has("bearish", "ขาลง") ? "bearishPinBar" : "bullishPinBar";
  if (has("engulfing", "engulf", "กลืนกิน", "แท่งกลืน")) return bias === "bearish" || has("bearish", "ขาลง") ? "bearishEngulfing" : "bullishEngulfing";
  if (has("harami", "ฮารามิ")) return bias === "bearish" || has("bearish", "ขาลง") ? "bearishHarami" : "bullishHarami";
  if (has("doji", "โดจิ")) return "doji";
  if (has("hammer", "ค้อน")) return "hammer";
  return null;
}

function validCandles(candles) {
  return Array.isArray(candles) && candles.length > 0 && candles.every(candle =>
    candle && [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) &&
    candle.high >= Math.max(candle.open, candle.close) &&
    candle.low <= Math.min(candle.open, candle.close) && candle.high >= candle.low
  );
}

function trueRangeAt(candles, index) {
  const candle = candles[index];
  const previousClose = index > 0 ? candles[index - 1].close : candle.open;
  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - previousClose),
    Math.abs(candle.low - previousClose)
  );
}

function averageTrueRange(candles, endIndex, period) {
  const startIndex = Math.max(0, endIndex - period + 1);
  let sum = 0;
  let count = 0;
  for (let i = startIndex; i <= endIndex; i += 1) {
    sum += trueRangeAt(candles, i);
    count += 1;
  }
  return count ? sum / count : 0;
}

function candleParts(candle) {
  const range = candle.high - candle.low;
  const body = Math.abs(candle.close - candle.open);
  return {
    range,
    body,
    bodyRatio: range ? body / range : 0,
    upperWick: candle.high - Math.max(candle.open, candle.close),
    lowerWick: Math.min(candle.open, candle.close) - candle.low,
    bullish: candle.close > candle.open,
    bearish: candle.close < candle.open
  };
}

function hasTrend(candles, beforeIndex, direction, settings) {
  const start = beforeIndex - settings.trendPeriod;
  if (start < 0 || beforeIndex > candles.length) return false;
  const context = candles.slice(start, beforeIndex);
  if (context.length !== settings.trendPeriod || context.length < 3) return false;
  const atr = averageTrueRange(candles, beforeIndex - 1, settings.atrPeriod);
  if (!(atr > 0)) return false;
  const signedMove = direction === "up"
    ? context.at(-1).close - context[0].close
    : context[0].close - context.at(-1).close;
  const alignedMoves = context.slice(1).filter((candle, index) => direction === "up"
    ? candle.close > context[index].close
    : candle.close < context[index].close).length;
  return signedMove >= atr * settings.minTrendAtr && alignedMoves >= Math.ceil((context.length - 1) * 0.6);
}

function detectCandlestickPattern(candles, kind, settings) {
  const lengths = {
    doji: 1, hammer: 1, hangingMan: 1, invertedHammer: 1, shootingStar: 1,
    bullishPinBar: 1, bearishPinBar: 1, bullishEngulfing: 2, bearishEngulfing: 2,
    bullishHarami: 2, bearishHarami: 2, insideBar: 2, tweezerBottom: 2,
    tweezerTop: 2, bullishPiercing: 2, bearishDarkCloud: 2, morningStar: 3,
    eveningStar: 3, threeWhiteSoldiers: 3, threeBlackCrows: 3,
    bullishMarubozu: 1, bearishMarubozu: 1
  };
  const required = lengths[kind];
  if (!required || !validCandles(candles) || candles.length < required) return false;
  const beforeIndex = candles.length - required;
  const atr = averageTrueRange(candles, Math.max(0, beforeIndex - 1), settings.atrPeriod);
  if (!(atr > 0)) return false;
  const bars = candles.slice(-required);
  const parts = bars.map(candleParts);
  const last = bars[bars.length - 1];
  const lastParts = parts[parts.length - 1];
  const tolerance = settings.priceToleranceAtr * atr;
  const engulfingTolerance = settings.engulfingToleranceAtr * atr;
  const hasLongLowerWick = p => p.lowerWick >= Math.max(p.body * settings.longWickRatio, atr * settings.minBodyAtr) &&
    p.upperWick <= Math.max(p.body * settings.shortWickFraction, p.range * 0.06);
  const hasLongUpperWick = p => p.upperWick >= Math.max(p.body * settings.longWickRatio, atr * settings.minBodyAtr) &&
    p.lowerWick <= Math.max(p.body * settings.shortWickFraction, p.range * 0.06);
  const between = (value, low, high, pad = 0) => value >= low - pad && value <= high + pad;
  const midpoint = (candle) => (candle.open + candle.close) / 2;

  switch (kind) {
    case "doji":
      return lastParts.range >= atr * 0.15 && lastParts.bodyRatio <= settings.dojiMaxBodyRatio;
    case "hammer":
      return hasTrend(candles, beforeIndex, "down", settings) && hasLongLowerWick(lastParts) &&
        last.close >= last.low + lastParts.range * 0.6;
    case "hangingMan":
      return hasTrend(candles, beforeIndex, "up", settings) && hasLongLowerWick(lastParts) &&
        last.close >= last.low + lastParts.range * 0.6;
    case "invertedHammer":
      return hasTrend(candles, beforeIndex, "down", settings) && hasLongUpperWick(lastParts) &&
        Math.min(last.open, last.close) <= last.low + lastParts.range * 0.45;
    case "shootingStar":
      return hasTrend(candles, beforeIndex, "up", settings) && hasLongUpperWick(lastParts) &&
        Math.max(last.open, last.close) <= last.low + lastParts.range * 0.45;
    case "bullishPinBar":
      return hasTrend(candles, beforeIndex, "down", settings) && hasLongLowerWick(lastParts) &&
        last.close >= last.low + lastParts.range * 0.65;
    case "bearishPinBar":
      return hasTrend(candles, beforeIndex, "up", settings) && hasLongUpperWick(lastParts) &&
        last.close <= last.low + lastParts.range * 0.35;
    case "bullishEngulfing":
      return hasTrend(candles, beforeIndex, "down", settings) && parts[0].bearish && lastParts.bullish && lastParts.body >= settings.minBodyAtr * atr &&
        last.open <= bars[0].close + engulfingTolerance && last.close >= bars[0].open - engulfingTolerance;
    case "bearishEngulfing":
      return hasTrend(candles, beforeIndex, "up", settings) && parts[0].bullish && lastParts.bearish && lastParts.body >= settings.minBodyAtr * atr &&
        last.open >= bars[0].close - engulfingTolerance && last.close <= bars[0].open + engulfingTolerance;
    case "bullishHarami":
      return hasTrend(candles, beforeIndex, "down", settings) && parts[0].bearish && lastParts.bullish && parts[0].body >= settings.largeBodyAtr * atr &&
        lastParts.body <= parts[0].body * settings.smallBodyFraction &&
        between(last.open, bars[0].close, bars[0].open, tolerance) &&
        between(last.close, bars[0].close, bars[0].open, tolerance);
    case "bearishHarami":
      return hasTrend(candles, beforeIndex, "up", settings) && parts[0].bullish && lastParts.bearish && parts[0].body >= settings.largeBodyAtr * atr &&
        lastParts.body <= parts[0].body * settings.smallBodyFraction &&
        between(last.open, bars[0].open, bars[0].close, tolerance) &&
        between(last.close, bars[0].open, bars[0].close, tolerance);
    case "morningStar":
      return hasTrend(candles, beforeIndex, "down", settings) && parts[0].bearish && parts[0].body >= settings.largeBodyAtr * atr &&
        parts[1].body <= parts[0].body * settings.smallBodyFraction && parts[2].bullish &&
        parts[2].body >= settings.minBodyAtr * atr && last.close > midpoint(bars[0]);
    case "eveningStar":
      return hasTrend(candles, beforeIndex, "up", settings) && parts[0].bullish && parts[0].body >= settings.largeBodyAtr * atr &&
        parts[1].body <= parts[0].body * settings.smallBodyFraction && parts[2].bearish &&
        parts[2].body >= settings.minBodyAtr * atr && last.close < midpoint(bars[0]);
    case "threeWhiteSoldiers":
      return parts.every((p, i) => p.bullish && p.body >= settings.minSoldierBodyAtr * atr &&
        p.upperWick <= p.body * settings.maxWickToBody &&
        (i === 0 || (bars[i].close > bars[i - 1].close && between(bars[i].open, bars[i - 1].open, bars[i - 1].close, tolerance))));
    case "threeBlackCrows":
      return parts.every((p, i) => p.bearish && p.body >= settings.minSoldierBodyAtr * atr &&
        p.lowerWick <= p.body * settings.maxWickToBody &&
        (i === 0 || (bars[i].close < bars[i - 1].close && between(bars[i].open, bars[i - 1].close, bars[i - 1].open, tolerance))));
    case "insideBar":
      return last.high < bars[0].high && last.low > bars[0].low;
    case "tweezerBottom":
      return hasTrend(candles, beforeIndex, "down", settings) && parts[0].bearish && lastParts.bullish && Math.abs(bars[0].low - last.low) <= tolerance;
    case "tweezerTop":
      return hasTrend(candles, beforeIndex, "up", settings) && parts[0].bullish && lastParts.bearish && Math.abs(bars[0].high - last.high) <= tolerance;
    case "bullishPiercing":
      return hasTrend(candles, beforeIndex, "down", settings) && parts[0].bearish && lastParts.bullish && parts[0].body >= settings.largeBodyAtr * atr &&
        last.open <= bars[0].close + tolerance && last.close > midpoint(bars[0]) && last.close < bars[0].open;
    case "bearishDarkCloud":
      return hasTrend(candles, beforeIndex, "up", settings) && parts[0].bullish && lastParts.bearish && parts[0].body >= settings.largeBodyAtr * atr &&
        last.open >= bars[0].close - tolerance && last.close < midpoint(bars[0]) && last.close > bars[0].open;
    case "bullishMarubozu":
      return lastParts.bullish && lastParts.body >= settings.minBodyAtr * atr &&
        lastParts.upperWick <= lastParts.range * settings.maxMarubozuWickRatio &&
        lastParts.lowerWick <= lastParts.range * settings.maxMarubozuWickRatio;
    case "bearishMarubozu":
      return lastParts.bearish && lastParts.body >= settings.minBodyAtr * atr &&
        lastParts.upperWick <= lastParts.range * settings.maxMarubozuWickRatio &&
        lastParts.lowerWick <= lastParts.range * settings.maxMarubozuWickRatio;
    default:
      return false;
  }
}

function buildCandlestickDetectorCode(kind, preset = "standard") {
  const presetSettings = PRESETS[preset] || PRESETS.standard;
  const settings = { ...BASE_SETTINGS, ...presetSettings };
  return [
    `const PATTERN_KIND = ${JSON.stringify(kind)};`,
    `const PATTERN_SETTINGS = Object.freeze(${JSON.stringify(settings, null, 2)});`,
    validCandles.toString(),
    trueRangeAt.toString(),
    averageTrueRange.toString(),
    candleParts.toString(),
    hasTrend.toString(),
    detectCandlestickPattern.toString(),
    "function detectPattern(candles) {",
    "  return detectCandlestickPattern(candles, PATTERN_KIND, PATTERN_SETTINGS);",
    "}",
    "// Pattern-specific OHLC rules; test on the target market and timeframe."
  ].join("\n\n");
}

function buildCandlestickOptions(kind) {
  const title = PATTERN_LABELS[kind] || kind;
  const needsEngulfingTolerance = ["bullishEngulfing", "bearishEngulfing"].includes(kind);
  const needsTrendContext = [
    "hammer", "hangingMan", "invertedHammer", "shootingStar", "bullishPinBar", "bearishPinBar",
    "bullishEngulfing", "bearishEngulfing", "bullishHarami", "bearishHarami", "morningStar", "eveningStar",
    "tweezerBottom", "tweezerTop", "bullishPiercing", "bearishDarkCloud"
  ].includes(kind);
  return [
    { id: "drawing", preset: "standard", label: "มาตรฐาน" },
    { id: "description", preset: "strict", label: "เข้มงวด" },
    { id: "flexible", preset: "flexible", label: "ยืดหยุ่น" }
  ].map(option => {
    const settings = { ...BASE_SETTINGS, ...(PRESETS[option.preset] || {}) };
    return {
      id: option.id,
      title: `${title} · ${option.label}`,
      summary: `ตรวจจับ ${title} ด้วยกฎ HLOC, body/ไส้, ทิศทางแท่ง และสัดส่วน ATR${needsTrendContext ? " พร้อมตรวจแนวโน้มก่อนเกิดแพตเทิร์น" : ""}`,
      ruleInfo: `ATR ${settings.atrPeriod} · body ≥${settings.minBodyAtr}×ATR · wick ≥${settings.longWickRatio}:1 · doji ≤${Math.round(settings.dojiMaxBodyRatio * 100)}% · tolerance ${(needsEngulfingTolerance ? settings.engulfingToleranceAtr : settings.priceToleranceAtr)}×ATR${needsTrendContext ? ` · แนวโน้ม ${settings.trendPeriod} แท่ง ≥${settings.minTrendAtr}×ATR` : ""}`,
      code: buildCandlestickDetectorCode(kind, option.preset)
    };
  });
}

module.exports = { buildCandlestickOptions, classifyCandlestickPattern };
