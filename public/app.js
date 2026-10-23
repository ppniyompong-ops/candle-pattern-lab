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
    selected: 4,
    tool: "bull",
    drawing: null,
    undo: [],
    redo: [],
    options: [],
    selectedOptionId: "",
    logic: "",
    viewScale: 1,
    viewStart: 0
  };
  const elements = {
    barCount: document.getElementById("bar-count"),
    aiBarCount: document.getElementById("ai-bar-count"),
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
    toolHint: document.getElementById("tool-hint")
  };

  let chartSize = { width: 0, height: 0 };
  let priceRange = { min: 90, max: 110 };
  let toastTimer = null;

  function cloneBars(bars) {
    return bars.map(bar => ({ ...bar }));
  }

  function remember() {
    state.undo.push(cloneBars(state.bars));
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

  function getPreviewBar() {
    if (!state.drawing) return null;
    const start = state.drawing.startPrice;
    let end = state.drawing.endPrice;
    const drawingRange = state.drawing.range;
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
    elements.emptyHint.classList.toggle("hidden", state.bars.length > 0);
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
    elements.aiBarCount.textContent = state.bars.length + (state.bars.length === 1 ? " candle" : " candles");
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

  function render() {
    updateCounts();
    updateInspector();
    updateHistoryButtons();
    renderChart();
  }

  function setTool(tool) {
    state.tool = tool;
    document.querySelectorAll("[data-tool]").forEach(button => {
      const active = button.dataset.tool === tool;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const hints = {
      bull: "เริ่มลากจาก Open ไปยัง Close",
      bear: "เริ่มลากจาก Open ไปยัง Close",
      select: "คลิกจุดจับบนแท่งเพื่อปรับ Open / High / Low / Close",
      erase: "คลิกแท่งเทียนที่ต้องการลบ"
    };
    elements.toolHint.textContent = hints[tool];
    canvas.style.cursor = tool === "erase" ? "not-allowed" : "crosshair";
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

  function visibleSlots(plot) {
    return MAX_BARS / state.viewScale;
  }

  function clampViewStart(plot) {
    const lastVisibleStart = Math.max(0, state.bars.length + 1 - visibleSlots(plot));
    state.viewStart = Math.max(0, Math.min(lastVisibleStart, state.viewStart));
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
    state.viewStart = 0;
    renderChart();
    updateZoomControls();
  }

  function setSelected(index) {
    if (!state.bars.length) return;
    state.selected = Math.max(0, Math.min(state.bars.length - 1, index));
    render();
  }

  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const point = pointForEvent(event);
    if (point.x < point.plot.left || point.x > point.plot.right || point.y < point.plot.top || point.y > point.plot.bottom) return;
    const requestedIndex = indexForX(point.x, point.plot);
    if (state.tool === "select") {
      if (state.bars.length) {
        const index = Math.min(requestedIndex, state.bars.length - 1);
        const bar = state.bars[index];
        const slot = (point.plot.right - point.plot.left) / MAX_BARS * state.viewScale;
        const centerX = point.plot.left + (index + 0.5 - state.viewStart) * slot;
        const handles = [
          ["high", yForPrice(bar.high, priceRange, point.plot)],
          ["open", yForPrice(bar.open, priceRange, point.plot)],
          ["close", yForPrice(bar.close, priceRange, point.plot)],
          ["low", yForPrice(bar.low, priceRange, point.plot)]
        ];
        const handle = handles.find(([, y]) => Math.hypot(point.x - centerX, point.y - y) < 13);
        if (handle) {
          remember();
          state.selected = index;
          state.drawing = { adjusting: handle[0], index, range: { ...priceRange } };
          canvas.setPointerCapture(event.pointerId);
          renderChart();
        } else {
          state.selected = index;
          state.drawing = {
            panning: true,
            moved: false,
            startX: point.x,
            initialViewStart: state.viewStart,
            index
          };
          canvas.setPointerCapture(event.pointerId);
        }
      }
      return;
    }
    if (state.tool === "erase") {
      if (requestedIndex < state.bars.length) {
        remember();
        state.bars.splice(requestedIndex, 1);
        state.selected = state.bars.length ? Math.min(requestedIndex, state.bars.length - 1) : -1;
        render();
      }
      return;
    }
    if (state.bars.length >= MAX_BARS && requestedIndex >= state.bars.length) {
      showToast("วาดได้สูงสุด " + MAX_BARS + " แท่ง");
      return;
    }
    const index = Math.min(requestedIndex, state.bars.length);
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
    if (!state.drawing) return;
    const point = pointForEvent(event);
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
    const y = Math.max(point.plot.top, Math.min(point.plot.bottom, point.y));
    const fraction = Math.max(0, Math.min(1, (y - point.plot.top) / (point.plot.bottom - point.plot.top)));
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
    if (state.drawing.adjusting) {
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
    state.redo.push(cloneBars(state.bars));
    state.bars = state.undo.pop();
    state.selected = state.bars.length ? Math.min(state.selected, state.bars.length - 1) : -1;
    render();
  });
  elements.redoButton.addEventListener("click", () => {
    if (!state.redo.length) return;
    state.undo.push(cloneBars(state.bars));
    state.bars = state.redo.pop();
    state.selected = state.bars.length ? Math.min(state.selected, state.bars.length - 1) : -1;
    render();
  });
  document.getElementById("clear-button").addEventListener("click", () => {
    if (!state.bars.length) return;
    remember();
    state.bars = [];
    state.selected = -1;
    render();
    showToast("ล้างแท่งเทียนแล้ว");
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
      meta.textContent = item.candles.length + " bars · " + (item.bias || "neutral") + " · " + (item.timeframe || "Any");
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
    if (!state.bars.length) {
      showToast("วาดแท่งเทียนอย่างน้อย 1 แท่งก่อนบันทึก");
      return;
    }
    const patterns = getSavedPatterns();
    const item = {
      id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 7),
      name: elements.name.value.trim() || "Untitled pattern",
      bias: elements.bias.value,
      timeframe: elements.timeframe.value,
      description: elements.description.value.trim(),
      candles: cloneBars(state.bars),
      savedAt: new Date().toISOString()
    };
    writeSavedPatterns([item, ...patterns]);
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
    state.selected = state.bars.length ? state.bars.length - 1 : -1;
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
    if (!state.bars.length && !elements.description.value.trim()) {
      showToast("วาดแท่งเทียนหรือเขียนคำอธิบายแพตเทิร์นก่อน");
      return;
    }
    elements.generateButton.disabled = true;
    elements.generateLabel.textContent = "กำลังวิเคราะห์รูปแบบ…";
    elements.generateButton.querySelector(".sparkle").textContent = "◌";
    showLogicMessage("กำลังอ่านรูปวาดและคำอธิบายเพื่อสร้างตัวเลือก…");
    try {
      const response = await fetch("/api/generate-logic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patternName: elements.name.value.trim() || "Untitled pattern",
          bias: elements.bias.value,
          timeframe: elements.timeframe.value,
          description: elements.description.value.trim(),
          candles: normalizePatternBars(state.bars)
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
