// Doodlshot Core Canvas Engine

const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
const textEditor = document.getElementById('text-editor-input');
const badgeDims = document.getElementById('badge-dims');
const badgeTool = document.getElementById('badge-tool');

let rc = null;
let baseImage = null;
let imageWidth = 800;
let imageHeight = 600;

// State
let annotations = [];
let history = [];
let activeTool = 'arrow';
let activeColor = '#ff3b30';
let activeWidth = 4.5;
let activeRoughness = 1.4;

let isDrawing = false;
let pointerDownPos = null;
let currentAnnotation = null;
let selectedAnnotation = null;
let activeHandle = null; // 'p0', 'p1', 'p2' for bendable arrow

// Tool names for badge
const toolLabels = {
  select: 'Select & Move',
  arrow: 'Bendable Arrow',
  oval: 'Hand-drawn Oval',
  rect: 'Hand-drawn Rectangle',
  cloud: 'Hand-drawn Cloud',
  pen: 'Freehand Pen',
  text: 'Hand-drawn Text',
  pixelate: 'Pixelate / Redact'
};

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  rc = rough.canvas(canvas);
  initUI();
  loadImage();
});

function initUI() {
  // Tool selector buttons
  const tools = ['select', 'arrow', 'oval', 'rect', 'cloud', 'pen', 'text', 'pixelate'];
  tools.forEach(t => {
    const btn = document.getElementById(`tool-${t}`);
    if (btn) {
      btn.addEventListener('click', () => setTool(t));
    }
  });

  // Color picker
  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      activeColor = dot.getAttribute('data-color');
      if (selectedAnnotation) {
        selectedAnnotation.color = activeColor;
        selectedAnnotation.drawable = null; // invalidate cached shape
        redraw();
      }
    });
  });

  // Stroke width
  const strokeButtons = [
    { id: 'stroke-thin', w: 2.5 },
    { id: 'stroke-medium', w: 4.5 },
    { id: 'stroke-thick', w: 7.0 }
  ];
  strokeButtons.forEach(s => {
    const btn = document.getElementById(s.id);
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        strokeButtons.forEach(b => document.getElementById(b.id).classList.remove('active'));
        btn.classList.add('active');
        activeWidth = s.w;
        if (selectedAnnotation) {
          selectedAnnotation.width = activeWidth;
          selectedAnnotation.drawable = null; // invalidate cached shape
          redraw();
        }
      });
    }
  });

  // Deselect when clicking outside the canvas (on background viewport)
  document.getElementById('canvas-viewport').addEventListener('mousedown', (e) => {
    if (e.target.id === 'canvas-viewport') {
      if (textEditor.style.display === 'block') {
        finalizeText();
      }
      if (selectedAnnotation) {
        selectedAnnotation = null;
        activeHandle = null;
        redraw();
      }
    }
  });

  // Action buttons
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-copy').addEventListener('click', copyToClipboard);
  document.getElementById('btn-save').addEventListener('click', saveToFile);

  // Keyboard shortcuts
  window.addEventListener('keydown', handleKeyDown);

  // Canvas mouse/pointer events
  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  // Inline text blur handler
  textEditor.addEventListener('blur', finalizeText);
  textEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      finalizeText();
    }
    if (e.key === 'Escape') {
      textEditor.value = '';
      textEditor.style.display = 'none';
      activeTextPos = null;
    }
  });
}

