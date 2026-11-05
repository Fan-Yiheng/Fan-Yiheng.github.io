(() => {
  'use strict';

  const PRESETS = [
    { id: 'social', name: '社保卡', w: 358, h: 441, dpi: 350, use: '社保卡 / 医保卡' },
    { id: 'one', name: '一寸', w: 295, h: 413, dpi: 300, use: '通用一寸' },
    { id: 'small-one', name: '小一寸', w: 260, h: 378, dpi: 300, use: '驾驶证 / 学生证' },
    { id: 'big-one', name: '大一寸', w: 390, h: 567, dpi: 300, use: '护照 / 港澳通行证' },
    { id: 'two', name: '二寸', w: 413, h: 579, dpi: 300, use: '通用二寸' },
    { id: 'small-two', name: '小二寸', w: 413, h: 531, dpi: 300, use: '签证 / 简历' },
    { id: 'passport', name: '护照', w: 390, h: 567, dpi: 300, use: '中国护照' },
    { id: 'visa', name: '签证', w: 354, h: 472, dpi: 300, use: '各国签证' },
    { id: 'driver', name: '驾驶证', w: 260, h: 378, dpi: 300, use: '机动车驾驶证' },
    { id: 'student', name: '学籍照', w: 480, h: 640, dpi: 300, use: '学籍 / 档案' }
  ];

  const QUICK_PRESETS = ['social', 'one', 'two', 'passport', 'visa'];
  // 主页版：示例图路径由页面注入（见 idphoto.html），未注入时回退到站点资源目录。
  const DEMO_SRC = (typeof window !== 'undefined' && window.FRAME_DEMO_SRC)
    ? window.FRAME_DEMO_SRC
    : '/assets/idphoto/demo-brand.svg';

  const state = {
    image: null,
    objectUrl: null,
    imgW: 0,
    imgH: 0,
    fileName: '示例肖像',
    fileSize: 0,
    isDemo: true,
    imageVersion: 0,
    presetId: 'social',
    targetW: 358,
    targetH: 441,
    dpi: 350,
    lock: true,
    anchor: 'long',
    format: 'jpeg',
    quality: 92,
    grid: true,
    stageW: 0,
    stageH: 0,
    frame: { w: 0, h: 0, cx: 0, cy: 0 },
    scale: 1,
    centerX: 0,
    centerY: 0,
    pointers: new Map(),
    drag: null,
    pinch: null,
    resizing: null,
    lastStageW: 0,
    lastStageH: 0
  };

  const $ = (id) => document.getElementById(id);
  const dom = {
    stageCard: $('stageCard'),
    stage: $('stage'),
    canvas: $('stageCanvas'),
    cropUi: $('cropUi'),
    frameLabel: $('frameLabel'),
    fileName: $('fileName'),
    sourceDims: $('sourceDims'),
    demoTag: $('demoTag'),
    fileSize: $('fileSize'),
    emptyState: $('emptyState'),
    dragHint: $('dragHint'),
    presetGrid: $('presetGrid'),
    presetName: $('presetName'),
    targetWLabel: $('targetWLabel'),
    targetHLabel: $('targetHLabel'),
    sourceSize: $('sourceSize'),
    outSize: $('outSize'),
    lockSwitch: $('lockSwitch'),
    lockHint: $('lockHint'),
    freePanel: $('freePanel'),
    anchorSeg: $('anchorSeg'),
    longEdgeLabel: $('longEdgeLabel'),
    widthEdgeLabel: $('widthEdgeLabel'),
    heightEdgeLabel: $('heightEdgeLabel'),
    ratioValue: $('ratioValue'),
    printValue: $('printValue'),
    cropInfo: $('cropInfo'),
    outputInfo: $('outputInfo'),
    resolutionNote: $('resolutionNote'),
    resolutionText: $('resolutionText'),
    dpiBadge: $('dpiBadge'),
    formatSeg: $('formatSeg'),
    qualityBlock: $('qualityBlock'),
    qualityRange: $('qualityRange'),
    qualityValue: $('qualityValue'),
    exportBtn: $('exportBtn'),
    exportSub: $('exportSub'),
    copyBtn: $('copyBtn'),
    zoomRange: $('zoomRange'),
    zoomValue: $('zoomValue'),
    gridBtn: $('gridBtn'),
    customSize: $('customSize'),
    customW: $('customW'),
    customH: $('customH'),
    fileInput: $('fileInput'),
    guideDialog: $('guideDialog'),
    sizeTable: $('sizeTable'),
    toast: $('toast'),
    toastText: $('toastText')
  };

  const ctx = dom.canvas.getContext('2d');
  let renderRaf = 0;
  let toastTimer = 0;
  let hintTimer = 0;
  let dragDepth = 0;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const aspect = () => state.targetW / state.targetH;

  function formatBytes(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatMm(w, h, dpi) {
    const mmW = (w / dpi) * 25.4;
    const mmH = (h / dpi) * 25.4;
    return `${mmW.toFixed(1)} × ${mmH.toFixed(1)} mm`;
  }

  function presetById(id) {
    return PRESETS.find((preset) => preset.id === id);
  }

  function showToast(message, isError = false) {
    dom.toastText.textContent = message;
    dom.toast.style.setProperty('--toast-dot', isError ? '#d47a54' : '#cf9a78');
    dom.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => dom.toast.classList.remove('is-visible'), 2800);
  }

  /* ---------- presets / size library ---------- */

  function renderPresets() {
    const quick = QUICK_PRESETS.map((id) => {
      const preset = presetById(id);
      return `
        <button class="preset-tile" type="button" data-preset="${preset.id}" aria-pressed="false">
          <span class="preset-thumb" aria-hidden="true"></span>
          <span class="preset-copy">
            <span class="preset-name">${preset.name}</span>
            <span class="preset-dim">${preset.w} × ${preset.h}</span>
          </span>
        </button>`;
    }).join('');

    dom.presetGrid.innerHTML = `${quick}
      <button class="preset-tile is-custom" type="button" data-preset="custom" aria-pressed="false">
        <span class="preset-thumb" aria-hidden="true">+</span>
        <span class="preset-copy">
          <span class="preset-name">自定义</span>
          <span class="preset-dim">自由输入尺寸</span>
        </span>
      </button>`;

    dom.presetGrid.querySelectorAll('[data-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.preset;
        if (id === 'custom') {
          openCustomSize();
        } else {
          applyPreset(id);
        }
      });
    });
  }

  function renderSizeTable() {
    dom.sizeTable.innerHTML = PRESETS.map((preset) => {
      const mm = `${(preset.w / preset.dpi * 25.4).toFixed(1)} × ${(preset.h / preset.dpi * 25.4).toFixed(1)} mm`;
      return `
        <button class="size-row" type="button" data-size-id="${preset.id}">
          <span class="size-name">${preset.name}</span>
          <span class="size-px">${preset.w} × ${preset.h}</span>
          <span class="size-mm">${mm}</span>
          <span class="size-dpi">${preset.dpi} DPI</span>
          <span class="size-use">使用</span>
        </button>`;
    }).join('');

    dom.sizeTable.querySelectorAll('[data-size-id]').forEach((button) => {
      button.addEventListener('click', () => {
        applyPreset(button.dataset.sizeId);
        closeDialog(dom.guideDialog);
        showToast(`已切换到 ${presetById(button.dataset.sizeId).name}规格`);
      });
    });
  }

  function markActivePreset() {
    dom.presetGrid.querySelectorAll('[data-preset]').forEach((button) => {
      const active = button.dataset.preset === state.presetId;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function applyPreset(id, options = {}) {
    const preset = presetById(id);
    if (!preset) return;

    state.presetId = preset.id;
    state.targetW = preset.w;
    state.targetH = preset.h;
    state.dpi = preset.dpi;
    state.lock = true;
    dom.customSize.hidden = true;

    if (state.image && !options.keepComposition) {
      setDefaultFrame(aspect());
      state.scale = Math.max(state.scale, minScale());
      constrainCenter();
    }

    updateUI();
    requestRender();
  }

  function openCustomSize() {
    dom.customSize.hidden = false;
    dom.customW.value = String(state.targetW);
    dom.customH.value = String(state.targetH);
    dom.customW.focus();
    dom.customW.select();
  }

  function applyCustomSize() {
    const w = clamp(Math.round(Number(dom.customW.value) || 0), 16, 6000);
    const h = clamp(Math.round(Number(dom.customH.value) || 0), 16, 6000);
    if (!w || !h) {
      showToast('请输入有效的宽高像素值', true);
      return;
    }
    dom.customW.value = String(w);
    dom.customH.value = String(h);
    state.presetId = 'custom';
    state.targetW = w;
    state.targetH = h;
    state.dpi = 300;
    state.lock = true;
    dom.customSize.hidden = false;

    if (state.image) {
      setDefaultFrame(aspect());
      state.scale = Math.max(state.scale, minScale());
      constrainCenter();
    }
    updateUI();
    requestRender();
    showToast(`自定义尺寸已应用：${w} × ${h} px`);
  }

  /* ---------- layout / crop math ---------- */

  function measureStage() {
    const rect = dom.stage.getBoundingClientRect();
    state.stageW = Math.max(1, Math.round(rect.width));
    state.stageH = Math.max(1, Math.round(rect.height));
  }

  function frameArea() {
    const w = state.stageW;
    const h = state.stageH;
    const padX = w < 560 ? 28 : 52;
    const padTop = h < 520 ? 48 : 62;
    const padBottom = h < 520 ? 74 : 92;
    return {
      x: padX,
      y: padTop,
      w: Math.max(80, w - padX * 2),
      h: Math.max(80, h - padTop - padBottom),
      cx: w / 2,
      cy: padTop + Math.max(80, h - padTop - padBottom) / 2
    };
  }

  function setDefaultFrame(ratio = aspect()) {
    const area = frameArea();
    let frameH = Math.min(area.h * 0.96, (area.w * 0.96) / ratio);
    let frameW = frameH * ratio;
    if (frameW > area.w * 0.96) {
      frameW = area.w * 0.96;
      frameH = frameW / ratio;
    }
    state.frame = {
      w: Math.max(80, frameW),
      h: Math.max(80, frameH),
      cx: area.cx,
      cy: area.cy
    };
  }

  function minScale() {
    if (!state.imgW || !state.imgH) return 1;
    return Math.max(state.frame.w / state.imgW, state.frame.h / state.imgH);
  }

  function constrainCenter() {
    if (!state.image) return;
    const cropW = state.frame.w / state.scale;
    const cropH = state.frame.h / state.scale;
    const halfW = Math.min(cropW, state.imgW) / 2;
    const halfH = Math.min(cropH, state.imgH) / 2;
    state.centerX = clamp(state.centerX, halfW, Math.max(halfW, state.imgW - halfW));
    state.centerY = clamp(state.centerY, halfH, Math.max(halfH, state.imgH - halfH));
  }

  function resetComposition() {
    if (!state.image) return;
    const ratio = state.lock ? aspect() : state.frame.w / state.frame.h;
    setDefaultFrame(ratio);
    const min = minScale();
    if (state.isDemo) {
      state.scale = min * 1.28;
      state.centerX = state.imgW * 0.5;
      state.centerY = state.imgH * 0.35;
    } else {
      state.scale = min;
      state.centerX = state.imgW * 0.5;
      state.centerY = state.imgH * (state.imgH > state.imgW ? 0.46 : 0.5);
    }
    constrainCenter();
    dom.dragHint.classList.remove('is-hidden');
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => dom.dragHint.classList.add('is-hidden'), 5200);
    requestRender();
  }

  function getCropRect() {
    if (!state.image || !state.scale) {
      return { x: 0, y: 0, w: 1, h: 1 };
    }
    const w = state.frame.w / state.scale;
    const h = state.frame.h / state.scale;
    let x = state.centerX - w / 2;
    let y = state.centerY - h / 2;
    x = clamp(x, 0, Math.max(0, state.imgW - w));
    y = clamp(y, 0, Math.max(0, state.imgH - h));
    return { x, y, w, h };
  }

  function getOutputSize() {
    if (state.lock) {
      return { w: state.targetW, h: state.targetH };
    }
    const crop = getCropRect();
    const cropAspect = crop.w / crop.h;
    if (Math.abs(cropAspect / aspect() - 1) < 0.006) {
      return { w: state.targetW, h: state.targetH };
    }
    let w;
    let h;

    if (state.anchor === 'width') {
      w = state.targetW;
      h = Math.round(w / cropAspect);
    } else if (state.anchor === 'height') {
      h = state.targetH;
      w = Math.round(h * cropAspect);
    } else {
      const longEdge = Math.max(state.targetW, state.targetH);
      if (cropAspect >= 1) {
        w = longEdge;
        h = Math.round(longEdge / cropAspect);
      } else {
        h = longEdge;
        w = Math.round(longEdge * cropAspect);
      }
    }

    return {
      w: clamp(w || 1, 16, 6000),
      h: clamp(h || 1, 16, 6000)
    };
  }

  /* ---------- rendering ---------- */

  function requestRender() {
    if (renderRaf) return;
    renderRaf = requestAnimationFrame(() => {
      renderRaf = 0;
      drawStage();
      updateMetrics();
      syncFrameUi();
    });
  }

  function syncCanvasSize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(state.stageW * dpr);
    const height = Math.round(state.stageH * dpr);
    if (dom.canvas.width !== width || dom.canvas.height !== height) {
      dom.canvas.width = width;
      dom.canvas.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return dpr;
  }

  let backdropCache = { key: '', canvas: null };

  function getBlurredBackdrop() {
    const key = `${state.imageVersion}:${state.stageW}x${state.stageH}`;
    if (backdropCache.key === key && backdropCache.canvas) {
      return backdropCache.canvas;
    }
    const width = 300;
    const height = Math.max(80, Math.round(width * (state.stageH / state.stageW)));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const bctx = canvas.getContext('2d');
    const cover = Math.max(width / state.imgW, height / state.imgH) * 1.16;
    const drawW = state.imgW * cover;
    const drawH = state.imgH * cover;
    bctx.save();
    bctx.filter = 'blur(9px) brightness(0.52) saturate(0.82)';
    bctx.drawImage(state.image, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
    bctx.restore();
    bctx.fillStyle = 'rgba(15, 14, 12, 0.2)';
    bctx.fillRect(0, 0, width, height);
    backdropCache = { key, canvas };
    return canvas;
  }

  function drawStage() {
    if (!state.stageW || !state.stageH) return;
    syncCanvasSize();
    const W = state.stageW;
    const H = state.stageH;
    ctx.clearRect(0, 0, W, H);
    if (!state.image) return;

    const f = state.frame;
    const x = f.cx - f.w / 2;
    const y = f.cy - f.h / 2;
    const imageX = f.cx - state.centerX * state.scale;
    const imageY = f.cy - state.centerY * state.scale;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(getBlurredBackdrop(), 0, 0, W, H);
    ctx.restore();

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      state.image,
      imageX,
      imageY,
      state.imgW * state.scale,
      state.imgH * state.scale
    );
    ctx.restore();

    // darken everything outside the crop frame
    ctx.fillStyle = 'rgba(12, 11, 10, 0.61)';
    ctx.fillRect(0, 0, W, Math.max(0, y));
    ctx.fillRect(0, y + f.h, W, Math.max(0, H - y - f.h));
    ctx.fillRect(0, y, Math.max(0, x), f.h);
    ctx.fillRect(x + f.w, y, Math.max(0, W - x - f.w), f.h);

    // a soft halo makes the frame readable on any photograph
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 26;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, f.w - 1, f.h - 1);
    ctx.restore();

    if (state.grid) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 253, 248, 0.2)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      for (let i = 1; i < 3; i += 1) {
        const gx = Math.round(x + (f.w / 3) * i) + 0.5;
        const gy = Math.round(y + (f.h / 3) * i) + 0.5;
        ctx.moveTo(gx, y);
        ctx.lineTo(gx, y + f.h);
        ctx.moveTo(x, gy);
        ctx.lineTo(x + f.w, gy);
      }
      ctx.stroke();
      ctx.restore();
    }

    // crop frame hairline
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 253, 248, 0.94)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, f.w - 1, f.h - 1);
    ctx.restore();

    // crop corner ticks
    const tick = Math.min(20, f.w * 0.12, f.h * 0.06);
    ctx.save();
    ctx.strokeStyle = '#fffdf8';
    ctx.lineWidth = 2;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(x, y + tick);
    ctx.lineTo(x, y);
    ctx.lineTo(x + tick, y);
    ctx.moveTo(x + f.w - tick, y);
    ctx.lineTo(x + f.w, y);
    ctx.lineTo(x + f.w, y + tick);
    ctx.moveTo(x + f.w, y + f.h - tick);
    ctx.lineTo(x + f.w, y + f.h);
    ctx.lineTo(x + f.w - tick, y + f.h);
    ctx.moveTo(x + tick, y + f.h);
    ctx.lineTo(x, y + f.h);
    ctx.lineTo(x, y + f.h - tick);
    ctx.stroke();
    ctx.restore();

    // low-key inner vignette
    const gradient = ctx.createLinearGradient(0, H - 150, 0, H);
    gradient.addColorStop(0, 'rgba(12, 11, 10, 0)');
    gradient.addColorStop(1, 'rgba(12, 11, 10, 0.34)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, H - 150, W, 150);
  }

  function syncFrameUi() {
    if (!state.image) {
      dom.cropUi.style.opacity = '0';
      return;
    }
    dom.cropUi.style.opacity = '1';
    const f = state.frame;
    const x = f.cx - f.w / 2;
    const y = f.cy - f.h / 2;

    dom.frameLabel.style.left = `${f.cx}px`;
    dom.frameLabel.style.top = `${y}px`;

    dom.cropUi.querySelectorAll('.crop-handle').forEach((handle) => {
      const corner = handle.dataset.handle;
      handle.style.left = `${corner.includes('e') ? x + f.w : x}px`;
      handle.style.top = `${corner.includes('s') ? y + f.h : y}px`;
    });
  }

  /* ---------- UI sync ---------- */

  function updateUI() {
    const preset = presetById(state.presetId);
    const name = state.presetId === 'custom' ? '自定义' : preset ? preset.name : '自定义';
    dom.presetName.textContent = name;
    dom.targetWLabel.textContent = String(state.targetW);
    dom.targetHLabel.textContent = String(state.targetH);
    dom.longEdgeLabel.textContent = String(Math.max(state.targetW, state.targetH));
    const restoreBtn = document.getElementById('restoreRatio');
    if (restoreBtn) restoreBtn.textContent = `恢复 ${state.targetW} × ${state.targetH}`;
    dom.widthEdgeLabel.textContent = String(state.targetW);
    dom.heightEdgeLabel.textContent = String(state.targetH);
    dom.dpiBadge.textContent = `${state.dpi} DPI`;

    dom.lockSwitch.setAttribute('aria-checked', String(state.lock));
    dom.freePanel.hidden = state.lock;
    dom.stage.classList.toggle('free-mode', !state.lock);
    dom.lockHint.textContent = state.lock
      ? '成品严格按证件规格输出'
      : '自由裁切，按定尺边等比输出';

    dom.anchorSeg.querySelectorAll('[data-anchor]').forEach((button) => {
      button.classList.toggle('active', button.dataset.anchor === state.anchor);
    });

    dom.formatSeg.querySelectorAll('[data-format]').forEach((button) => {
      button.classList.toggle('active', button.dataset.format === state.format);
    });
    dom.qualityBlock.style.opacity = state.format === 'png' ? '0.38' : '1';
    dom.qualityBlock.style.pointerEvents = state.format === 'png' ? 'none' : 'auto';
    dom.qualityValue.textContent = `${state.quality}%`;

    dom.fileName.textContent = state.fileName;
    dom.sourceDims.textContent = state.image ? `${state.imgW} × ${state.imgH} px` : '等待载入';
    dom.demoTag.hidden = !state.isDemo;
    dom.fileSize.textContent = state.isDemo ? '示例文件' : formatBytes(state.fileSize);
    dom.gridBtn.setAttribute('aria-pressed', String(state.grid));

    markActivePreset();
    updateMetrics();
  }

  function updateMetrics() {
    if (!state.image) {
      dom.sourceSize.textContent = '—';
      dom.outSize.textContent = `${state.targetW} × ${state.targetH}`;
      dom.exportSub.textContent = `${state.format === 'png' ? 'PNG' : 'JPG'} · ${state.targetW} × ${state.targetH} px`;
      dom.exportBtn.disabled = true;
      return;
    }

    const crop = getCropRect();
    const out = getOutputSize();
    const cropW = Math.max(1, Math.round(crop.w));
    const cropH = Math.max(1, Math.round(crop.h));
    const cropAspect = crop.w / crop.h;

    const standardOut = out.w === state.targetW && out.h === state.targetH;
    dom.sourceSize.textContent = `${state.imgW} × ${state.imgH}`;
    dom.outSize.textContent = `${out.w} × ${out.h}`;
    dom.exportSub.textContent = `${state.format === 'png' ? 'PNG' : 'JPG'} · ${out.w} × ${out.h} px${state.lock || standardOut ? '' : ' · 自由'}`;
    dom.cropInfo.textContent = `裁切区 ${cropW} × ${cropH} px`;
    dom.outputInfo.textContent = `输出 ${out.w} × ${out.h} px · ${state.dpi} DPI`;
    dom.printValue.textContent = formatMm(out.w, out.h, state.dpi);
    dom.ratioValue.textContent = cropAspect >= 1
      ? `${cropAspect.toFixed(2)} : 1`
      : `1 : ${(1 / cropAspect).toFixed(2)}`;

    const min = minScale();
    const percent = Math.round((state.scale / min) * 100);
    dom.zoomValue.textContent = `${percent}%`;
    dom.zoomRange.value = String(clamp(percent, 100, 500));
    dom.zoomRange.style.setProperty('--zoom', `${clamp(percent, 100, 500)}%`);

    const upscale = Math.max(out.w / crop.w, out.h / crop.h);
    const warning = upscale > 1.015;
    dom.resolutionNote.classList.toggle('is-warning', warning);
    if (warning) {
      dom.resolutionText.textContent = `裁切区 ${cropW} × ${cropH} px，将放大 ${upscale.toFixed(1)}×，建议更换更高清原图`;
    } else {
      dom.resolutionText.textContent = `裁切区 ${cropW} × ${cropH} px，画质充足，可安全输出`;
    }

    if (state.lock || standardOut) {
      dom.frameLabel.textContent = `${state.targetW} × ${state.targetH}`;
    } else {
      dom.frameLabel.textContent = `自由 · ${out.w} × ${out.h}`;
    }
    dom.exportBtn.disabled = false;
  }

  /* ---------- image loading ---------- */

  function loadDemo() {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      setImage(image, {
        name: 'DeepSeek 样例',
        size: 0,
        isDemo: true
      });
    };
    image.onerror = () => {
      dom.emptyState.hidden = false;
      dom.stage.classList.add('no-image');
    };
    image.src = DEMO_SRC;
  }

  function setImage(image, meta) {
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = null;
    }
    state.image = image;
    state.imgW = image.naturalWidth || image.width;
    state.imgH = image.naturalHeight || image.height;
    state.fileName = meta.name || '照片';
    state.fileSize = meta.size || 0;
    state.isDemo = Boolean(meta.isDemo);
    state.imageVersion += 1;
    state.objectUrl = meta.objectUrl || null;
    dom.emptyState.hidden = true;
    dom.stage.classList.remove('no-image');
    dom.dragHint.classList.remove('is-hidden');

    updateUI();
    resetComposition();
    updateUI();
    requestRender();
    showToast(state.isDemo ? '示例照片已载入 · 可直接体验' : `已载入 ${state.imgW} × ${state.imgH} px 照片`);
  }

  function readFile(file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      showToast('请选择 JPG、PNG 或 WebP 图片', true);
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      showToast('照片超过 30 MB，请压缩后再试', true);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      setImage(image, {
        name: file.name.replace(/\.[^.]+$/, ''),
        size: file.size,
        isDemo: false,
        objectUrl
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      showToast('无法读取这张图片，请尝试 JPG / PNG / WebP', true);
    };
    image.src = objectUrl;
  }

  /* ---------- interactions ---------- */

  function setScale(nextScale, anchorX, anchorY) {
    const min = minScale();
    const max = min * 6;
    const next = clamp(nextScale, min, max);
    if (!Number.isFinite(next) || Math.abs(next - state.scale) < 0.00001) return;

    if (Number.isFinite(anchorX) && Number.isFinite(anchorY)) {
      const oldScale = state.scale;
      const sourceX = state.centerX + (anchorX - state.frame.cx) / oldScale;
      const sourceY = state.centerY + (anchorY - state.frame.cy) / oldScale;
      state.scale = next;
      state.centerX = sourceX - (anchorX - state.frame.cx) / next;
      state.centerY = sourceY - (anchorY - state.frame.cy) / next;
    } else {
      state.scale = next;
    }
    constrainCenter();
    requestRender();
  }

  function zoomByStep(delta) {
    const min = minScale();
    const current = Math.round((state.scale / min) * 100);
    const target = clamp(current + delta, 100, 500);
    setScale(min * (target / 100));
  }

  function panBy(dx, dy) {
    if (!state.image) return;
    state.centerX -= dx / state.scale;
    state.centerY -= dy / state.scale;
    constrainCenter();
    requestRender();
  }

  function beginPointer(event) {
    if (!state.image || state.resizing) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('button, input, .crop-handle')) return;

    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dom.stage.setPointerCapture(event.pointerId);
    dom.dragHint.classList.add('is-hidden');

    if (state.pointers.size === 1) {
      state.drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY
      };
      state.pinch = null;
      dom.stage.classList.add('is-dragging');
    } else if (state.pointers.size === 2) {
      const points = Array.from(state.pointers.values());
      state.drag = null;
      state.pinch = {
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        midX: (points[0].x + points[1].x) / 2,
        midY: (points[0].y + points[1].y) / 2
      };
    }
    event.preventDefault();
  }

  function movePointer(event) {
    if (!state.pointers.has(event.pointerId)) return;
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (state.pinch && state.pointers.size >= 2) {
      const points = Array.from(state.pointers.values());
      const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
      const midX = (points[0].x + points[1].x) / 2;
      const midY = (points[0].y + points[1].y) / 2;
      const factor = distance / Math.max(1, state.pinch.distance);
      const rect = dom.stage.getBoundingClientRect();
      setScale(state.scale * clamp(factor, 0.7, 1.4), midX - rect.left, midY - rect.top);
      panBy(midX - state.pinch.midX, midY - state.pinch.midY);
      state.pinch.distance = distance;
      state.pinch.midX = midX;
      state.pinch.midY = midY;
      event.preventDefault();
      return;
    }

    if (state.drag && state.drag.id === event.pointerId) {
      const dx = event.clientX - state.drag.x;
      const dy = event.clientY - state.drag.y;
      state.drag.x = event.clientX;
      state.drag.y = event.clientY;
      panBy(dx, dy);
      event.preventDefault();
    }
  }

  function endPointer(event) {
    state.pointers.delete(event.pointerId);
    if (state.pointers.size < 2) state.pinch = null;
    if (state.drag && state.drag.id === event.pointerId) state.drag = null;
    if (state.pointers.size === 1) {
      const [id, point] = Array.from(state.pointers.entries())[0];
      state.drag = { id, x: point.x, y: point.y };
    }
    if (!state.drag && !state.pinch) dom.stage.classList.remove('is-dragging');
  }

  function beginResize(event) {
    if (state.lock || !state.image) return;
    event.preventDefault();
    event.stopPropagation();
    state.resizing = {
      id: event.pointerId,
      handle: event.currentTarget.dataset.handle
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    dom.dragHint.classList.add('is-hidden');
  }

  function moveResize(event) {
    if (!state.resizing || state.resizing.id !== event.pointerId) return;
    event.preventDefault();
    const rect = dom.stage.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const f = state.frame;
    const imageX = f.cx - state.centerX * state.scale;
    const imageY = f.cy - state.centerY * state.scale;
    const imageRight = imageX + state.imgW * state.scale;
    const imageBottom = imageY + state.imgH * state.scale;

    const maxW = 2 * Math.min(f.cx - 20, state.stageW - f.cx - 20, f.cx - imageX, imageRight - f.cx);
    const maxH = 2 * Math.min(f.cy - 20, state.stageH - f.cy - 20, f.cy - imageY, imageBottom - f.cy);
    const newW = clamp(Math.abs(px - f.cx) * 2, Math.min(120, maxW), Math.max(120, maxW));
    const newH = clamp(Math.abs(py - f.cy) * 2, Math.min(100, maxH), Math.max(100, maxH));

    f.w = newW;
    f.h = newH;
    state.scale = Math.max(state.scale, minScale());
    constrainCenter();
    requestRender();
  }

  function endResize(event) {
    if (!state.resizing || state.resizing.id !== event.pointerId) return;
    state.resizing = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function toggleLock() {
    state.lock = !state.lock;
    if (state.lock) {
      setDefaultFrame(aspect());
      state.scale = Math.max(state.scale, minScale());
      constrainCenter();
    }
    updateUI();
    requestRender();
  }

  function restoreRatio() {
    state.lock = true;
    setDefaultFrame(aspect());
    state.scale = Math.max(state.scale, minScale());
    constrainCenter();
    updateUI();
    requestRender();
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  /* ---------- export ---------- */

  function outputName(out) {
    const base = sanitizeName(state.isDemo ? 'FRAME_证件照' : state.fileName);
    const free = state.lock ? '' : '_自由';
    return `${base}_${out.w}x${out.h}${free}.${state.format === 'png' ? 'png' : 'jpg'}`;
  }

  function sanitizeName(name) {
    return String(name || '照片')
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/:*?"<>|\n\r\t]/g, '_')
      .trim()
      .slice(0, 36) || '照片';
  }

  async function embedJpegDpi(blob, dpi) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return blob;

    let offset = 2;
    while (offset + 4 < bytes.length && offset < 65535) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (length < 2) break;
      const isJfif = marker === 0xe0
        && length >= 16
        && bytes[offset + 4] === 0x4a
        && bytes[offset + 5] === 0x46
        && bytes[offset + 6] === 0x49
        && bytes[offset + 7] === 0x46;
      if (isJfif) {
        bytes[offset + 11] = 1; // density units: DPI
        bytes[offset + 12] = (dpi >> 8) & 0xff;
        bytes[offset + 13] = dpi & 0xff;
        bytes[offset + 14] = (dpi >> 8) & 0xff;
        bytes[offset + 15] = dpi & 0xff;
        return new Blob([bytes], { type: 'image/jpeg' });
      }
      offset += 2 + length;
    }
    return blob;
  }

  async function renderBlob(type = state.format === 'png' ? 'image/png' : 'image/jpeg') {
    if (!state.image) throw new Error('No image');

    const crop = getCropRect();
    const out = getOutputSize();
    const canvas = document.createElement('canvas');
    canvas.width = out.w;
    canvas.height = out.h;
    const c = canvas.getContext('2d', { alpha: type === 'image/png' });
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, out.w, out.h);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(state.image, crop.x, crop.y, crop.w, crop.h, 0, 0, out.w, out.h);

    const quality = state.quality / 100;
    let blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob) throw new Error('Export failed');
    if (type === 'image/jpeg') {
      blob = await embedJpegDpi(blob, state.dpi);
    }
    return { blob, out };
  }

  async function exportImage() {
    if (!state.image) {
      showToast('请先载入一张照片', true);
      return;
    }
    const main = dom.exportBtn.querySelector('.export-btn-main');
    const original = main.textContent;
    dom.exportBtn.disabled = true;
    main.textContent = '正在生成…';

    try {
      const { blob, out } = await renderBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = outputName(out);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 3000);
      showToast(`已导出 ${out.w} × ${out.h} px · ${state.dpi} DPI`);
    } catch (error) {
      console.error(error);
      showToast('导出失败，请换一张照片重试', true);
    } finally {
      main.textContent = original;
      dom.exportBtn.disabled = false;
    }
  }

  async function copyImage() {
    if (!state.image) {
      showToast('请先载入一张照片', true);
      return;
    }
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      showToast('当前浏览器不支持复制图片，请直接导出', true);
      return;
    }
    try {
      const { blob, out } = await renderBlob('image/png');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast(`已复制 ${out.w} × ${out.h} px 到剪贴板`);
    } catch (error) {
      console.error(error);
      showToast('复制失败，请使用「导出照片」', true);
    }
  }

  /* ---------- events ---------- */

  function bindEvents() {
    $('replaceBtn').addEventListener('click', () => dom.fileInput.click());
    $('emptyUpload').addEventListener('click', () => dom.fileInput.click());
    $('gridBtn').addEventListener('click', () => {
      state.grid = !state.grid;
      dom.gridBtn.setAttribute('aria-pressed', String(state.grid));
      requestRender();
    });

    dom.fileInput.addEventListener('change', (event) => {
      readFile(event.target.files && event.target.files[0]);
      dom.fileInput.value = '';
    });

    dom.lockSwitch.addEventListener('click', toggleLock);

    dom.anchorSeg.querySelectorAll('[data-anchor]').forEach((button) => {
      button.addEventListener('click', () => {
        state.anchor = button.dataset.anchor;
        updateUI();
        requestRender();
      });
    });

    $('restoreRatio').addEventListener('click', restoreRatio);

    dom.formatSeg.querySelectorAll('[data-format]').forEach((button) => {
      button.addEventListener('click', () => {
        state.format = button.dataset.format;
        updateUI();
      });
    });

    dom.qualityRange.addEventListener('input', () => {
      state.quality = Number(dom.qualityRange.value);
      dom.qualityValue.textContent = `${state.quality}%`;
      updateMetrics();
    });

    dom.exportBtn.addEventListener('click', exportImage);
    dom.copyBtn.addEventListener('click', copyImage);

    dom.zoomRange.addEventListener('input', () => {
      const percent = Number(dom.zoomRange.value);
      setScale(minScale() * (percent / 100));
    });
    $('zoomOut').addEventListener('click', () => zoomByStep(-10));
    $('zoomIn').addEventListener('click', () => zoomByStep(10));
    $('resetBtn').addEventListener('click', resetComposition);

    dom.stage.addEventListener('pointerdown', beginPointer);
    dom.stage.addEventListener('pointermove', movePointer);
    dom.stage.addEventListener('pointerup', endPointer);
    dom.stage.addEventListener('pointercancel', endPointer);

    dom.stage.addEventListener('wheel', (event) => {
      if (!state.image) return;
      event.preventDefault();
      const rect = dom.stage.getBoundingClientRect();
      const factor = clamp(Math.exp(-event.deltaY * 0.0015), 0.72, 1.38);
      setScale(state.scale * factor, event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });

    dom.cropUi.querySelectorAll('.crop-handle').forEach((handle) => {
      handle.addEventListener('pointerdown', beginResize);
      handle.addEventListener('pointermove', moveResize);
      handle.addEventListener('pointerup', endResize);
      handle.addEventListener('pointercancel', endResize);
    });

    $('applyCustom').addEventListener('click', applyCustomSize);
    [dom.customW, dom.customH].forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') applyCustomSize();
      });
    });

    $('allSizesBtn').addEventListener('click', () => openDialog(dom.guideDialog));
    $('guideBtn').addEventListener('click', () => openDialog(dom.guideDialog));
    $('closeGuide').addEventListener('click', () => closeDialog(dom.guideDialog));
    dom.guideDialog.addEventListener('click', (event) => {
      if (event.target === dom.guideDialog) closeDialog(dom.guideDialog);
    });

    // drag & drop
    ['dragenter', 'dragover'].forEach((type) => {
      dom.stage.addEventListener(type, (event) => {
        if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes('Files')) return;
        event.preventDefault();
        if (type === 'dragenter') dragDepth += 1;
        dom.stage.classList.add('is-dragover');
      });
    });
    dom.stage.addEventListener('dragleave', (event) => {
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) dom.stage.classList.remove('is-dragover');
    });
    dom.stage.addEventListener('drop', (event) => {
      event.preventDefault();
      dragDepth = 0;
      dom.stage.classList.remove('is-dragover');
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) readFile(file);
    });
    window.addEventListener('dragover', (event) => event.preventDefault());
    window.addEventListener('drop', (event) => {
      if (!dom.stage.contains(event.target)) event.preventDefault();
    });

    window.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        exportImage();
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(handleResize);
    });
    resizeObserver.observe(dom.stage);
    window.addEventListener('orientationchange', () => window.setTimeout(handleResize, 160));
  }

  function handleResize() {
    measureStage();
    if (state.stageW === state.lastStageW && state.stageH === state.lastStageH) return;
    const previousCrop = state.image ? getCropRect() : null;
    const previousRatio = state.frame.w && state.frame.h ? state.frame.w / state.frame.h : aspect();

    state.lastStageW = state.stageW;
    state.lastStageH = state.stageH;

    if (!state.image) {
      setDefaultFrame(aspect());
      syncCanvasSize();
      return;
    }

    setDefaultFrame(state.lock ? aspect() : previousRatio);
    if (previousCrop) {
      state.scale = Math.max(minScale(), state.frame.w / previousCrop.w, state.frame.h / previousCrop.h);
      constrainCenter();
    }
    updateUI();
    requestRender();
  }

  function boot() {
    renderPresets();
    renderSizeTable();
    bindEvents();
    measureStage();
    setDefaultFrame(aspect());
    updateUI();
    loadDemo();

    // A late font/layout settle keeps the frame in the optical center.
    window.setTimeout(() => {
      handleResize();
      requestRender();
    }, 260);
  }

  boot();
})();
