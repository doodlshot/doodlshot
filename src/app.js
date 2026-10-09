// Doodlshot Core Canvas Engine - Feature Complete & Refined

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
let activeColor = '#ff453a'; // Apple Coral Red default
let activeWidth = 4.5;
let activeRoughness = 1.2;
let stepCounter = 1;

let isDrawing = false;
let isMoving = false;
let moveOffset = { x: 0, y: 0 };
let pointerDownPos = null;
let currentAnnotation = null;
let selectedAnnotation = null;
let activeHandle = null; // 'p0', 'p1', 'p2' for bendable arrow

// Double click tracker
let lastClickTime = 0;
let lastClickPos = null;

// Tool names for badge
const toolLabels = {
  select: 'Select & Move',
  arrow: 'Bendable Arrow',
  oval: 'Hand-drawn Oval',
  rect: 'Hand-drawn Rectangle',
  cloud: 'Puffy Cloud',
  step: 'Step Badge (1, 2, 3...)',
  highlighter: 'Highlighter',
  magnifier: 'Magnifier Loupe',
  pen: 'Freehand Pen',
  text: 'Hand-drawn Text',
  pixelate: 'Pixelate / Redact',
  crop: 'Crop Canvas'
};

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  rc = rough.canvas(canvas);
  initUI();
  loadImage();
});