function setTool(tool) {
  activeTool = tool;
  document.querySelectorAll('.tool-btn').forEach(btn => {
    if (btn.id.startsWith('tool-')) btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`tool-${tool}`);
  if (activeBtn) activeBtn.classList.add('active');
  badgeTool.textContent = toolLabels[tool] || tool;

  // Clear selection so user is ready to draw fresh with current toolbar settings!
  selectedAnnotation = null;
  activeHandle = null;
  redraw();
}

function loadImage() {
  baseImage = new Image();
  baseImage.onload = () => {
    imageWidth = baseImage.naturalWidth || baseImage.width;
    imageHeight = baseImage.naturalHeight || baseImage.height;
    canvas.width = imageWidth;
    canvas.height = imageHeight;
    badgeDims.textContent = `${imageWidth} × ${imageHeight}`;
    redraw();
  };

  if (window.INITIAL_IMAGE_DATA) {
    baseImage.src = window.INITIAL_IMAGE_DATA;
  } else {
    createMockScreenshot();
  }
}

function createMockScreenshot() {
  const offscreen = document.createElement('canvas');
  offscreen.width = 960;
  offscreen.height = 600;
  const octx = offscreen.getContext('2d');

  const grad = octx.createLinearGradient(0, 0, 960, 600);
  grad.addColorStop(0, '#27272a');
  grad.addColorStop(1, '#09090b');
  octx.fillStyle = grad;
  octx.fillRect(0, 0, 960, 600);

  octx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  octx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  octx.lineWidth = 1;
  octx.roundRect(80, 80, 800, 440, 12);
  octx.fill();
  octx.stroke();

  const dots = ['#ff5f56', '#ffbd2e', '#27c93f'];
  dots.forEach((c, idx) => {
    octx.beginPath();
    octx.arc(110 + idx * 20, 110, 6, 0, Math.PI * 2);
    octx.fillStyle = c;
    octx.fill();
  });

  octx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  octx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  octx.fillText('Doodlshot Canvas Ready', 110, 190);
  octx.font = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  octx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  octx.fillText('• Click and drag to create bendable arrows', 110, 230);
  octx.fillText('• Pull the yellow center handle to curve any arrow', 110, 260);
  octx.fillText('• Try the hand-drawn ovals, rectangles, and text', 110, 290);
  octx.fillText('• Press Ctrl+C or Copy to send straight to clipboard', 110, 320);

  baseImage.src = offscreen.toDataURL('image/png');
}

// ----------------------------------------------------
// Pointer Interaction
// ----------------------------------------------------

function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function onPointerDown(e) {
  const pos = getCanvasPos(e);
  pointerDownPos = pos;

  // If text editor is open, commit existing text first!
  if (textEditor.style.display === 'block') {
    finalizeText();
    return;
  }

  // If clicking near a handle of the currently selected arrow
  if (selectedAnnotation && selectedAnnotation.type === 'arrow') {
    const handle = hitTestArrowHandles(selectedAnnotation, pos);
    if (handle) {
      activeHandle = handle;
      isDrawing = true;
      return;
    }
  }

  // If in select mode
  if (activeTool === 'select') {
    const hit = findAnnotationAt(pos);
    selectedAnnotation = hit;
    if (selectedAnnotation && selectedAnnotation.type === 'arrow') {
      const handle = hitTestArrowHandles(selectedAnnotation, pos);
      activeHandle = handle || 'drag';
    }
    redraw();
    isDrawing = true;
    return;
  }

  // Handle Text Tool
  if (activeTool === 'text') {
    spawnTextInput(pos.x, pos.y);
    return;
  }

  // If we already have something selected and user clicks somewhere else to draw:
  // We'll prepare drawing, but if it's just a click (dist < 6px), onPointerUp will deselect instead!
  isDrawing = true;
  saveHistoryState();
  const randSeed = Math.floor(Math.random() * 65536) + 1;

  if (activeTool === 'arrow') {
    currentAnnotation = {
      type: 'arrow',
      p0: { x: pos.x, y: pos.y },
      p1: { x: pos.x, y: pos.y },
      p2: { x: pos.x, y: pos.y },
      color: activeColor,
      width: activeWidth,
      roughness: activeRoughness,
      seed: randSeed,
      drawable: null
    };
  } else if (activeTool === 'oval') {
    currentAnnotation = {
      type: 'oval',
      startX: pos.x,
      startY: pos.y,
      cx: pos.x,
      cy: pos.y,
      rx: 0,
      ry: 0,
      color: activeColor,
      width: activeWidth,
      roughness: activeRoughness,
      seed: randSeed,
      drawable: null
    };
  } else if (activeTool === 'rect') {
    currentAnnotation = {
      type: 'rect',
      startX: pos.x,
      startY: pos.y,
      x: pos.x,
      y: pos.y,
      w: 0,
      h: 0,
      color: activeColor,
      width: activeWidth,
      roughness: activeRoughness,
      seed: randSeed,
      drawable: null
    };
  } else if (activeTool === 'cloud') {
    currentAnnotation = {
      type: 'cloud',
      startX: pos.x,
      startY: pos.y,
      x: pos.x,
      y: pos.y,
      w: 0,
      h: 0,
      color: activeColor,
      width: activeWidth,
      roughness: activeRoughness,
      seed: randSeed,
      drawable: null
    };
  } else if (activeTool === 'pen') {
    currentAnnotation = {
      type: 'pen',
      points: [{ x: pos.x, y: pos.y }],
      color: activeColor,
      width: activeWidth,
      roughness: activeRoughness,
      seed: randSeed,
      drawable: null
    };
  } else if (activeTool === 'pixelate') {
    currentAnnotation = {
      type: 'pixelate',
      startX: pos.x,
      startY: pos.y,
      x: pos.x,
      y: pos.y,
      w: 0,
      h: 0,
      blockSize: 10
    };
  }
}

function onPointerMove(e) {
  if (!isDrawing) return;
  const pos = getCanvasPos(e);

  // Moving handle of selected arrow
  if (selectedAnnotation && selectedAnnotation.type === 'arrow' && activeHandle) {
    if (activeHandle === 'p0') {
      selectedAnnotation.p0 = { x: pos.x, y: pos.y };
    } else if (activeHandle === 'p1') {
      selectedAnnotation.p1 = { x: pos.x, y: pos.y };
    } else if (activeHandle === 'p2') {
      selectedAnnotation.p2 = { x: pos.x, y: pos.y };
    }
    selectedAnnotation.drawable = null; // Regenerate this arrow's path
    redraw();
    return;
  }

  if (!currentAnnotation) return;

  if (currentAnnotation.type === 'arrow') {
    currentAnnotation.p2 = { x: pos.x, y: pos.y };
    currentAnnotation.p1 = {
      x: (currentAnnotation.p0.x + currentAnnotation.p2.x) / 2,
      y: (currentAnnotation.p0.y + currentAnnotation.p2.y) / 2
    };
    currentAnnotation.drawable = null;
  } else if (currentAnnotation.type === 'oval') {
    currentAnnotation.cx = (currentAnnotation.startX + pos.x) / 2;
    currentAnnotation.cy = (currentAnnotation.startY + pos.y) / 2;
    currentAnnotation.rx = Math.abs(pos.x - currentAnnotation.startX) / 2;
    currentAnnotation.ry = Math.abs(pos.y - currentAnnotation.startY) / 2;
    currentAnnotation.drawable = null;
  } else if (currentAnnotation.type === 'rect' || currentAnnotation.type === 'cloud' || currentAnnotation.type === 'pixelate') {
    currentAnnotation.x = Math.min(currentAnnotation.startX, pos.x);
    currentAnnotation.y = Math.min(currentAnnotation.startY, pos.y);
    currentAnnotation.w = Math.abs(pos.x - currentAnnotation.startX);
    currentAnnotation.h = Math.abs(pos.y - currentAnnotation.startY);
    currentAnnotation.drawable = null;
  } else if (currentAnnotation.type === 'pen') {
    currentAnnotation.points.push({ x: pos.x, y: pos.y });
    currentAnnotation.drawable = null;
  }

  redraw();
}

function onPointerUp(e) {
  if (!isDrawing) return;
  isDrawing = false;
  const pos = getCanvasPos(e);

  // Check if this was a simple click (not a drag)
  const clickDist = pointerDownPos ? Math.hypot(pos.x - pointerDownPos.x, pos.y - pointerDownPos.y) : 0;

  if (activeHandle) {
    activeHandle = null;
    redraw();
    return;
  }

  // If user simply clicked on empty space without dragging:
  // DESELECT any currently selected item!
  if (clickDist < 6) {
    currentAnnotation = null;
    if (selectedAnnotation) {
      selectedAnnotation = null;
      activeHandle = null;
      redraw();
      return;
    }
  }

  if (currentAnnotation) {
    if (currentAnnotation.type === 'arrow') {
      const dx = currentAnnotation.p2.x - currentAnnotation.p0.x;
      const dy = currentAnnotation.p2.y - currentAnnotation.p0.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 15) {
        // Subtle offset perpendicular to line for an organic curve
        const perpX = -dy / dist * (dist * 0.12);
        const perpY = dx / dist * (dist * 0.12);
        currentAnnotation.p1.x += perpX;
        currentAnnotation.p1.y += perpY;
        currentAnnotation.drawable = null; // generate once
        annotations.push(currentAnnotation);
        selectedAnnotation = currentAnnotation;
      }
    } else {
      annotations.push(currentAnnotation);
      selectedAnnotation = currentAnnotation;
    }
    currentAnnotation = null;
    redraw();
  }
}

