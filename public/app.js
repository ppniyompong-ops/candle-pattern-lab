(() => {
  "use strict";

  const STORAGE_KEY = "candle-pattern-lab:saved-patterns:v1";
  const MAX_BARS = 12;
  const sampleBars = [
    { open: 101.2, high: 103.1, low: 99.4, close: 100.1 },
    { open: 100.0, high: 101.3, low: 96.4, close: 97.1 },
    { open: 97.2, high: 99.6, low: 95.8, close: 98.8 },
    { open: 98.5, high: 100.2, low: 96.9, close: 97.8 },
    { open: 97.6, high: 103.2, low: 96.9, close: 102.3 }
  ];

  const canvas = document.getElementById("candle-canvas");
  const ctx = canvas.getContext("2d");
  const state = {
    bars: sampleBars.map(bar => ({ ...bar })),
    lines: [],
    pathDraft: null,
    selected: 0,
    selectedLine: null,
    tool: "bull",
    drawing: null,
    undo: [],
    redo: [],
    options: [],
    selectedOptionId: "",
    logic: "",
    viewScale: 1,
    viewStart: 0.5 - MAX_BARS / 2,
    nextLineId: 1
  };
  const elements = {
    barCount: document.getElementById("bar-count"),
    lineCount: document.getElementById("line-count"),
    aiBarCount: document.getElementById("ai-bar-count"),
    aiLineCount: document.getElementById("ai-line-count"),
    selectedLabel: document.getElementById("selected-label"),
    selectedReadout: document.getElementById("selected-readout"),
    latestBar: document.getElementById("latest-bar-label"),
    emptyHint: document.getElementById("empty-hint"),
    undoButton: document.getElementById("undo-button"),
    redoButton: document.getElementById("redo-button"),
    name: document.getElementById("pattern-name"),
    bias: document.getElementById("pattern-bias"),
    timeframe: document.getElementById("pattern-timeframe"),
    description: document.getElementById("pattern-description"),
    savedPatterns: document.getElementById("saved-patterns"),
    savedCount: document.getElementById("saved-count"),
    logicPlaceholder: document.querySelector(".logic-placeholder"),
    logicOptions: document.getElementById("logic-options"),
    selectedOptionSummary: document.getElementById("selected-option-summary"),
    logicOutput: document.getElementById("logic-output"),
    generateButton: document.getElementById("generate-logic"),
    generateLabel: document.getElementById("generate-label"),
    copyButton: document.getElementById("copy-logic"),
    downloadButton: document.getElementById("download-logic"),
    toast: document.getElementById("toast"),
    toolHint: document.getElementById("tool-hint"),
    finishPathButton: document.getElementById("finish-path")
  };

  let chartSize = { width: 0, height: 0 };
  let priceRange = { min: 90, max: 110 };
  let toastTimer = null;

  function cloneBars(bars) {
    return bars.map(bar => ({ ...bar }));
  }

  function cloneLines(lines) {
    return lines.map(line => ({
      ...line,
      ...(Array.isArray(line.points) ? { points: line.points.map(point => ({ ...point })) } : {})
    }));
  }

  function annotationPoints(line) {
    if (line.kind === "path") return line.points || [];
    if (line.kind === "rectangle") return [
      { x: line.x1, price: line.price1 },
      { x: line.x2, price: line.price2 }
    ];
    return [
      { x: line.x1, price: line.price1 },
      { x: line.x2, price: line.price2 }
    ];
  }

  function annotationPriceValues(line) {
    if (line.kind === "level") return [line.price];
    return annotationPoints(line).map(point => point.price);
  }

  function normalizeLoadedLines(lines) {
    const seenLevels = new Set();
    const normalized = lines.slice(-40).reverse().filter(line => {
      if (line.kind !== "level") return true;
      if (seenLevels.has(line.levelType)) return false;
      seenLevels.add(line.levelType);
      return true;
    }).reverse();
    const seenIds = new Set();
    normalized.forEach(line => {
      if (!Number.isFinite(Number(line.id)) || seenIds.has(Number(line.id))) line.id = state.nextLineId++;
      else line.id = Number(line.id);
      seenIds.add(line.id);
    });
    return normalized;
  }

  function createSnapshot() {
    return { bars: cloneBars(state.bars), lines: cloneLines(state.lines) };
  }

  function restoreSnapshot(snapshot) {
    state.bars = cloneBars(snapshot.bars);
    state.lines = cloneLines(snapshot.lines || []);
    state.selected = state.bars.length ? Math.min(Math.max(state.selected, 0), state.bars.length - 1) : -1;
    state.selectedLine = null;
    state.pathDraft = null;
    elements.finishPathButton.classList.add("hidden");
  }

  function remember() {
    state.undo.push(createSnapshot());
    if (state.undo.length > 50) state.undo.shift();
    state.redo = [];
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    elements.undoButton.disabled = state.undo.length === 0;
    elements.redoButton.disabled = state.redo.length === 0;
  }

  function chartPlot() {
    return {
      left: 12,
      right: Math.max(20, chartSize.width - 10),
      top: 13,
      bottom: Math.max(35, chartSize.height - 17)
    };
  }

  function currentRange(preview) {
    const all = state.bars.slice();
    if (preview) all.push(preview);
    if (!all.length) return { min: 90, max: 110 };
    let min = Math.min(...all.map(bar => Number(bar.low)));
    let max = Math.max(...all.map(bar => Number(bar.high)));
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 90, max: 110 };
    if (min === max) {
      const pad = Math.max(Math.abs(min) * 0.04, 1);
      min -= pad;
      max += pad;
    } else {
      const pad = (max - min) * 0.13;
      min -= pad;
      max += pad;
    }
    return { min, max };
  }

  function yForPrice(price, range, plot) {
    return plot.top + ((range.max - price) / (range.max - range.min)) * (plot.bottom - plot.top);
  }

  function priceForY(y) {
    const plot = chartPlot();
    const fraction = Math.max(0, Math.min(1, (y - plot.top) / (plot.bottom - plot.top)));
    return priceRange.max - fraction * (priceRange.max - priceRange.min);
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    chartSize = { width: rect.width, height: rect.height };
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    renderChart();
  }

  function drawGrid(plot) {
    const styles = getComputedStyle(document.documentElement);
    const gridColor = styles.getPropertyValue("--line-soft").trim() || "rgba(158,180,194,.12)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = plot.top + ((plot.bottom - plot.top) * i) / 4;
      ctx.beginPath();
      ctx.setLineDash(i === 0 || i === 4 ? [] : [2, 5]);
      ctx.strokeStyle = gridColor;
      ctx.moveTo(plot.left, Math.round(y) + 0.5);
      ctx.lineTo(plot.right, Math.round(y) + 0.5);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const slot = (plot.right - plot.left) / MAX_BARS * state.viewScale;
    const first = Math.floor(state.viewStart);
    const last = Math.ceil(state.viewStart + (plot.right - plot.left) / slot);
    for (let i = first; i <= last; i += 1) {
      const x = plot.left + (i - state.viewStart) * slot;
      if (x < plot.left || x > plot.right) continue;
      ctx.beginPath();
      ctx.strokeStyle = "rgba(158,180,194,.045)";
      ctx.moveTo(Math.round(x) + 0.5, plot.top);
      ctx.lineTo(Math.round(x) + 0.5, plot.bottom);
      ctx.stroke();
    }
  }

  function drawCandle(bar, index, plot, range, preview) {
    const slot = (plot.right - plot.left) / MAX_BARS * state.viewScale;
    const centerX = plot.left + (index + 0.5 - state.viewStart) * slot;
    if (centerX < plot.left - slot || centerX > plot.right + slot) return;
    const bodyWidth = Math.min(26, Math.max(7, slot * 0.38));
    const openY = yForPrice(bar.open, range, plot);
    const closeY = yForPrice(bar.close, range, plot);
    const highY = yForPrice(bar.high, range, plot);
    const lowY = yForPrice(bar.low, range, plot);
    const up = bar.close >= bar.open;
    const color = up ? "#72d9ad" : "#f17d87";
    const wickColor = preview ? "rgba(202,225,216,.82)" : color;

    ctx.save();
    ctx.lineWidth = preview ? 1 : 1.2;
    ctx.strokeStyle = wickColor;
    ctx.beginPath();
    ctx.moveTo(centerX, highY);
    ctx.lineTo(centerX, lowY);
    ctx.stroke();
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(3, Math.abs(closeY - openY));
    ctx.fillStyle = preview ? "rgba(180,216,201,.42)" : color;
    ctx.fillRect(centerX - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
    if (preview) {
      ctx.strokeStyle = "rgba(220,241,229,.75)";
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(centerX - bodyWidth / 2 - 1, bodyTop - 1, bodyWidth + 2, bodyHeight + 2);
    } else if (index === state.selected) {
      ctx.strokeStyle = "rgba(221,248,235,.85)";
      ctx.lineWidth = 1;
      ctx.strokeRect(centerX - bodyWidth / 2 - 3, bodyTop - 3, bodyWidth + 6, bodyHeight + 6);
      if (state.tool === "select") {
        const handles = [
          ["high", centerX, highY], ["open", centerX, openY],
          ["close", centerX, closeY], ["low", centerX, lowY]
        ];
        handles.forEach(([key, x, y]) => {
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#e8c98a";
          ctx.fill();
          ctx.strokeStyle = "#102019";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });
      }
    }
    ctx.restore();
  }

  function lineColor(line) {
    if (line.kind === "level") {
      return { entry: "#78b9f5", tp: "#72d9ad", sl: "#f17d87" }[line.levelType] || "#78b9f5";
    }
    if (line.kind === "path" || line.kind === "rectangle") return "#d4b7f0";
    return "#e8c98a";
  }

  function lineX(position, plot) {
    const slot = (plot.right - plot.left) / MAX_BARS * state.viewScale;
    return plot.left + (position - state.viewStart) * slot;
  }

  function drawAnnotation(line, plot, range, preview = false) {
    const selected = line.id === state.selectedLine && !preview;
    const color = lineColor(line);
    ctx.save();
    ctx.strokeStyle = preview ? color + "aa" : color;
    ctx.fillStyle = color;
    ctx.lineWidth = selected ? 2.3 : 1.5;
    ctx.setLineDash(line.kind === "level" ? [7, 5] : line.kind === "path" ? [2, 4] : []);
    ctx.beginPath();
    if (line.kind === "level") {
      const y = yForPrice(line.price, range, plot);
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      const label = line.levelType.toUpperCase();
      ctx.font = "600 9px Manrope, sans-serif";
      const labelWidth = ctx.measureText(label).width + 12;
      const labelX = Math.max(plot.left + 2, plot.right - labelWidth - 3);
      const labelY = Math.max(plot.top + 2, Math.min(plot.bottom - 17, y - 8));
      ctx.globalAlpha = preview ? 0.7 : 0.92;
      ctx.fillRect(labelX, labelY, labelWidth, 16);
      ctx.fillStyle = "#0b1118";
      ctx.fillText(label, labelX + 6, labelY + 11);
      if (selected) {
        ctx.beginPath();
        ctx.arc(plot.right - labelWidth - 8, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    } else if (line.kind === "rectangle") {
      const x1 = lineX(line.x1, plot);
      const y1 = yForPrice(line.price1, range, plot);
      const x2 = lineX(line.x2, plot);
      const y2 = yForPrice(line.price2, range, plot);
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);
      ctx.fillStyle = preview ? "rgba(212,183,240,.06)" : "rgba(212,183,240,.035)";
      ctx.fillRect(left, top, width, height);
      ctx.strokeRect(left, top, width, height);
      if (selected) {
        [[x1, y1], [x2, y2]].forEach(([x, y]) => {
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        });
      }
    } else {
      const points = annotationPoints(line);
      if (points.length) {
        ctx.moveTo(lineX(points[0].x, plot), yForPrice(points[0].price, range, plot));
        points.slice(1).forEach(point => ctx.lineTo(lineX(point.x, plot), yForPrice(point.price, range, plot)));
        ctx.stroke();
      }
      if (selected || preview) {
        points.forEach(point => {
          const x = lineX(point.x, plot);
          const y = yForPrice(point.price, range, plot);
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        });
      }
    }
    ctx.restore();
  }

  function getPreviewBar() {
    // Preview bars are only for a new candle gesture. Selection, handle edits,
    // and chart panning use the same transient state object but have no prices.
    if (!state.drawing || state.drawing.panning || state.drawing.adjusting || state.drawing.movingLine || state.drawing.adjustingAnnotationPoint ||
        !["bull", "bear"].includes(state.drawing.tool)) return null;
    const start = state.drawing.startPrice;
    let end = state.drawing.endPrice;
    const drawingRange = state.drawing.range;
    if (!Number.isFinite(start) || !Number.isFinite(end) ||
        !Number.isFinite(drawingRange?.min) || !Number.isFinite(drawingRange?.max)) return null;
    const spread = Math.max(drawingRange.max - drawingRange.min, Math.abs(start) * 0.02);
    if (Math.abs(end - start) < spread * 0.012) end = start + (state.drawing.tool === "bear" ? -1 : 1) * spread * 0.012;
    const isBull = state.drawing.tool === "bull";
    const open = isBull ? Math.min(start, end) : Math.max(start, end);
    const close = isBull ? Math.max(start, end) : Math.min(start, end);
    const wick = Math.max(spread * 0.018, Math.max(Math.abs(open), Math.abs(close)) * 0.001);
    return {
      index: state.drawing.index,
      bar: { open, high: Math.max(open, close) + wick, low: Math.min(open, close) - wick, close }
    };
  }

  function renderChart() {
    if (!chartSize.width || !chartSize.height) return;
    const plot = chartPlot();
    clampViewStart(plot);
    const preview = getPreviewBar();
    const range = currentRange(preview?.bar);
    priceRange = range;
    ctx.clearRect(0, 0, chartSize.width, chartSize.height);
    drawGrid(plot);
    state.bars.forEach((bar, index) => drawCandle(bar, index, plot, range, false));
    if (preview) drawCandle(preview.bar, preview.index, plot, range, true);
    state.lines.forEach(line => drawAnnotation(line, plot, range));
    if (state.drawing?.kind === "line") drawAnnotation(state.drawing, plot, range, true);
    if (state.drawing?.kind === "level") drawAnnotation({ kind: "level", levelType: state.drawing.levelType, price: state.drawing.price }, plot, range, true);
    if (state.drawing?.kind === "rectangle") drawAnnotation(state.drawing, plot, range, true);
    if (state.pathDraft) {
      const points = state.pathDraft.preview
        ? [...state.pathDraft.points, state.pathDraft.preview]
        : state.pathDraft.points;
      drawAnnotation({ kind: "path", points }, plot, range, true);
    }
    elements.emptyHint.classList.toggle("hidden", state.bars.length > 0 || state.lines.length > 0 ||
      ["line", "level", "rectangle"].includes(state.drawing?.kind) || Boolean(state.pathDraft));
  }

  function updateInspector() {
    const bar = state.bars[state.selected];
    if (!bar) {
      elements.selectedLabel.textContent = "NO BAR";
      elements.selectedReadout.textContent = "วาดหรือเลือกแท่งเทียนเพื่อปรับรูปทรง";
      return;
    }
    const label = String(state.selected + 1).padStart(2, "0");
    elements.selectedLabel.textContent = "BAR " + label;
    elements.selectedReadout.textContent = "เลือกแท่งแล้ว · ลากจุดจับเพื่อปรับสัดส่วน";
  }

  function updateCounts() {
    elements.barCount.textContent = state.bars.length + (state.bars.length === 1 ? " BAR" : " BARS");
    elements.lineCount.textContent = state.lines.length + (state.lines.length === 1 ? " LINE" : " LINES");
    elements.aiBarCount.textContent = state.bars.length + (state.bars.length === 1 ? " candle" : " candles");
    elements.aiLineCount.textContent = state.lines.length + (state.lines.length === 1 ? " line" : " lines");
    elements.latestBar.textContent = String(state.bars.length).padStart(2, "0");
  }

  function normalizePatternBars(bars) {
    if (!bars.length) return [];
    const min = Math.min(...bars.map(bar => bar.low));
    const max = Math.max(...bars.map(bar => bar.high));
    const span = max - min || 1;
    return bars.map(bar => Object.fromEntries(
      ["open", "high", "low", "close"].map(key => [key, Number(((bar[key] - min) / span).toFixed(6))])
    ));
  }

  function normalizePatternLines(lines, bars) {
    const linePrices = lines.flatMap(annotationPriceValues);
    const low = bars.length ? Math.min(...bars.map(bar => bar.low)) : linePrices.length ? Math.min(...linePrices) : priceRange.min;
    const high = bars.length ? Math.max(...bars.map(bar => bar.high)) : linePrices.length ? Math.max(...linePrices) : priceRange.max;
    const span = high - low || 1;
    const normalizeY = price => Number(((price - low) / span).toFixed(6));
    return lines.map(line => {
      if (line.kind === "level") return { type: line.levelType, y: normalizeY(line.price) };
      if (line.kind === "rectangle") return {
        type: "rectangle",
        x1: Number((line.x1 / MAX_BARS).toFixed(6)),
        y1: normalizeY(line.price1),
        x2: Number((line.x2 / MAX_BARS).toFixed(6)),
        y2: normalizeY(line.price2)
      };
      if (line.kind === "path") return {
        type: "path",
        points: line.points.map(point => ({
          x: Number((point.x / MAX_BARS).toFixed(6)),
          y: normalizeY(point.price)
        }))
      };
      return {
        type: "line",
        x1: Number((line.x1 / MAX_BARS).toFixed(6)),
        y1: normalizeY(line.price1),
        x2: Number((line.x2 / MAX_BARS).toFixed(6)),
        y2: normalizeY(line.price2)
      };
    });
  }

  function render() {
    updateCounts();
    updateInspector();
    updateHistoryButtons();
    renderChart();
  }

  function setTool(tool) {
    if (state.pathDraft && tool !== "path") finishPath();
    state.tool = tool;
    document.querySelectorAll("[data-tool]").forEach(button => {
      const active = button.dataset.tool === tool;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const hints = {
      bull: "เริ่มลากจาก Open ไปยัง Close",
      bear: "เริ่มลากจาก Open ไปยัง Close",
      select: "ลากกราฟเพื่อเลื่อน · ลากจุดจับเพื่อปรับแท่งหรือปลายเส้น",
      erase: "คลิกแท่งหรือเส้นที่ต้องการลบ",
      line: "ลากเพื่อวาดเส้นอิสระ",
      path: "คลิกเพิ่มจุดหัก · คลิกจุดล่าสุดหรือดับเบิลคลิกเพื่อจบ",
      rect: "ลากเพื่อวาดกล่องสี่เหลี่ยม",
      entry: "คลิกหรือลากเพื่อวางระดับ Entry",
      tp: "คลิกหรือลากเพื่อวางระดับ Take Profit",
      sl: "คลิกหรือลากเพื่อวางระดับ Stop Loss"
    };
    elements.toolHint.textContent = hints[tool];
    canvas.style.cursor = tool === "erase" ? "not-allowed" : tool === "select" ? "grab" : "crosshair";
  }

  function finishPath() {
    if (!state.pathDraft) return;
    const draft = state.pathDraft;
    state.pathDraft = null;
    elements.finishPathButton.classList.add("hidden");
    if (draft.points.length < 2) {
      renderChart();
      showToast("เพิ่มจุดอย่างน้อย 2 จุดก่อนจบเส้น");
      return;
    }
    if (state.lines.length >= 40) {
      renderChart();
      showToast("วาดเส้นได้สูงสุด 40 เส้น");
      return;
    }
    remember();
    const id = state.nextLineId++;
    state.lines.push({ id, kind: "path", points: draft.points.map(point => ({ ...point })) });
    state.selectedLine = id;
    render();
  }

  function pointForEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const plot = chartPlot();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      plot,
      rect
    };
  }

  function indexForX(x, plot) {
    const slot = (plot.right - plot.left) / MAX_BARS * state.viewScale;
    return Math.max(0, Math.min(MAX_BARS - 1, Math.floor(state.viewStart + (x - plot.left) / slot)));
  }

  function candleAt(point) {
    const slot = (point.plot.right - point.plot.left) / MAX_BARS * state.viewScale;
    let nearest = null;
    let nearestDistance = Infinity;
    state.bars.forEach((bar, index) => {
      const centerX = point.plot.left + (index + 0.5 - state.viewStart) * slot;
      const bodyWidth = Math.min(26, Math.max(7, slot * 0.38));
      const highY = yForPrice(bar.high, priceRange, point.plot);
      const lowY = yForPrice(bar.low, priceRange, point.plot);
      const dx = Math.abs(point.x - centerX);
      if (dx > Math.max(12, bodyWidth / 2 + 5) || point.y < highY - 7 || point.y > lowY + 7) return;
      const distance = Math.hypot(dx, Math.max(0, highY - point.y, point.y - lowY));
      if (distance < nearestDistance) {
        nearest = { index };
        nearestDistance = distance;
      }
    });
    return nearest;
  }

  function linePositionForX(x, plot) {
    const slot = (plot.right - plot.left) / MAX_BARS * state.viewScale;
    return Math.max(0, Math.min(MAX_BARS, state.viewStart + (x - plot.left) / slot));
  }

  function distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared)) : 0;
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function annotationAt(point) {
    for (let index = state.lines.length - 1; index >= 0; index -= 1) {
      const line = state.lines[index];
      if (line.kind === "level") {
        if (Math.abs(point.y - yForPrice(line.price, priceRange, point.plot)) < 8) return line;
      } else if (line.kind === "rectangle") {
        const x1 = lineX(line.x1, point.plot);
        const y1 = yForPrice(line.price1, priceRange, point.plot);
        const x2 = lineX(line.x2, point.plot);
        const y2 = yForPrice(line.price2, priceRange, point.plot);
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(y1, y2);
        const bottom = Math.max(y1, y2);
        if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) return line;
        const edgeDistance = Math.min(
          distanceToSegment(point.x, point.y, left, top, right, top),
          distanceToSegment(point.x, point.y, right, top, right, bottom),
          distanceToSegment(point.x, point.y, right, bottom, left, bottom),
          distanceToSegment(point.x, point.y, left, bottom, left, top)
        );
        if (edgeDistance < 8) return line;
      } else {
        const points = annotationPoints(line);
        for (let i = 1; i < points.length; i += 1) {
          const a = points[i - 1];
          const b = points[i];
          if (distanceToSegment(point.x, point.y, lineX(a.x, point.plot), yForPrice(a.price, priceRange, point.plot), lineX(b.x, point.plot), yForPrice(b.price, priceRange, point.plot)) < 8) return line;
        }
      }
    }
    return null;
  }

  function annotationPointAt(line, point, plot) {
    if (line.kind === "level") return -1;
    const points = annotationPoints(line);
    let nearestIndex = -1;
    let nearestDistance = 10;
    points.forEach((item, index) => {
      const distance = Math.hypot(point.x - lineX(item.x, plot), point.y - yForPrice(item.price, priceRange, plot));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    return nearestIndex;
  }

  function updateAnnotationPoint(line, index, x, price) {
    if (line.kind === "path") {
      line.points[index] = { x, price };
    } else if (line.kind === "rectangle") {
      const prefix = index === 0 ? "1" : "2";
      line["x" + prefix] = x;
      line["price" + prefix] = price;
    } else {
      const prefix = index === 0 ? "1" : "2";
      line["x" + prefix] = x;
      line["price" + prefix] = price;
    }
  }

  function visibleSlots(plot) {
    return MAX_BARS / state.viewScale;
  }

  function clampViewStart(plot) {
    const firstCandleCenteredStart = 0.5 - visibleSlots(plot) / 2;
    const minViewStart = Math.min(0, firstCandleCenteredStart);
    const lastVisibleStart = Math.max(0, state.bars.length + 1 - visibleSlots(plot));
    state.viewStart = Math.max(minViewStart, Math.min(lastVisibleStart, state.viewStart));
  }

  function setZoom(nextScale, anchorX) {
    const plot = chartPlot();
    const oldSlot = (plot.right - plot.left) / MAX_BARS * state.viewScale;
    const anchorIndex = state.viewStart + (anchorX - plot.left) / oldSlot;
    state.viewScale = Math.max(0.7, Math.min(4, nextScale));
    const newSlot = (plot.right - plot.left) / MAX_BARS * state.viewScale;
    state.viewStart = anchorIndex - (anchorX - plot.left) / newSlot;
    clampViewStart(plot);
    renderChart();
    updateZoomControls();
  }

  function updateZoomControls() {
    const readout = document.getElementById("zoom-readout");
    if (readout) readout.textContent = Math.round(state.viewScale * 100) + "%";
    const zoomIn = document.getElementById("zoom-in");
    const zoomOut = document.getElementById("zoom-out");
    if (zoomIn) zoomIn.disabled = state.viewScale >= 4;
    if (zoomOut) zoomOut.disabled = state.viewScale <= 0.7;
  }

  function fitChart() {
    state.viewScale = state.bars.length
      ? Math.min(4, MAX_BARS / Math.max(3, state.bars.length + 2))
      : 1;
    const visible = visibleSlots(chartPlot());
    state.viewStart = state.bars.length ? (state.bars.length - visible) / 2 : 0.5 - visible / 2;
    renderChart();
    updateZoomControls();
  }

  function setSelected(index) {
    if (!state.bars.length) return;
    state.selectedLine = null;
    state.selected = Math.max(0, Math.min(state.bars.length - 1, index));
    render();
  }

  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const point = pointForEvent(event);
    if (point.x < point.plot.left || point.x > point.plot.right || point.y < point.plot.top || point.y > point.plot.bottom) return;
    const requestedIndex = indexForX(point.x, point.plot);
    if (state.tool === "select") {
      const line = annotationAt(point);
      if (line) {
        state.selectedLine = line.id;
        const pointIndex = annotationPointAt(line, point, point.plot);
        state.drawing = pointIndex >= 0 ? {
          adjustingAnnotationPoint: { id: line.id, index: pointIndex },
          moved: false,
          startX: point.x,
          startY: point.y
        } : {
          movingLine: line.id,
          moved: false,
          startX: point.x,
          startY: point.y,
          startRange: { ...priceRange },
          originalLine: cloneLines([line])[0]
        };
        canvas.setPointerCapture(event.pointerId);
        renderChart();
        return;
      }
      state.selectedLine = null;
      if (state.bars.length) {
        const slot = (point.plot.right - point.plot.left) / MAX_BARS * state.viewScale;
        const selectedBar = state.bars[state.selected];
        let handle = null;
        if (selectedBar) {
          const centerX = point.plot.left + (state.selected + 0.5 - state.viewStart) * slot;
          const handles = [
            ["high", yForPrice(selectedBar.high, priceRange, point.plot)],
            ["open", yForPrice(selectedBar.open, priceRange, point.plot)],
            ["close", yForPrice(selectedBar.close, priceRange, point.plot)],
            ["low", yForPrice(selectedBar.low, priceRange, point.plot)]
          ];
          handle = handles.find(([, y]) => Math.hypot(point.x - centerX, point.y - y) < 13);
          if (handle) {
            remember();
            const index = state.selected;
            state.drawing = { adjusting: handle[0], index, range: { ...priceRange } };
            canvas.setPointerCapture(event.pointerId);
            renderChart();
            return;
          }
        }
        const hit = candleAt(point);
        if (hit) state.selected = hit.index;
        state.drawing = {
          panning: true,
          moved: false,
          startX: point.x,
          initialViewStart: state.viewStart,
          index: hit ? hit.index : state.selected
        };
        canvas.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (state.tool === "path") {
      const position = linePositionForX(point.x, point.plot);
      const price = priceForY(point.y);
      if (!state.pathDraft) {
        if (state.lines.length >= 40) {
          showToast("วาดเส้นได้สูงสุด 40 เส้น");
          return;
        }
        state.pathDraft = { points: [{ x: position, price }], preview: { x: position, price } };
        elements.finishPathButton.classList.remove("hidden");
        renderChart();
        return;
      }
      const draft = state.pathDraft;
      const last = draft.points[draft.points.length - 1];
      const lastDistance = Math.hypot(point.x - lineX(last.x, point.plot), point.y - yForPrice(last.price, priceRange, point.plot));
      if (event.detail >= 2 || (draft.points.length >= 2 && lastDistance < 10)) {
        if (event.detail >= 2 && lastDistance >= 10 && draft.points.length < 40) draft.points.push({ x: position, price });
        finishPath();
        return;
      }
      if (draft.points.length >= 40) {
        showToast("เส้นหักมีจุดได้สูงสุด 40 จุด");
        return;
      }
      draft.points.push({ x: position, price });
      draft.preview = { x: position, price };
      renderChart();
      return;
    }
    if (state.tool === "erase") {
      const line = annotationAt(point);
      if (line) {
        remember();
        state.lines = state.lines.filter(item => item.id !== line.id);
        if (state.selectedLine === line.id) state.selectedLine = null;
        render();
        return;
      }
      if (requestedIndex < state.bars.length) {
        remember();
        state.bars.splice(requestedIndex, 1);
        state.selected = state.bars.length ? Math.min(requestedIndex, state.bars.length - 1) : -1;
        render();
      }
      return;
    }
    if (["line", "rect", "entry", "tp", "sl"].includes(state.tool)) {
      const existingLevel = ["entry", "tp", "sl"].includes(state.tool)
        ? state.lines.find(line => line.kind === "level" && line.levelType === state.tool)
        : null;
      if (state.lines.length >= 40 && !existingLevel) {
        showToast("วาดเส้นได้สูงสุด 40 เส้น");
        return;
      }
      state.selectedLine = null;
      if (state.tool === "line" || state.tool === "rect") {
        const position = linePositionForX(point.x, point.plot);
        const price = priceForY(point.y);
        state.drawing = {
          kind: state.tool === "rect" ? "rectangle" : "line",
          x1: position, x2: position, price1: price, price2: price,
          range: { ...priceRange }
        };
      } else {
        state.drawing = {
          kind: "level", levelType: state.tool,
          replaceId: existingLevel?.id,
          price: priceForY(point.y), range: { ...priceRange }
        };
      }
      canvas.setPointerCapture(event.pointerId);
      renderChart();
      return;
    }
    if (state.bars.length >= MAX_BARS && requestedIndex >= state.bars.length) {
      showToast("วาดได้สูงสุด " + MAX_BARS + " แท่ง");
      return;
    }
    const index = Math.min(requestedIndex, state.bars.length);
    state.selectedLine = null;
    state.drawing = {
      index,
      tool: state.tool,
      range: { ...priceRange },
      startPrice: priceForY(point.y),
      endPrice: priceForY(point.y)
    };
    canvas.setPointerCapture(event.pointerId);
    renderChart();
  });

  canvas.addEventListener("pointermove", event => {
    const point = pointForEvent(event);
    if (state.pathDraft && !state.drawing) {
      state.pathDraft.preview = {
        x: linePositionForX(point.x, point.plot),
        price: priceForY(Math.max(point.plot.top, Math.min(point.plot.bottom, point.y)))
      };
      renderChart();
      return;
    }
    if (!state.drawing) return;
    if (state.drawing.panning) {
      const delta = point.x - state.drawing.startX;
      if (Math.abs(delta) > 3) state.drawing.moved = true;
      if (state.drawing.moved) {
        const slot = (point.plot.right - point.plot.left) / MAX_BARS * state.viewScale;
        state.viewStart = state.drawing.initialViewStart - delta / slot;
        clampViewStart(point.plot);
        renderChart();
      }
      return;
    }
    if (state.drawing.adjustingAnnotationPoint) {
      const drawing = state.drawing;
      const line = state.lines.find(item => item.id === drawing.adjustingAnnotationPoint.id);
      if (!line) return;
      if (Math.hypot(point.x - drawing.startX, point.y - drawing.startY) > 2) {
        if (!drawing.moved) {
          remember();
          drawing.moved = true;
        }
        updateAnnotationPoint(line, drawing.adjustingAnnotationPoint.index,
          linePositionForX(point.x, point.plot), priceForY(point.y));
        renderChart();
      }
      return;
    }
    if (state.drawing.movingLine) {
      const drawing = state.drawing;
      const line = state.lines.find(item => item.id === drawing.movingLine);
      if (!line) return;
      const dx = point.x - drawing.startX;
      const dy = point.y - drawing.startY;
      const movedDistance = drawing.originalLine.kind === "level" ? Math.abs(dy) : Math.hypot(dx, dy);
      if (movedDistance > 2) {
        if (!drawing.moved) {
          remember();
          drawing.moved = true;
        }
        const requestedPriceDelta = -dy / (point.plot.bottom - point.plot.top) * (drawing.startRange.max - drawing.startRange.min);
        if (drawing.originalLine.kind === "level") {
          line.price = Math.max(drawing.startRange.min, Math.min(drawing.startRange.max, drawing.originalLine.price + requestedPriceDelta));
        } else {
          const slot = (point.plot.right - point.plot.left) / MAX_BARS * state.viewScale;
          const originals = annotationPoints(drawing.originalLine);
          const originalXs = originals.map(item => item.x);
          const originalPrices = originals.map(item => item.price);
          let indexDelta = dx / slot;
          const minX = Math.min(...originalXs);
          const maxX = Math.max(...originalXs);
          indexDelta = Math.max(-minX, Math.min(MAX_BARS - maxX, indexDelta));
          const minPrice = Math.min(...originalPrices);
          const maxPrice = Math.max(...originalPrices);
          const priceDelta = Math.max(drawing.startRange.min - minPrice, Math.min(drawing.startRange.max - maxPrice, requestedPriceDelta));
          originals.forEach((original, index) => updateAnnotationPoint(
            line, index, original.x + indexDelta, original.price + priceDelta
          ));
        }
        renderChart();
      }
      return;
    }
    const y = Math.max(point.plot.top, Math.min(point.plot.bottom, point.y));
    const fraction = Math.max(0, Math.min(1, (y - point.plot.top) / (point.plot.bottom - point.plot.top)));
    if (state.drawing.kind === "line" || state.drawing.kind === "rectangle") {
      state.drawing.x2 = linePositionForX(point.x, point.plot);
      state.drawing.price2 = state.drawing.range.max - fraction * (state.drawing.range.max - state.drawing.range.min);
      renderChart();
      return;
    }
    if (state.drawing.kind === "level") {
      state.drawing.price = state.drawing.range
        ? state.drawing.range.max - fraction * (state.drawing.range.max - state.drawing.range.min)
        : priceRange.max - fraction * (priceRange.max - priceRange.min);
      renderChart();
      return;
    }
    if (state.drawing.adjusting) {
      const bar = state.bars[state.drawing.index];
      const range = state.drawing.range;
      const price = range.max - fraction * (range.max - range.min);
      const key = state.drawing.adjusting;
      if (key === "high") bar.high = Math.max(price, bar.open, bar.close);
      if (key === "low") bar.low = Math.min(price, bar.open, bar.close);
      if (key === "open") { bar.open = price; bar.high = Math.max(bar.high, price); bar.low = Math.min(bar.low, price); }
      if (key === "close") { bar.close = price; bar.high = Math.max(bar.high, price); bar.low = Math.min(bar.low, price); }
      renderChart();
      return;
    }
    state.drawing.endPrice = state.drawing.range.max - fraction * (state.drawing.range.max - state.drawing.range.min);
    renderChart();
  });

  function finishDrawing() {
    if (!state.drawing) return;
    if (state.drawing.panning) {
      const moved = state.drawing.moved;
      state.drawing = null;
      if (moved) updateZoomControls();
      else setSelected(state.selected);
      render();
      return;
    }
    if (state.drawing.movingLine) {
      state.drawing = null;
      render();
      return;
    }
    if (state.drawing.adjustingAnnotationPoint) {
      state.drawing = null;
      render();
      return;
    }
    if (state.drawing.adjusting) {
      state.drawing = null;
      render();
      return;
    }
    if (["line", "rectangle", "level"].includes(state.drawing.kind)) {
      const draft = state.drawing;
      const plot = chartPlot();
      const slot = (plot.right - plot.left) / MAX_BARS * state.viewScale;
      const verticalPixelsPerPrice = (plot.bottom - plot.top) / (draft.range.max - draft.range.min);
      const lineLength = Math.hypot((draft.x2 - draft.x1) * slot, (draft.price2 - draft.price1) * verticalPixelsPerPrice);
      if (draft.kind === "line" && lineLength < 3) {
        state.drawing = null;
        render();
        showToast("ลากเส้นจากจุดเริ่มไปยังจุดปลาย");
        return;
      }
      if (draft.kind === "rectangle" &&
          (Math.abs(draft.x2 - draft.x1) * slot < 3 || Math.abs(draft.price2 - draft.price1) * verticalPixelsPerPrice < 3)) {
        state.drawing = null;
        render();
        showToast("ลากให้ได้ทั้งความกว้างและความสูงของกรอบ");
        return;
      }
      remember();
      const id = draft.kind === "level" && draft.replaceId ? draft.replaceId : state.nextLineId++;
      const annotation = draft.kind === "level"
        ? { id, kind: "level", levelType: draft.levelType, price: draft.price }
        : { id, kind: draft.kind, x1: draft.x1, x2: draft.x2, price1: draft.price1, price2: draft.price2 };
      if (draft.kind === "level" && draft.replaceId) {
        state.lines = state.lines.map(line => line.id === draft.replaceId ? annotation : line);
      } else {
        state.lines.push(annotation);
      }
      state.selectedLine = id;
      state.drawing = null;
      render();
      return;
    }
    const preview = getPreviewBar();
    if (!preview) return;
    remember();
    if (preview.index < state.bars.length) state.bars[preview.index] = preview.bar;
    else state.bars.push(preview.bar);
    state.selected = preview.index;
    state.drawing = null;
    render();
  }
  canvas.addEventListener("pointerup", finishDrawing);
  canvas.addEventListener("pointercancel", finishDrawing);
  canvas.addEventListener("dblclick", event => {
    if (state.tool === "path" && state.pathDraft) {
      event.preventDefault();
      finishPath();
    }
  });

  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    const point = pointForEvent(event);
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      const slot = (point.plot.right - point.plot.left) / MAX_BARS * state.viewScale;
      const distance = event.deltaX || event.deltaY;
      state.viewStart += distance / slot * 0.8;
      clampViewStart(point.plot);
      renderChart();
      return;
    }
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom(state.viewScale * factor, point.x);
  }, { passive: false });

  canvas.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft" && state.bars.length) {
      event.preventDefault();
      setSelected(state.selected - 1);
    } else if (event.key === "ArrowRight" && state.bars.length) {
      event.preventDefault();
      setSelected(state.selected + 1);
    } else if ((event.key === "Delete" || event.key === "Backspace") && state.selectedLine !== null) {
      event.preventDefault();
      remember();
      state.lines = state.lines.filter(line => line.id !== state.selectedLine);
      state.selectedLine = null;
      render();
    } else if (event.key === "Enter" && state.tool === "path" && state.pathDraft) {
      event.preventDefault();
      finishPath();
    } else if (event.key === "Escape" && state.pathDraft) {
      event.preventDefault();
      state.pathDraft = null;
      elements.finishPathButton.classList.add("hidden");
      renderChart();
    } else if ((event.key === "Delete" || event.key === "Backspace") && state.selected >= 0) {
      event.preventDefault();
      remember();
      state.bars.splice(state.selected, 1);
      state.selected = state.bars.length ? Math.min(state.selected, state.bars.length - 1) : -1;
      render();
    }
  });

  document.querySelectorAll("[data-tool]").forEach(button => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });
  elements.finishPathButton.addEventListener("click", finishPath);

  document.getElementById("zoom-in").addEventListener("click", () => {
    const plot = chartPlot();
    setZoom(state.viewScale * 1.25, (plot.left + plot.right) / 2);
  });
  document.getElementById("zoom-out").addEventListener("click", () => {
    const plot = chartPlot();
    setZoom(state.viewScale / 1.25, (plot.left + plot.right) / 2);
  });
  document.getElementById("zoom-fit").addEventListener("click", fitChart);

  elements.undoButton.addEventListener("click", () => {
    if (!state.undo.length) return;
    state.redo.push(createSnapshot());
    restoreSnapshot(state.undo.pop());
    render();
  });
  elements.redoButton.addEventListener("click", () => {
    if (!state.redo.length) return;
    state.undo.push(createSnapshot());
    restoreSnapshot(state.redo.pop());
    render();
  });
  document.getElementById("clear-button").addEventListener("click", () => {
    if (!state.bars.length && !state.lines.length) return;
    remember();
    state.bars = [];
    state.lines = [];
    state.selected = -1;
    state.selectedLine = null;
    render();
    showToast("ล้างภาพวาดแล้ว");
  });

  function getSavedPatterns() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter(item => item && Array.isArray(item.candles)) : [];
    } catch {
      return [];
    }
  }

  function writeSavedPatterns(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 30)));
  }

  function renderSavedPatterns() {
    const items = getSavedPatterns();
    elements.savedCount.textContent = items.length + " รายการ";
    elements.savedPatterns.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "saved-empty";
      empty.textContent = "ยังไม่มีแพตเทิร์นที่บันทึกไว้";
      elements.savedPatterns.append(empty);
      return;
    }
    items.forEach(item => {
      const card = document.createElement("article");
      card.className = "saved-card";
      const mini = document.createElement("span");
      mini.className = "saved-mini";
      mini.textContent = "▥";
      const info = document.createElement("div");
      info.className = "saved-info";
      const title = document.createElement("strong");
      title.textContent = item.name || "Untitled pattern";
      const meta = document.createElement("small");
      meta.textContent = item.candles.length + " bars · " + (Array.isArray(item.lines) ? item.lines.length : 0) + " lines · " + (item.bias || "neutral") + " · " + (item.timeframe || "Any");
      info.append(title, meta);
      const load = document.createElement("button");
      load.type = "button";
      load.className = "saved-load";
      load.dataset.action = "load";
      load.dataset.id = item.id;
      load.textContent = "↗";
      load.setAttribute("aria-label", "โหลด " + (item.name || "แพตเทิร์น"));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "saved-delete";
      remove.dataset.action = "delete";
      remove.dataset.id = item.id;
      remove.textContent = "×";
      remove.setAttribute("aria-label", "ลบ " + (item.name || "แพตเทิร์น"));
      card.append(mini, info, load, remove);
      elements.savedPatterns.append(card);
    });
  }

  document.getElementById("save-pattern").addEventListener("click", () => {
    if (!state.bars.length && !state.lines.length) {
      showToast("วาดแท่งเทียนหรือเส้นอย่างน้อย 1 รายการก่อนบันทึก");
      return;
    }
    const patterns = getSavedPatterns();
    const item = {
      id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 7),
      name: elements.name.value.trim() || "EALabtp sl entry",
      bias: elements.bias.value,
      timeframe: elements.timeframe.value,
      description: elements.description.value.trim(),
      candles: cloneBars(state.bars),
      lines: cloneLines(state.lines),
      savedAt: new Date().toISOString()
    };
    const sameName = pattern => (pattern.name || "Untitled pattern").trim().toLowerCase() === item.name.trim().toLowerCase();
    writeSavedPatterns([item, ...patterns.filter(pattern => !sameName(pattern))]);
    renderSavedPatterns();
    showToast("บันทึกแพตเทิร์นลงคลังแล้ว");
  });

  elements.savedPatterns.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    const patterns = getSavedPatterns();
    const item = patterns.find(pattern => pattern.id === id);
    if (!item) return;
    if (button.dataset.action === "delete") {
      writeSavedPatterns(patterns.filter(pattern => pattern.id !== id));
      renderSavedPatterns();
      showToast("ลบแพตเทิร์นแล้ว");
      return;
    }
    remember();
    state.bars = cloneBars(item.candles).slice(0, MAX_BARS);
    state.lines = normalizeLoadedLines(cloneLines(Array.isArray(item.lines) ? item.lines : []));
    state.nextLineId = Math.max(state.nextLineId, ...state.lines.map(line => Number(line.id) + 1).filter(Number.isFinite), 1);
    state.selectedLine = null;
    state.selected = state.bars.length ? 0 : -1;
    elements.name.value = item.name || "Untitled pattern";
    elements.bias.value = item.bias || "neutral";
    elements.timeframe.value = item.timeframe || "Any";
    elements.description.value = item.description || "";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast("โหลดแพตเทิร์นแล้ว");
  });

  function showLogicMessage(message) {
    state.options = [];
    state.selectedOptionId = "";
    state.logic = "";
    elements.logicOptions.replaceChildren();
    elements.logicOptions.classList.add("hidden");
    elements.selectedOptionSummary.classList.add("hidden");
    elements.logicOutput.classList.add("hidden");
    elements.logicPlaceholder.classList.remove("hidden");
    elements.logicPlaceholder.querySelector("strong").textContent = message;
    elements.logicPlaceholder.querySelector("p").textContent = "";
    elements.copyButton.disabled = true;
    elements.downloadButton.disabled = true;
  }

  function selectLogicOption(id) {
    const option = state.options.find(item => item.id === id);
    if (!option) return;
    state.selectedOptionId = id;
    state.logic = option.code;
    elements.logicOptions.querySelectorAll(".logic-option").forEach(button => {
      const selected = button.dataset.optionId === id;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
    elements.selectedOptionSummary.textContent = option.summary;
    elements.selectedOptionSummary.classList.remove("hidden");
    elements.logicOutput.textContent = option.code;
    elements.logicOutput.classList.remove("hidden");
    elements.copyButton.disabled = false;
    elements.downloadButton.disabled = false;
  }

  function showLogicOptions(options) {
    state.options = options;
    state.selectedOptionId = "";
    state.logic = "";
    elements.logicPlaceholder.classList.add("hidden");
    elements.logicOptions.replaceChildren();
    elements.logicOptions.classList.remove("hidden");
    elements.selectedOptionSummary.classList.add("hidden");
    elements.logicOutput.classList.add("hidden");
    elements.copyButton.disabled = true;
    elements.downloadButton.disabled = true;

    options.forEach(option => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "logic-option";
      button.dataset.optionId = option.id;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", "false");
      const title = document.createElement("strong");
      title.textContent = option.title;
      const summary = document.createElement("span");
      summary.textContent = option.summary;
      const marker = document.createElement("i");
      marker.className = "option-radio";
      button.append(marker, title, summary);
      button.addEventListener("click", () => selectLogicOption(option.id));
      elements.logicOptions.append(button);
    });
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2700);
  }

  elements.generateButton.addEventListener("click", async () => {
    if (!state.bars.length && !state.lines.length && !elements.description.value.trim()) {
      showToast("วาดแท่งเทียน วาดเส้น หรือเขียนคำอธิบายแพตเทิร์นก่อน");
      return;
    }
    elements.generateButton.disabled = true;
    elements.generateLabel.textContent = "กำลังวิเคราะห์รูปแบบ…";
    elements.generateButton.querySelector(".sparkle").textContent = "◌";
    showLogicMessage("กำลังอ่านแท่ง เส้น และคำอธิบายเพื่อสร้างตัวเลือก…");
    try {
      const response = await fetch("/api/generate-logic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patternName: elements.name.value.trim() || "Untitled pattern",
          bias: elements.bias.value,
          timeframe: elements.timeframe.value,
          description: elements.description.value.trim(),
          candles: normalizePatternBars(state.bars),
          lines: normalizePatternLines(state.lines, state.bars)
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "สร้าง logic ไม่สำเร็จ");
      if (!Array.isArray(data.options) || data.options.length !== 3) {
        throw new Error("AI ส่งตัวเลือกมาไม่ครบ ลองสร้างใหม่อีกครั้ง");
      }
      showLogicOptions(data.options);
      showToast("ได้ logic 3 แบบแล้ว เลือกแบบที่ตรงที่สุด");
    } catch (error) {
      showLogicMessage(error.message || "เกิดข้อผิดพลาดขณะเรียก AI");
      showToast(error.message || "สร้าง logic ไม่สำเร็จ");
    } finally {
      elements.generateButton.disabled = false;
      elements.generateLabel.textContent = "สร้าง logic ด้วย AI";
      elements.generateButton.querySelector(".sparkle").textContent = "✦";
    }
  });

  elements.copyButton.addEventListener("click", async () => {
    if (!state.logic) return;
    try {
      await navigator.clipboard.writeText(state.logic);
      showToast("คัดลอก JavaScript แล้ว");
    } catch {
      showToast("คัดลอกไม่สำเร็จ ตรวจสอบสิทธิ์ Clipboard ของเบราว์เซอร์");
    }
  });

  elements.downloadButton.addEventListener("click", () => {
    if (!state.logic) return;
    const blob = new Blob([state.logic], { type: "text/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = (elements.name.value.trim() || "candlestick-pattern")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") + ".js";
    link.click();
    URL.revokeObjectURL(url);
  });

  window.addEventListener("resize", resizeCanvas);
  if ("ResizeObserver" in window) new ResizeObserver(resizeCanvas).observe(canvas);
  renderSavedPatterns();
  render();
  updateZoomControls();
  resizeCanvas();
})();