function initUI() {
  const tools = ['select', 'arrow', 'oval', 'rect', 'cloud', 'step', 'highlighter', 'magnifier', 'pen', 'text', 'pixelate', 'crop'];
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
        selectedAnnotation.drawable = null;
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
          selectedAnnotation.drawable = null;
          redraw();
        }
      });
    }
  });

  // Deselect when clicking outside the canvas
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

  octx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  octx.font = 'bold 24px "Noteworthy", -apple-system, sans-serif';
  octx.fillText('Doodlshot Canvas Ready', 110, 190);
  octx.font = '16px -apple-system, sans-serif';
  octx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  octx.fillText('• Crisp, sharp hand-drawn arrows with smooth curve physics', 110, 230);
  octx.fillText('• Authentic Noteworthy-Bold typography matching Shottr', 110, 260);
  octx.fillText('• Puffy callout clouds, numbered step badges, and magnifier loupe', 110, 290);
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
  const now = Date.now();

  // Commit text if typing
  if (textEditor.style.display === 'block') {
    finalizeText();
    return;
  }

  // Double Click Check -> Edit Existing Text
  if (now - lastClickTime < 350 && lastClickPos && Math.hypot(pos.x - lastClickPos.x, pos.y - lastClickPos.y) < 15) {
    const hitText = annotations.find(a => a.type === 'text' && Math.hypot(pos.x - a.x, pos.y - a.y) < 40);
    if (hitText) {
      editExistingText(hitText);
      return;
    }
  }
  lastClickTime = now;
  lastClickPos = pos;

  // If clicking near a handle of selected arrow
  if (selectedAnnotation && selectedAnnotation.type === 'arrow') {
    const handle = hitTestArrowHandles(selectedAnnotation, pos);
    if (handle) {
      activeHandle = handle;
      isDrawing = true;
      return;
    }
  }

  // Select / Move Tool
  if (activeTool === 'select') {
    const hit = findAnnotationAt(pos);
    selectedAnnotation = hit;
    if (selectedAnnotation) {
      if (selectedAnnotation.type === 'arrow') {
        const handle = hitTestArrowHandles(selectedAnnotation, pos);
        if (handle) {
          activeHandle = handle;
        } else {
          isMoving = true;
          moveOffset = { x: pos.x - selectedAnnotation.p0.x, y: pos.y - selectedAnnotation.p0.y };
        }
      } else {
        isMoving = true;
        moveOffset = { x: pos.x - (selectedAnnotation.x || selectedAnnotation.cx || 0), y: pos.y - (selectedAnnotation.y || selectedAnnotation.cy || 0) };
      }
    }
    redraw();
    isDrawing = true;
    return;
  }

  // Step Badge (1, 2, 3...)
  if (activeTool === 'step') {
    saveHistoryState();
    const badge = {
      type: 'step',
      x: pos.x,
      y: pos.y,
      number: stepCounter++,
      color: activeColor,
      radius: 16
    };
    annotations.push(badge);
    selectedAnnotation = badge;
    redraw();
    return;
  }

  // Text Tool
  if (activeTool === 'text') {
    spawnTextInput(pos.x, pos.y);
    return;
  }

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
  } else if (activeTool === 'highlighter') {
    currentAnnotation = {
      type: 'highlighter',
      startX: pos.x,
      startY: pos.y,
      x: pos.x,
      y: pos.y,
      w: 0,
      h: 0,
      color: activeColor
    };
  } else if (activeTool === 'magnifier') {
    currentAnnotation = {
      type: 'magnifier',
      sourceX: pos.x,
      sourceY: pos.y,
      x: pos.x,
      y: pos.y,
      radius: 55,
      zoom: 2.2,
      color: activeColor
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
      blockSize: 12
    };
  } else if (activeTool === 'crop') {
    currentAnnotation = {
      type: 'crop',
      startX: pos.x,
      startY: pos.y,
      x: pos.x,
      y: pos.y,
      w: 0,
      h: 0
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
    selectedAnnotation.drawable = null;
    redraw();
    return;
  }

  // Moving entire annotation
  if (isMoving && selectedAnnotation) {
    if (selectedAnnotation.type === 'arrow') {
      const dx = pos.x - selectedAnnotation.p0.x - moveOffset.x;
      const dy = pos.y - selectedAnnotation.p0.y - moveOffset.y;
      selectedAnnotation.p0.x += dx;
      selectedAnnotation.p0.y += dy;
      selectedAnnotation.p1.x += dx;
      selectedAnnotation.p1.y += dy;
      selectedAnnotation.p2.x += dx;
      selectedAnnotation.p2.y += dy;
    } else if (selectedAnnotation.x !== undefined) {
      selectedAnnotation.x = pos.x - moveOffset.x;
      selectedAnnotation.y = pos.y - moveOffset.y;
    } else if (selectedAnnotation.cx !== undefined) {
      selectedAnnotation.cx = pos.x - moveOffset.x;
      selectedAnnotation.cy = pos.y - moveOffset.y;
    }
    selectedAnnotation.drawable = null;
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
  } else if (currentAnnotation.type === 'rect' || currentAnnotation.type === 'cloud' || currentAnnotation.type === 'pixelate' || currentAnnotation.type === 'highlighter' || currentAnnotation.type === 'crop') {
    currentAnnotation.x = Math.min(currentAnnotation.startX, pos.x);
    currentAnnotation.y = Math.min(currentAnnotation.startY, pos.y);
    currentAnnotation.w = Math.abs(pos.x - currentAnnotation.startX);
    currentAnnotation.h = Math.abs(pos.y - currentAnnotation.startY);
    currentAnnotation.drawable = null;
  } else if (currentAnnotation.type === 'magnifier') {
    currentAnnotation.x = pos.x;
    currentAnnotation.y = pos.y;
    const dist = Math.hypot(pos.x - currentAnnotation.sourceX, pos.y - currentAnnotation.sourceY);
    currentAnnotation.radius = Math.max(50, Math.min(120, dist * 0.6));
  } else if (currentAnnotation.type === 'pen') {
    currentAnnotation.points.push({ x: pos.x, y: pos.y });
    currentAnnotation.drawable = null;
  }

  redraw();
}