// ----------------------------------------------------
// Cached Vector Geometry Engine (0% Shimmering)
// ----------------------------------------------------

function getCachedDrawable(a) {
  if (a.drawable) return a.drawable;

  const gen = rc.generator;
  const seed = a.seed || 42;
  let d = null;

  if (a.type === 'arrow') {
    const curvePath = `M ${a.p0.x} ${a.p0.y} Q ${a.p1.x} ${a.p1.y} ${a.p2.x} ${a.p2.y}`;
    const curveD = gen.path(curvePath, {
      stroke: a.color,
      strokeWidth: a.width,
      roughness: a.roughness,
      bowing: 1.2,
      seed: seed
    });

    const tx = a.p2.x - a.p1.x;
    const ty = a.p2.y - a.p1.y;
    const angle = Math.atan2(ty, tx);
    const headLen = Math.max(16, a.width * 4.2);
    const headAngle = 0.52;

    const w1x = a.p2.x - headLen * Math.cos(angle - headAngle);
    const w1y = a.p2.y - headLen * Math.sin(angle - headAngle);
    const w2x = a.p2.x - headLen * Math.cos(angle + headAngle);
    const w2y = a.p2.y - headLen * Math.sin(angle + headAngle);

    const headD = gen.linearPath([[w1x, w1y], [a.p2.x, a.p2.y], [w2x, w2y]], {
      stroke: a.color,
      strokeWidth: a.width,
      roughness: a.roughness,
      seed: seed + 7
    });

    d = [curveD, headD];
  } else if (a.type === 'oval') {
    if (a.rx > 2 && a.ry > 2) {
      d = gen.ellipse(a.cx, a.cy, a.rx * 2, a.ry * 2, {
        stroke: a.color,
        strokeWidth: a.width,
        roughness: a.roughness,
        bowing: 1.5,
        seed: seed
      });
    }
  } else if (a.type === 'rect') {
    if (a.w > 2 && a.h > 2) {
      d = gen.rectangle(a.x, a.y, a.w, a.h, {
        stroke: a.color,
        strokeWidth: a.width,
        roughness: a.roughness,
        bowing: 1.2,
        seed: seed
      });
    }
  } else if (a.type === 'cloud') {
    if (a.w > 10 && a.h > 10) {
      const cx = a.x + a.w / 2;
      const cy = a.y + a.h / 2;
      const rx = a.w / 2;
      const ry = a.h / 2;
      const points = [];
      const count = 10;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const bump = (i % 2 === 0) ? 1.15 : 0.95;
        points.push([
          cx + Math.cos(angle) * rx * bump,
          cy + Math.sin(angle) * ry * bump
        ]);
      }
      points.push(points[0]);
      d = gen.curve(points, {
        stroke: a.color,
        strokeWidth: a.width,
        roughness: a.roughness + 0.3,
        bowing: 2.0,
        seed: seed
      });
    }
  } else if (a.type === 'pen') {
    if (a.points.length > 1) {
      d = gen.curve(a.points.map(p => [p.x, p.y]), {
        stroke: a.color,
        strokeWidth: a.width,
        roughness: 0.8,
        seed: seed
      });
    }
  }

  a.drawable = d;
  return d;
}

function redraw(includeHandles = true) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (baseImage) {
    ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
  }

  // Draw pixelations first
  annotations.filter(a => a.type === 'pixelate').forEach(a => renderPixelate(a));

  // Draw static, cached vector annotations
  annotations.filter(a => a.type !== 'pixelate').forEach(a => renderAnnotation(a));

  // Draw active drawing shape
  if (currentAnnotation && isDrawing) {
    if (currentAnnotation.type === 'pixelate') {
      renderPixelate(currentAnnotation);
    } else {
      renderAnnotation(currentAnnotation);
    }
  }

  // Draw selection handles for the selected arrow
  if (includeHandles && selectedAnnotation && selectedAnnotation.type === 'arrow') {
    renderArrowHandles(selectedAnnotation);
  }
}

function renderAnnotation(a) {
  if (a.type === 'text') {
    renderText(a);
    return;
  }
  const d = getCachedDrawable(a);
  if (!d) return;

  if (Array.isArray(d)) {
    d.forEach(sub => rc.draw(sub));
  } else {
    rc.draw(d);
  }
}

function renderText(a) {
  ctx.save();
  ctx.font = `600 ${a.fontSize || 28}px 'Shantell Sans', cursive, sans-serif`;
  ctx.fillStyle = a.color;
  ctx.textBaseline = 'top';

  const lines = a.text.split('\n');
  const lineHeight = (a.fontSize || 28) * 1.25;
  lines.forEach((line, idx) => {
    ctx.fillText(line, a.x, a.y + idx * lineHeight);
  });
  ctx.restore();
}