function onPointerUp(e) {
  if (!isDrawing) return;
  isDrawing = false;
  isMoving = false;
  const pos = getCanvasPos(e);

  const clickDist = pointerDownPos ? Math.hypot(pos.x - pointerDownPos.x, pos.y - pointerDownPos.y) : 0;

  if (activeHandle) {
    activeHandle = null;
    redraw();
    return;
  }

  // Simple click deselects
  if (clickDist < 6) {
    currentAnnotation = null;
    if (selectedAnnotation) {
      selectedAnnotation = null;
      activeHandle = null;
      redraw();
      return;
    }
  }

  // Crop execution
  if (currentAnnotation && currentAnnotation.type === 'crop') {
    if (currentAnnotation.w > 20 && currentAnnotation.h > 20) {
      applyCrop(currentAnnotation.x, currentAnnotation.y, currentAnnotation.w, currentAnnotation.h);
    }
    currentAnnotation = null;
    setTool('select');
    return;
  }

  if (currentAnnotation) {
    if (currentAnnotation.type === 'arrow') {
      const dx = currentAnnotation.p2.x - currentAnnotation.p0.x;
      const dy = currentAnnotation.p2.y - currentAnnotation.p0.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 15) {
        const perpX = -dy / dist * (dist * 0.12);
        const perpY = dx / dist * (dist * 0.12);
        currentAnnotation.p1.x += perpX;
        currentAnnotation.p1.y += perpY;
        currentAnnotation.drawable = null;
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
// Rendering Engine (Shottr Pixel-Exact Style)
// ----------------------------------------------------

function redraw(includeHandles = true) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (baseImage) {
    ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
  }

  // 1. Pixelations first (bottom layer)
  annotations.filter(a => a.type === 'pixelate').forEach(a => renderPixelate(a));

  // 2. Highlighters (semi-transparent layer)
  annotations.filter(a => a.type === 'highlighter').forEach(a => renderHighlighter(a));

  // 3. Vector annotations
  annotations.filter(a => a.type !== 'pixelate' && a.type !== 'highlighter' && a.type !== 'magnifier').forEach(a => renderAnnotation(a));

  // 4. Magnifiers (top layer with lens zoom)
  annotations.filter(a => a.type === 'magnifier').forEach(a => renderMagnifier(a));

  // Active drawing
  if (currentAnnotation && isDrawing) {
    if (currentAnnotation.type === 'pixelate') {
      renderPixelate(currentAnnotation);
    } else if (currentAnnotation.type === 'highlighter') {
      renderHighlighter(currentAnnotation);
    } else if (currentAnnotation.type === 'magnifier') {
      renderMagnifier(currentAnnotation);
    } else if (currentAnnotation.type === 'crop') {
      renderCropOverlay(currentAnnotation);
    } else {
      renderAnnotation(currentAnnotation);
    }
  }

  // Arrow selection handles
  if (includeHandles && selectedAnnotation && selectedAnnotation.type === 'arrow') {
    renderArrowHandles(selectedAnnotation);
  }
}

function renderAnnotation(a) {
  if (a.type === 'arrow') {
    renderShottrArrow(a);
  } else if (a.type === 'text') {
    renderText(a);
  } else if (a.type === 'step') {
    renderStepBadge(a);
  } else {
    // Cached Rough.js shapes
    const d = getCachedDrawable(a);
    if (!d) return;
    if (Array.isArray(d)) {
      d.forEach(sub => rc.draw(sub));
    } else {
      rc.draw(d);
    }
  }
}

// 🏹 Shottr's Signature Smooth Arrow with Sharp Connected Chevron Head
function renderShottrArrow(a) {
  const { p0, p1, p2, color, width } = a;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1. Draw smooth Quadratic Bézier curve
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
  ctx.stroke();

  // 2. Tangent vector at arrow tip p2
  const tx = p2.x - p1.x;
  const ty = p2.y - p1.y;
  const angle = Math.atan2(ty, tx);

  // Sharp, elegant chevron wings
  const headLen = Math.max(14, width * 3.5);
  const wingAngle = 0.46; // ~26.5 degrees (sleek & sharp!)

  const w1x = p2.x - headLen * Math.cos(angle - wingAngle);
  const w1y = p2.y - headLen * Math.sin(angle - wingAngle);
  const w2x = p2.x - headLen * Math.cos(angle + wingAngle);
  const w2y = p2.y - headLen * Math.sin(angle + wingAngle);

  // Connected crisp chevron
  ctx.beginPath();
  ctx.moveTo(w1x, w1y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(w2x, w2y);
  ctx.stroke();

  ctx.restore();
}

// ☁️ True Cartoon Puffy Callout Cloud Path
function generateCloudPath(x, y, w, h) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;

  // 10 puffy rounded arcs around perimeter
  const numArcs = 10;
  const points = [];
  for (let i = 0; i <= numArcs; i++) {
    const th = (i / numArcs) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(th) * rx,
      y: cy + Math.sin(th) * ry
    });
  }

  let d = `M ${points[0].x} ${points[0].y} `;
  for (let i = 0; i < numArcs; i++) {
    const pA = points[i];
    const pB = points[i + 1];
    const midTh = ((i + 0.5) / numArcs) * Math.PI * 2;
    // Puff outward
    const cpX = cx + Math.cos(midTh) * (rx * 1.25);
    const cpY = cy + Math.sin(midTh) * (ry * 1.25);
    d += `Q ${cpX} ${cpY} ${pB.x} ${pB.y} `;
  }
  return d + "Z";
}