function renderPixelate(a) {
  if (a.w < 4 || a.h < 4) return;
  const bs = a.blockSize || 12;

  const sx = Math.floor(a.x);
  const sy = Math.floor(a.y);
  const sw = Math.floor(a.w);
  const sh = Math.floor(a.h);

  try {
    const imgData = ctx.getImageData(sx, sy, sw, sh);
    const data = imgData.data;

    for (let py = 0; py < sh; py += bs) {
      for (let px = 0; px < sw; px += bs) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let by = 0; by < bs && py + by < sh; by++) {
          for (let bx = 0; bx < bs && px + bx < sw; bx++) {
            const idx = ((py + by) * sw + (px + bx)) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
          }
        }
        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(sx + px, sy + py, Math.min(bs, sw - px), Math.min(bs, sh - py));
      }
    }
  } catch (e) {
    console.error("Pixelate error:", e);
  }
}

// Interactive Handles for Bendable Arrow
function renderArrowHandles(a) {
  const handles = [
    { p: a.p0, color: '#007aff', label: 'start' },
    { p: a.p1, color: '#ffcc00', label: 'bend' },
    { p: a.p2, color: '#ff3b30', label: 'tip' }
  ];

  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(a.p0.x, a.p0.y);
  ctx.lineTo(a.p1.x, a.p1.y);
  ctx.lineTo(a.p2.x, a.p2.y);
  ctx.stroke();

  handles.forEach(h => {
    ctx.beginPath();
    ctx.arc(h.p.x, h.p.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = h.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  });
  ctx.restore();
}

function hitTestArrowHandles(a, pos) {
  const radius = 16;
  if (Math.hypot(pos.x - a.p1.x, pos.y - a.p1.y) < radius) return 'p1';
  if (Math.hypot(pos.x - a.p0.x, pos.y - a.p0.y) < radius) return 'p0';
  if (Math.hypot(pos.x - a.p2.x, pos.y - a.p2.y) < radius) return 'p2';
  return null;
}

function findAnnotationAt(pos) {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const a = annotations[i];
    if (a.type === 'arrow') {
      if (hitTestArrowHandles(a, pos)) return a;
      const mid = a.p1;
      if (Math.hypot(pos.x - mid.x, pos.y - mid.y) < 30) return a;
    } else if (a.type === 'oval') {
      const dx = (pos.x - a.cx) / a.rx;
      const dy = (pos.y - a.cy) / a.ry;
      if (Math.abs(dx * dx + dy * dy - 1) < 0.35) return a;
    } else if (a.type === 'rect') {
      if (pos.x >= a.x - 5 && pos.x <= a.x + a.w + 5 &&
          pos.y >= a.y - 5 && pos.y <= a.y + a.h + 5) return a;
    }
  }
  return null;
}

// ----------------------------------------------------
// Inline Text Input
// ----------------------------------------------------

let activeTextPos = null;

function spawnTextInput(x, y) {
  if (textEditor.style.display === 'block') {
    finalizeText();
  }
  activeTextPos = { x, y };
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / canvas.width;

  textEditor.style.left = `${x * scale}px`;
  textEditor.style.top = `${y * scale}px`;
  textEditor.style.fontSize = `${28 * scale}px`;
  textEditor.style.color = activeColor;
  textEditor.style.display = 'block';
  textEditor.value = '';
  setTimeout(() => textEditor.focus(), 10);
}

function finalizeText() {
  if (textEditor.style.display !== 'block') return;
  const val = textEditor.value.trim();
  textEditor.style.display = 'none';

  if (val && activeTextPos) {
    saveHistoryState();
    const newAnno = {
      type: 'text',
      x: activeTextPos.x,
      y: activeTextPos.y,
      text: val,
      color: activeColor,
      fontSize: 28,
      seed: Math.floor(Math.random() * 65536) + 1
    };
    annotations.push(newAnno);
    selectedAnnotation = newAnno;
    redraw();
    setTool('select');
  }
  activeTextPos = null;
  textEditor.value = '';
}

// ----------------------------------------------------
// History / Undo
// ----------------------------------------------------

function saveHistoryState() {
  // Deep clone annotations without cached dom/canvas objects
  const snapshot = annotations.map(a => {
    const copy = Object.assign({}, a);
    copy.drawable = null;
    return copy;
  });
  history.push(snapshot);
  if (history.length > 30) history.shift();
}

function undo() {
  if (history.length > 0) {
    annotations = history.pop();
    selectedAnnotation = null;
    redraw();
  }
}

// ----------------------------------------------------
// Export & Clipboard
// ----------------------------------------------------

function copyToClipboard() {
  redraw(false);
  const dataUrl = canvas.toDataURL('image/png');
  redraw(true);

  sendToBackend('copy', dataUrl);
}

function saveToFile() {
  redraw(false);
  const dataUrl = canvas.toDataURL('image/png');
  redraw(true);

  sendToBackend('save', dataUrl);
}

function sendToBackend(action, data) {
  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.doodlshot) {
    window.webkit.messageHandlers.doodlshot.postMessage({ action, data });
  } else {
    if (action === 'copy') {
      canvas.toBlob(blob => {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        alert('Copied image to clipboard!');
      });
    }
  }
}

// ----------------------------------------------------
// Keyboard Shortcuts
// ----------------------------------------------------

function handleKeyDown(e) {
  if (textEditor.style.display === 'block') return;

  if (e.ctrlKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
  } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    copyToClipboard();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    copyToClipboard();
  } else if (e.ctrlKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveToFile();
  } else if (e.key === 'Escape') {
    // If an annotation is selected, deselect it first!
    if (selectedAnnotation) {
      selectedAnnotation = null;
      activeHandle = null;
      redraw();
      return;
    }
    sendToBackend('exit', null);
  } else if (e.key.toLowerCase() === 'a') {
    setTool('arrow');
  } else if (e.key.toLowerCase() === 'o') {
    setTool('oval');
  } else if (e.key.toLowerCase() === 'r') {
    setTool('rect');
  } else if (e.key.toLowerCase() === 'c' && !e.ctrlKey) {
    setTool('cloud');
  } else if (e.key.toLowerCase() === 't') {
    setTool('text');
  } else if (e.key.toLowerCase() === 'p') {
    setTool('pen');
  } else if (e.key.toLowerCase() === 'x') {
    setTool('pixelate');
  } else if (e.key.toLowerCase() === 'v') {
    setTool('select');
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedAnnotation) {
      saveHistoryState();
      annotations = annotations.filter(a => a !== selectedAnnotation);
      selectedAnnotation = null;
      redraw();
    }
  }
}