function getCachedDrawable(a) {
  if (a.drawable) return a.drawable;

  const gen = rc.generator;
  const seed = a.seed || 42;
  let d = null;

  if (a.type === 'oval') {
    if (a.rx > 2 && a.ry > 2) {
      d = gen.ellipse(a.cx, a.cy, a.rx * 2, a.ry * 2, {
        stroke: a.color,
        strokeWidth: a.width,
        roughness: 1.4,
        bowing: 1.5,
        seed: seed
      });
    }
  } else if (a.type === 'rect') {
    if (a.w > 2 && a.h > 2) {
      d = gen.rectangle(a.x, a.y, a.w, a.h, {
        stroke: a.color,
        strokeWidth: a.width,
        roughness: 1.3,
        bowing: 1.2,
        seed: seed
      });
    }
  } else if (a.type === 'cloud') {
    if (a.w > 15 && a.h > 15) {
      const pathD = generateCloudPath(a.x, a.y, a.w, a.h);
      d = gen.path(pathD, {
        stroke: a.color,
        strokeWidth: a.width,
        roughness: 1.1,
        bowing: 1.2,
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

// 🔤 Noteworthy-Bold Typography Matching Shottr
function renderText(a) {
  ctx.save();
  ctx.font = `bold ${a.fontSize || 32}px 'Noteworthy', -apple-system, sans-serif`;
  ctx.fillStyle = a.color;
  ctx.textBaseline = 'top';

  const lines = a.text.split('\n');
  const lineHeight = (a.fontSize || 32) * 1.2;
  lines.forEach((line, idx) => {
    ctx.fillText(line, a.x, a.y + idx * lineHeight);
  });
  ctx.restore();
}

// ① Numbered Step Counter Badge
function renderStepBadge(a) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  // Solid badge circle
  ctx.beginPath();
  ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2);
  ctx.fillStyle = a.color;
  ctx.fill();

  // Border ring
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Number text
  ctx.shadowColor = 'transparent';
  ctx.font = 'bold 16px -apple-system, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${a.number}`, a.x, a.y + 0.5);

  ctx.restore();
}

// 🖍️ Semi-transparent Highlighter
function renderHighlighter(a) {
  if (a.w < 2 || a.h < 2) return;
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.fillStyle = a.color;
  ctx.roundRect(a.x, a.y, a.w, a.h, 4);
  ctx.fill();
  ctx.restore();
}

// 🔍 Magnifier Loupe Tool
function renderMagnifier(a) {
  if (!baseImage) return;
  ctx.save();

  const { x, y, sourceX, sourceY, radius, zoom, color } = a;

  // Callout pointer line from source to lens
  ctx.beginPath();
  ctx.moveTo(sourceX, sourceY);
  ctx.lineTo(x, y);
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Small source indicator dot
  ctx.beginPath();
  ctx.arc(sourceX, sourceY, 5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Circular clip for magnifier lens
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.save();
  ctx.clip();

  // Draw magnified image portion
  const sw = (radius * 2) / zoom;
  const sh = (radius * 2) / zoom;
  const sx = sourceX - sw / 2;
  const sy = sourceY - sh / 2;

  ctx.imageSmoothingEnabled = false; // Nearest-neighbor pixelated zoom like Shottr!
  ctx.drawImage(baseImage, sx, sy, sw, sh, x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();

  // Outer lens ring & shadow
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 12;
  ctx.stroke();

  ctx.restore();
}

// ✂️ Crop Tool Preview
function renderCropOverlay(a) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.clearRect(a.x, a.y, a.w, a.h);
  ctx.drawImage(baseImage, a.x, a.y, a.w, a.h, a.x, a.y, a.w, a.h);

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffffff';
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(a.x, a.y, a.w, a.h);
  ctx.restore();
}

function applyCrop(x, y, w, h) {
  saveHistoryState();
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const octx = offscreen.getContext('2d');
  octx.drawImage(baseImage, x, y, w, h, 0, 0, w, h);

  baseImage = new Image();
  baseImage.onload = () => {
    imageWidth = w;
    imageHeight = h;
    canvas.width = w;
    canvas.height = h;
    badgeDims.textContent = `${w} × ${h}`;

    // Adjust existing annotations relative to crop origin
    annotations.forEach(a => {
      if (a.p0) {
        a.p0.x -= x; a.p0.y -= y;
        a.p1.x -= x; a.p1.y -= y;
        a.p2.x -= x; a.p2.y -= y;
      }
      if (a.x !== undefined) { a.x -= x; a.y -= y; }
      if (a.cx !== undefined) { a.cx -= x; a.cy -= y; }
      a.drawable = null;
    });

    redraw();
  };
  baseImage.src = offscreen.toDataURL('image/png');
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
    { p: a.p0, color: '#0a84ff', label: 'start' },
    { p: a.p1, color: '#f5a623', label: 'bend' },
    { p: a.p2, color: '#ff453a', label: 'tip' }
  ];

  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
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
      if (Math.hypot(pos.x - a.p1.x, pos.y - a.p1.y) < 30) return a;
    } else if (a.type === 'step') {
      if (Math.hypot(pos.x - a.x, pos.y - a.y) < a.radius + 5) return a;
    } else if (a.type === 'text') {
      if (Math.hypot(pos.x - a.x, pos.y - a.y) < 35) return a;
    } else if (a.type === 'oval') {
      const dx = (pos.x - a.cx) / a.rx;
      const dy = (pos.y - a.cy) / a.ry;
      if (Math.abs(dx * dx + dy * dy - 1) < 0.4) return a;
    } else if (a.type === 'rect' || a.type === 'cloud' || a.type === 'highlighter') {
      if (pos.x >= a.x - 5 && pos.x <= a.x + a.w + 5 &&
          pos.y >= a.y - 5 && pos.y <= a.y + a.h + 5) return a;
    } else if (a.type === 'magnifier') {
      if (Math.hypot(pos.x - a.x, pos.y - a.y) < a.radius + 5) return a;
    }
  }
  return null;
}

// ----------------------------------------------------
// Inline Text Input & Double Click Editing
// ----------------------------------------------------

let activeTextPos = null;
let editingAnnotation = null;

function spawnTextInput(x, y) {
  if (textEditor.style.display === 'block') {
    finalizeText();
  }
  activeTextPos = { x, y };
  editingAnnotation = null;
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / canvas.width;

  textEditor.style.left = `${x * scale}px`;
  textEditor.style.top = `${y * scale}px`;
  textEditor.style.fontSize = `${32 * scale}px`;
  textEditor.style.color = activeColor;
  textEditor.style.display = 'block';
  textEditor.value = '';
  setTimeout(() => textEditor.focus(), 10);
}

function editExistingText(anno) {
  editingAnnotation = anno;
  activeTextPos = { x: anno.x, y: anno.y };
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / canvas.width;

  textEditor.style.left = `${anno.x * scale}px`;
  textEditor.style.top = `${anno.y * scale}px`;
  textEditor.style.fontSize = `${(anno.fontSize || 32) * scale}px`;
  textEditor.style.color = anno.color;
  textEditor.style.display = 'block';
  textEditor.value = anno.text;
  setTimeout(() => textEditor.focus(), 10);
}

function finalizeText() {
  if (textEditor.style.display !== 'block') return;
  const val = textEditor.value.trim();
  textEditor.style.display = 'none';

  if (val) {
    saveHistoryState();
    if (editingAnnotation) {
      editingAnnotation.text = val;
    } else if (activeTextPos) {
      const newAnno = {
        type: 'text',
        x: activeTextPos.x,
        y: activeTextPos.y,
        text: val,
        color: activeColor,
        fontSize: 32,
        seed: Math.floor(Math.random() * 65536) + 1
      };
      annotations.push(newAnno);
      selectedAnnotation = newAnno;
    }
    redraw();
    setTool('select');
  }
  activeTextPos = null;
  editingAnnotation = null;
  textEditor.value = '';
}

// ----------------------------------------------------
// History / Undo
// ----------------------------------------------------

function saveHistoryState() {
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
  } else if (e.key.toLowerCase() === 'n') {
    setTool('step');
  } else if (e.key.toLowerCase() === 'h') {
    setTool('highlighter');
  } else if (e.key.toLowerCase() === 'm') {
    setTool('magnifier');
  } else if (e.key.toLowerCase() === 'k') {
    setTool('crop');
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
