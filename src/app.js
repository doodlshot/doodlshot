// Doodlshot Core Canvas Engine - Premium Pastel, Callout Pointers & Precision Editing

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
let activeColor = '#ff6b6b'; // Rich Pastel Coral default
let activeWidth = 4.5;
let activeRoughness = 1.2;

function getNextStepNumber() {
  const steps = annotations.filter(a => a.type === 'step');
  if (steps.length === 0) return 1;
  const maxNum = Math.max(...steps.map(s => Number(s.number) || 0));
  return Math.max(1, maxNum + 1);
}

let isDrawing = false;
let isMoving = false;
let moveOffset = { x: 0, y: 0 };
let pointerDownPos = null;
let currentAnnotation = null;
let selectedAnnotation = null;
let activeHandle = null; // 'p0', 'p1', 'p2', 'tip'

// Double click tracker
let lastClickTime = 0;
let lastClickPos = null;

// Studio Framing Backdrop State
let activeBackdrop = 'none'; // 'none', 'sunset', 'ocean', 'obsidian', 'aurora'

// Tool names for badge
const toolLabels = {
  select: 'Select & Move',
  arrow: 'Bendable Arrow',
  oval: 'Hand-drawn Oval',
  rect: 'Hand-drawn Rectangle',
  cloud: 'Callout Cloud',
  step: 'Step Badge (with Pointer)',
  highlighter: 'Highlighter',
  magnifier: 'Magnifier Loupe',
  pen: 'Freehand Pen',
  text: 'Hand-drawn Text',
  spotlight: 'Spotlight Focus',
  pixelate: 'Pixelate Mosaic',
  blur: 'Frosted Blur',
  erase: 'Smart Erase',
  crop: 'Crop Canvas'
};

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  rc = rough.canvas(canvas);
  initUI();
  loadImage();
});

function initUI() {
  const tools = ['select', 'arrow', 'oval', 'rect', 'cloud', 'step', 'highlighter', 'magnifier', 'pen', 'text', 'spotlight', 'pixelate', 'blur', 'erase', 'crop'];
  tools.forEach(t => {
    const btn = document.getElementById(`tool-${t}`);
    if (btn) {
      btn.addEventListener('click', () => setTool(t));
    }
  });

  // Studio Framing Backdrop listeners
  document.querySelectorAll('.backdrop-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.backdrop-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeBackdrop = btn.dataset.backdrop || 'none';
      resizeCanvasForBackdrop();
      redraw();
    });
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

  // Inline text handlers with full multi-line support
  textEditor.addEventListener('blur', finalizeText);
  textEditor.addEventListener('input', autoResizeTextEditor);
  textEditor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      finalizeText();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      // Natural newline in textarea
      setTimeout(autoResizeTextEditor, 0);
    }
    if (e.key === 'Escape') {
      finalizeText();
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

function resizeCanvasForBackdrop() {
  const pad = activeBackdrop !== 'none' ? 44 : 0;
  canvas.width = imageWidth + pad * 2;
  canvas.height = imageHeight + pad * 2;
  badgeDims.textContent = `${imageWidth} × ${imageHeight}`;
}

function loadImage() {
  baseImage = new Image();
  baseImage.onload = () => {
    imageWidth = baseImage.naturalWidth || baseImage.width;
    imageHeight = baseImage.naturalHeight || baseImage.height;
    resizeCanvasForBackdrop();
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

  const dots = ['#ff6b6b', '#ffa94d', '#38d9a9'];
  dots.forEach((c, idx) => {
    octx.beginPath();
    octx.arc(110 + idx * 20, 110, 6, 0, Math.PI * 2);
    octx.fillStyle = c;
    octx.fill();
  });

  octx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  octx.font = 'bold 24px "Noteworthy", -apple-system, sans-serif';
  octx.fillText('Doodlshot Canvas Ready', 110, 190);
  octx.font = '16px -apple-system, sans-serif';
  octx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  octx.fillText('• Spotlight focus, Studio framing backdrops, & Smart redaction', 110, 230);
  octx.fillText('• Double-click anywhere on text to edit it in place', 110, 260);
  octx.fillText('• Bulletproof pixelation, frosted blur, and smart erase', 110, 290);
  octx.fillText('• Clean solid line on magnifier loupe & rich pastel palette', 110, 320);

  baseImage.src = offscreen.toDataURL('image/png');
}

// ----------------------------------------------------
// Pointer Interaction
// ----------------------------------------------------

function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const rawX = (e.clientX - rect.left) * scaleX;
  const rawY = (e.clientY - rect.top) * scaleY;
  const pad = activeBackdrop !== 'none' ? 44 : 0;
  return {
    x: rawX - pad,
    y: rawY - pad
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

  // Double Click Check -> Edit Existing Text (Hit-test across entire text bounding box!)
  if (now - lastClickTime < 350) {
    const hitText = annotations.find(a => {
      if (a.type !== 'text') return false;
      const lines = a.text.split('\n');
      const fontSize = a.fontSize || 32;
      ctx.save();
      ctx.font = `bold ${fontSize}px 'Noteworthy', -apple-system, sans-serif`;
      let maxWidth = 0;
      lines.forEach(l => {
        const w = ctx.measureText(l).width;
        if (w > maxWidth) maxWidth = w;
      });
      ctx.restore();
      const totalH = Math.max(30, lines.length * fontSize * 1.25);
      return pos.x >= a.x - 8 && pos.x <= a.x + maxWidth + 12 &&
             pos.y >= a.y - 8 && pos.y <= a.y + totalH + 8;
    });

    if (hitText) {
      editExistingText(hitText);
      return;
    }
  }
  lastClickTime = now;
  lastClickPos = pos;

  // Handle pointer tips and arrow handles
  if (selectedAnnotation) {
    if (selectedAnnotation.type === 'arrow') {
      const handle = hitTestArrowHandles(selectedAnnotation, pos);
      if (handle) {
        activeHandle = handle;
        isDrawing = true;
        return;
      }
    } else if (selectedAnnotation.type === 'step' || selectedAnnotation.type === 'cloud') {
      if (selectedAnnotation.tipX !== undefined) {
        if (Math.hypot(pos.x - selectedAnnotation.tipX, pos.y - selectedAnnotation.tipY) < 18) {
          activeHandle = 'tip';
          isDrawing = true;
          return;
        }
      }
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
      } else if ((selectedAnnotation.type === 'step' || selectedAnnotation.type === 'cloud') && Math.hypot(pos.x - selectedAnnotation.tipX, pos.y - selectedAnnotation.tipY) < 18) {
        activeHandle = 'tip';
      } else {
        isMoving = true;
        moveOffset = { x: pos.x - (selectedAnnotation.x || selectedAnnotation.cx || 0), y: pos.y - (selectedAnnotation.y || selectedAnnotation.cy || 0) };
      }
    }
    redraw();
    isDrawing = true;
    return;
  }

  // Step Badge (with aimable pointer teardrop pin!)
  if (activeTool === 'step') {
    saveHistoryState();
    const badge = {
      type: 'step',
      x: pos.x,
      y: pos.y,
      tipX: pos.x,
      tipY: pos.y + 24, // Compact 7px teardrop pointer
      number: getNextStepNumber(),
      color: activeColor,
      radius: 17
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
      tipX: pos.x,
      tipY: pos.y + 40,
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
  } else if (activeTool === 'spotlight') {
    currentAnnotation = {
      type: 'spotlight',
      startX: pos.x,
      startY: pos.y,
      x: pos.x,
      y: pos.y,
      w: 0,
      h: 0,
      radius: 12
    };
  } else if (['pixelate', 'blur', 'erase'].includes(activeTool)) {
    currentAnnotation = {
      type: activeTool,
      startX: pos.x,
      startY: pos.y,
      x: pos.x,
      y: pos.y,
      w: 0,
      h: 0,
      blockSize: 12,
      baked: null
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

  // Moving tip of step badge or cloud
  if (selectedAnnotation && activeHandle === 'tip') {
    selectedAnnotation.tipX = pos.x;
    selectedAnnotation.tipY = pos.y;
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
    } else {
      const origX = selectedAnnotation.x !== undefined ? selectedAnnotation.x : selectedAnnotation.cx;
      const origY = selectedAnnotation.y !== undefined ? selectedAnnotation.y : selectedAnnotation.cy;
      const dx = pos.x - origX - moveOffset.x;
      const dy = pos.y - origY - moveOffset.y;

      if (selectedAnnotation.x !== undefined) selectedAnnotation.x += dx;
      if (selectedAnnotation.y !== undefined) selectedAnnotation.y += dy;
      if (selectedAnnotation.cx !== undefined) selectedAnnotation.cx += dx;
      if (selectedAnnotation.cy !== undefined) selectedAnnotation.cy += dy;
      if (selectedAnnotation.tipX !== undefined) selectedAnnotation.tipX += dx;
      if (selectedAnnotation.tipY !== undefined) selectedAnnotation.tipY += dy;
      if (selectedAnnotation.sourceX !== undefined) selectedAnnotation.sourceX += dx;
      if (selectedAnnotation.sourceY !== undefined) selectedAnnotation.sourceY += dy;

      if (['pixelate', 'blur', 'erase'].includes(selectedAnnotation.type)) {
        selectedAnnotation.baked = null; // re-bake at new location
      }
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
  } else if (['rect', 'highlighter', 'crop', 'spotlight'].includes(currentAnnotation.type)) {
    currentAnnotation.x = Math.min(currentAnnotation.startX, pos.x);
    currentAnnotation.y = Math.min(currentAnnotation.startY, pos.y);
    currentAnnotation.w = Math.abs(pos.x - currentAnnotation.startX);
    currentAnnotation.h = Math.abs(pos.y - currentAnnotation.startY);
    currentAnnotation.drawable = null;
  } else if (currentAnnotation.type === 'cloud') {
    currentAnnotation.x = Math.min(currentAnnotation.startX, pos.x);
    currentAnnotation.y = Math.min(currentAnnotation.startY, pos.y);
    currentAnnotation.w = Math.abs(pos.x - currentAnnotation.startX);
    currentAnnotation.h = Math.abs(pos.y - currentAnnotation.startY);
    const cx = currentAnnotation.x + currentAnnotation.w / 2;
    const cy = currentAnnotation.y + currentAnnotation.h / 2;
    const rx = currentAnnotation.w / 2;
    const ry = currentAnnotation.h / 2;
    currentAnnotation.tipX = cx + rx * 0.75;
    currentAnnotation.tipY = cy + ry + Math.max(18, ry * 0.35);
    currentAnnotation.drawable = null;
  } else if (['pixelate', 'blur', 'erase'].includes(currentAnnotation.type)) {
    currentAnnotation.x = Math.min(currentAnnotation.startX, pos.x);
    currentAnnotation.y = Math.min(currentAnnotation.startY, pos.y);
    currentAnnotation.w = Math.abs(pos.x - currentAnnotation.startX);
    currentAnnotation.h = Math.abs(pos.y - currentAnnotation.startY);
    currentAnnotation.baked = null; // bake live
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
    } else if (['pixelate', 'blur', 'erase'].includes(currentAnnotation.type)) {
      if (currentAnnotation.w > 4 && currentAnnotation.h > 4) {
        if (currentAnnotation.type === 'blur') currentAnnotation.baked = bakeBlur(currentAnnotation);
        else if (currentAnnotation.type === 'erase') currentAnnotation.baked = bakeErase(currentAnnotation);
        else currentAnnotation.baked = bakePixelate(currentAnnotation);
        annotations.push(currentAnnotation);
        selectedAnnotation = currentAnnotation;
      }
    } else if (currentAnnotation.type === 'spotlight') {
      if (currentAnnotation.w > 8 && currentAnnotation.h > 8) {
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

  const pad = activeBackdrop !== 'none' ? 44 : 0;

  // 1. If Studio Framing Backdrop is active, draw gradient background & drop shadow
  if (activeBackdrop !== 'none') {
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    if (activeBackdrop === 'sunset') {
      grad.addColorStop(0, '#f093fb');
      grad.addColorStop(1, '#f5576c');
    } else if (activeBackdrop === 'ocean') {
      grad.addColorStop(0, '#4facfe');
      grad.addColorStop(1, '#00f2fe');
    } else if (activeBackdrop === 'obsidian') {
      grad.addColorStop(0, '#27272a');
      grad.addColorStop(1, '#09090b');
    } else if (activeBackdrop === 'aurora') {
      grad.addColorStop(0, '#d299c2');
      grad.addColorStop(1, '#fef9d7');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Soft 3D drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 16;
    ctx.beginPath();
    ctx.roundRect(pad, pad, imageWidth, imageHeight, 14);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  if (activeBackdrop !== 'none') {
    // Clip screenshot to rounded rect and translate
    ctx.beginPath();
    ctx.roundRect(pad, pad, imageWidth, imageHeight, 14);
    ctx.clip();
    ctx.translate(pad, pad);
  }

  // Draw base screenshot
  if (baseImage) {
    ctx.drawImage(baseImage, 0, 0, imageWidth, imageHeight);
  }

  // 1. Redactions first (pixelate, blur, erase)
  annotations.filter(a => ['pixelate', 'blur', 'erase'].includes(a.type)).forEach(a => renderRedaction(a));

  // 2. Spotlights
  renderSpotlightsLayer();

  // 3. Highlighters (semi-transparent layer)
  annotations.filter(a => a.type === 'highlighter').forEach(a => renderHighlighter(a));

  // 4. Vector annotations
  annotations.filter(a => !['pixelate', 'blur', 'erase', 'highlighter', 'magnifier', 'spotlight'].includes(a.type)).forEach(a => renderAnnotation(a));

  // 5. Magnifiers (top layer with lens zoom)
  annotations.filter(a => a.type === 'magnifier').forEach(a => renderMagnifier(a));

  // Active drawing preview
  if (currentAnnotation && isDrawing) {
    if (['pixelate', 'blur', 'erase'].includes(currentAnnotation.type)) {
      renderRedaction(currentAnnotation);
    } else if (currentAnnotation.type === 'spotlight') {
      renderSpotlightsLayer(currentAnnotation);
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

  // Selection handles
  if (includeHandles && selectedAnnotation) {
    if (selectedAnnotation.type === 'arrow') {
      renderArrowHandles(selectedAnnotation);
    } else if (selectedAnnotation.type === 'step' || selectedAnnotation.type === 'cloud') {
      renderPointerTipHandle(selectedAnnotation);
    } else if (['pixelate', 'blur', 'erase', 'spotlight', 'rect'].includes(selectedAnnotation.type)) {
      renderBoxSelection(selectedAnnotation);
    }
  }

  ctx.restore();

  // Draw subtle outer border around rounded screenshot frame
  if (activeBackdrop !== 'none') {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(pad, pad, imageWidth, imageHeight, 14);
    ctx.stroke();
    ctx.restore();
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
  const wingAngle = 0.46;

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

// ☁️ Callout Cloud with Seamless Integrated Beak
function generateCalloutCloudPath(a) {
  const { x, y, w, h } = a;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = Math.max(10, w / 2);
  const ry = Math.max(10, h / 2);
  const tipX = a.tipX !== undefined ? a.tipX : (cx + rx * 0.75);
  const tipY = a.tipY !== undefined ? a.tipY : (cy + ry + 24);

  const dx = tipX - cx;
  const dy = tipY - cy;
  const dist = Math.hypot(dx, dy);
  const tipAngle = Math.atan2(dy, dx);

  // Boundary radius at tip angle
  const edgeR = Math.hypot(rx * Math.cos(tipAngle), ry * Math.sin(tipAngle));
  const hasBeak = dist > (edgeR + 8);

  // Helper converting quadratic Bézier into cubic Bézier for 100% Rough.js compatibility
  const qToC = (p0x, p0y, cpx, cpy, p2x, p2y) => {
    const c1x = p0x + (2 / 3) * (cpx - p0x);
    const c1y = p0y + (2 / 3) * (cpy - p0y);
    const c2x = p2x + (2 / 3) * (cpx - p2x);
    const c2y = p2y + (2 / 3) * (cpy - p2y);
    return `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2x.toFixed(1)} ${p2y.toFixed(1)} `;
  };

  if (!hasBeak) {
    // Pure fluffy cloud without beak
    const numArcs = 9;
    const pts = [];
    for (let i = 0; i <= numArcs; i++) {
      const th = (i / numArcs) * Math.PI * 2;
      pts.push({ x: cx + rx * Math.cos(th), y: cy + ry * Math.sin(th), th });
    }
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} `;
    for (let i = 0; i < numArcs; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const midTh = (p1.th + p2.th) / 2;
      const cpX = cx + (rx * 1.25) * Math.cos(midTh);
      const cpY = cy + (ry * 1.25) * Math.sin(midTh);
      d += qToC(p1.x, p1.y, cpX, cpY, p2.x, p2.y);
    }
    return d + 'Z';
  }

  // Cloud with integrated callout beak pointing gracefully to (tipX, tipY)
  const halfSpan = 0.32; // ~18 deg each side
  const startTh = tipAngle + halfSpan;
  const totalArc = Math.PI * 2 - 2 * halfSpan;
  const steps = 8;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const th = startTh + (i / steps) * totalArc;
    pts.push({ x: cx + rx * Math.cos(th), y: cy + ry * Math.sin(th), th });
  }

  const b2 = { x: cx + rx * Math.cos(startTh), y: cy + ry * Math.sin(startTh) };
  const b1 = pts[steps]; // at tipAngle - halfSpan

  let d = `M ${b2.x.toFixed(1)} ${b2.y.toFixed(1)} `;
  for (let i = 0; i < steps; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const midTh = (p1.th + p2.th) / 2;
    const cpX = cx + (rx * 1.25) * Math.cos(midTh);
    const cpY = cy + (ry * 1.25) * Math.sin(midTh);
    d += qToC(p1.x, p1.y, cpX, cpY, p2.x, p2.y);
  }

  // Outgoing curve from b1 to tip
  const ctrl1X = (b1.x + tipX) / 2 + Math.cos(tipAngle - Math.PI / 2) * 8;
  const ctrl1Y = (b1.y + tipY) / 2 + Math.sin(tipAngle - Math.PI / 2) * 8;
  d += qToC(b1.x, b1.y, ctrl1X, ctrl1Y, tipX, tipY);

  // Incoming curve from tip back to b2
  const ctrl2X = (b2.x + tipX) / 2 - Math.cos(tipAngle - Math.PI / 2) * 8;
  const ctrl2Y = (b2.y + tipY) / 2 - Math.sin(tipAngle - Math.PI / 2) * 8;
  d += qToC(tipX, tipY, ctrl2X, ctrl2Y, b2.x, b2.y);

  return d + 'Z';
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
      const pathD = generateCalloutCloudPath(a);
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

// ① Step Badge with Sleek Mathematical Tangent Teardrop Pin
function renderStepBadge(a) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  const r = a.radius || 17;
  const tipX = a.tipX !== undefined ? a.tipX : a.x;
  const tipY = a.tipY !== undefined ? a.tipY : (a.y + 24);
  const rTip = 2.5;

  const dx = tipX - a.x;
  const dy = tipY - a.y;
  const d = Math.hypot(dx, dy);
  const theta = Math.atan2(dy, dx);

  ctx.beginPath();
  if (d <= r + 3) {
    // Clean circle if tip is inside or tucked in
    ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
  } else {
    // Mathematical tangent teardrop pin (Zero kinks, 100% C1 continuous!)
    const val = Math.max(-1.0, Math.min(1.0, (r - rTip) / d));
    const alpha = Math.acos(val);

    const b1x = tipX + rTip * Math.cos(theta - alpha);
    const b1y = tipY + rTip * Math.sin(theta - alpha);
    const b2x = tipX + rTip * Math.cos(theta + alpha);
    const b2y = tipY + rTip * Math.sin(theta + alpha);

    const a2x = a.x + r * Math.cos(theta + alpha);
    const a2y = a.y + r * Math.sin(theta + alpha);

    ctx.arc(a.x, a.y, r, theta + alpha, theta - alpha, false);
    ctx.lineTo(b1x, b1y);
    ctx.arc(tipX, tipY, rTip, theta - alpha, theta + alpha, false);
    ctx.lineTo(a2x, a2y);
    ctx.closePath();
  }

  ctx.fillStyle = a.color;
  ctx.fill();

  // Crisp inner ring highlight for contrast against any background
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.stroke();

  // Bold centered step number
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
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

// 🔍 Magnifier Loupe Tool with Solid Callout Line & Target Ring
function renderMagnifier(a) {
  if (!baseImage) return;
  ctx.save();

  const { x, y, sourceX, sourceY, radius, zoom, color } = a;

  // 1. Sleek SOLID callout line (No dashed slots!)
  ctx.beginPath();
  ctx.moveTo(sourceX, sourceY);
  ctx.lineTo(x, y);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 6;
  ctx.stroke();

  // 2. Clean circular target pin at source
  ctx.beginPath();
  ctx.arc(sourceX, sourceY, 6, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // 3. Circular clip for magnifier lens
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.save();
  ctx.clip();

  const sw = (radius * 2) / zoom;
  const sh = (radius * 2) / zoom;
  const sx = sourceX - sw / 2;
  const sy = sourceY - sh / 2;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(baseImage, sx, sy, sw, sh, x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();

  // 4. Outer lens ring & shadow
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 14;
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

    annotations.forEach(a => {
      if (a.p0) {
        a.p0.x -= x; a.p0.y -= y;
        a.p1.x -= x; a.p1.y -= y;
        a.p2.x -= x; a.p2.y -= y;
      }
      if (a.x !== undefined) { a.x -= x; a.y -= y; }
      if (a.cx !== undefined) { a.cx -= x; a.cy -= y; }
      if (a.tipX !== undefined) { a.tipX -= x; a.tipY -= y; }
      if (a.sourceX !== undefined) { a.sourceX -= x; a.sourceY -= y; }
      a.drawable = null;
      if (['pixelate', 'blur', 'erase'].includes(a.type)) a.baked = null;
    });

    redraw();
  };
  baseImage.src = offscreen.toDataURL('image/png');
}

// ⬛ 100% Persistent Pixelate, Frosted Blur & Smart Erase
function bakePixelate(a) {
  if (!baseImage) return null;
  const sx = Math.max(0, Math.floor(a.x));
  const sy = Math.max(0, Math.floor(a.y));
  const sw = Math.min(imageWidth - sx, Math.floor(a.w));
  const sh = Math.min(imageHeight - sy, Math.floor(a.h));
  if (sw < 4 || sh < 4) return null;

  const bs = a.blockSize || 12;
  const off = document.createElement('canvas');
  off.width = sw;
  off.height = sh;
  const octx = off.getContext('2d');

  octx.drawImage(baseImage, sx, sy, sw, sh, 0, 0, sw, sh);

  try {
    const imgData = octx.getImageData(0, 0, sw, sh);
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

        octx.fillStyle = `rgb(${r},${g},${b})`;
        octx.fillRect(px, py, Math.min(bs, sw - px), Math.min(bs, sh - py));
      }
    }
  } catch (err) {
    console.error("Bake pixelate error:", err);
  }

  return { off, sx, sy, sw, sh };
}

function bakeBlur(a) {
  if (!baseImage) return null;
  const sx = Math.max(0, Math.floor(a.x));
  const sy = Math.max(0, Math.floor(a.y));
  const sw = Math.min(imageWidth - sx, Math.floor(a.w));
  const sh = Math.min(imageHeight - sy, Math.floor(a.h));
  if (sw < 4 || sh < 4) return null;

  const off = document.createElement('canvas');
  off.width = sw;
  off.height = sh;
  const octx = off.getContext('2d');

  // Smooth multi-pass downsample blur
  const lowW = Math.max(3, Math.floor(sw / 8));
  const lowH = Math.max(3, Math.floor(sh / 8));
  const temp = document.createElement('canvas');
  temp.width = lowW;
  temp.height = lowH;
  const tctx = temp.getContext('2d');
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(baseImage, sx, sy, sw, sh, 0, 0, lowW, lowH);

  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(temp, 0, 0, lowW, lowH, 0, 0, sw, sh);

  return { off, sx, sy, sw, sh };
}

function bakeErase(a) {
  if (!baseImage) return null;
  const sx = Math.max(0, Math.floor(a.x));
  const sy = Math.max(0, Math.floor(a.y));
  const sw = Math.min(imageWidth - sx, Math.floor(a.w));
  const sh = Math.min(imageHeight - sy, Math.floor(a.h));
  if (sw < 4 || sh < 4) return null;

  const off = document.createElement('canvas');
  off.width = sw;
  off.height = sh;
  const octx = off.getContext('2d');

  // Sample perimeter pixels from baseImage
  const sampleCanv = document.createElement('canvas');
  sampleCanv.width = imageWidth;
  sampleCanv.height = imageHeight;
  const sctx = sampleCanv.getContext('2d');
  sctx.drawImage(baseImage, 0, 0);

  const x0 = Math.max(0, sx - 3);
  const y0 = Math.max(0, sy - 3);
  const w0 = Math.min(imageWidth - x0, sw + 6);
  const h0 = Math.min(imageHeight - y0, sh + 6);

  try {
    const imgData = sctx.getImageData(x0, y0, w0, h0);
    const data = imgData.data;

    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let py = 0; py < h0; py++) {
      for (let px = 0; px < w0; px++) {
        if (px < 3 || px >= w0 - 3 || py < 3 || py >= h0 - 3) {
          const idx = (py * w0 + px) * 4;
          rSum += data[idx];
          gSum += data[idx + 1];
          bSum += data[idx + 2];
          count++;
        }
      }
    }
    const avgR = Math.round(rSum / Math.max(1, count));
    const avgG = Math.round(gSum / Math.max(1, count));
    const avgB = Math.round(bSum / Math.max(1, count));

    octx.fillStyle = `rgb(${avgR}, ${avgG}, ${avgB})`;
    octx.fillRect(0, 0, sw, sh);
  } catch (err) {
    console.error("Bake erase error:", err);
  }

  return { off, sx, sy, sw, sh };
}

function renderRedaction(a) {
  if (!a.baked) {
    if (a.type === 'blur') a.baked = bakeBlur(a);
    else if (a.type === 'erase') a.baked = bakeErase(a);
    else a.baked = bakePixelate(a);
  }
  if (a.baked) {
    ctx.drawImage(a.baked.off, a.baked.sx, a.baked.sy);
  }
}

// 💡 Spotlight Focus Mask
function renderSpotlightsLayer(activePreview = null) {
  const spotlights = annotations.filter(a => a.type === 'spotlight');
  if (spotlights.length === 0 && (!activePreview || activePreview.type !== 'spotlight')) {
    return;
  }

  const all = [...spotlights];
  if (activePreview && activePreview.type === 'spotlight' && activePreview.w > 4 && activePreview.h > 4) {
    all.push(activePreview);
  }

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';

  // Build cutout mask path using evenodd rule
  ctx.beginPath();
  ctx.rect(0, 0, imageWidth, imageHeight);
  all.forEach(s => {
    ctx.roundRect(s.x, s.y, s.w, s.h, s.radius || 10);
  });
  ctx.fill('evenodd');

  // Draw glowing crisp border around each spotlight aperture
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 2;
  all.forEach(s => {
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, s.w, s.h, s.radius || 10);
    ctx.stroke();
  });
  ctx.restore();
}

function renderBoxSelection(a) {
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#4dabf7';
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(a.x, a.y, a.w, a.h);
  ctx.restore();
}

// Interactive Handles
function renderArrowHandles(a) {
  const handles = [
    { p: a.p0, color: '#4dabf7', label: 'start' },
    { p: a.p1, color: '#ffa94d', label: 'bend' },
    { p: a.p2, color: '#ff6b6b', label: 'tip' }
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

function renderPointerTipHandle(a) {
  if (a.tipX === undefined) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(a.tipX, a.tipY, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#ffa94d'; // Aim handle
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
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
      if (Math.hypot(pos.x - a.x, pos.y - a.y) < a.radius + 6) return a;
      if (Math.hypot(pos.x - a.tipX, pos.y - a.tipY) < 18) return a;
    } else if (a.type === 'text') {
      // Precision full bounding box hit test across all lines
      const lines = a.text.split('\n');
      const fontSize = a.fontSize || 32;
      ctx.save();
      ctx.font = `bold ${fontSize}px 'Noteworthy', -apple-system, sans-serif`;
      let maxWidth = 0;
      lines.forEach(l => {
        const w = ctx.measureText(l).width;
        if (w > maxWidth) maxWidth = w;
      });
      ctx.restore();
      const totalH = Math.max(30, lines.length * fontSize * 1.25);
      if (pos.x >= a.x - 8 && pos.x <= a.x + maxWidth + 12 &&
          pos.y >= a.y - 8 && pos.y <= a.y + totalH + 8) {
        return a;
      }
    } else if (a.type === 'oval') {
      const dx = (pos.x - a.cx) / a.rx;
      const dy = (pos.y - a.cy) / a.ry;
      if (Math.abs(dx * dx + dy * dy - 1) < 0.4) return a;
    } else if (['rect', 'cloud', 'highlighter', 'pixelate', 'blur', 'erase', 'spotlight'].includes(a.type)) {
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

function autoResizeTextEditor() {
  textEditor.style.width = 'auto';
  textEditor.style.height = 'auto';
  textEditor.style.width = `${Math.max(140, textEditor.scrollWidth + 16)}px`;
  textEditor.style.height = `${Math.max(44, textEditor.scrollHeight + 6)}px`;
}

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
  textEditor.style.width = '140px';
  textEditor.style.height = '44px';
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
  autoResizeTextEditor();
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
  } else if (e.key.toLowerCase() === 's') {
    setTool('spotlight');
  } else if (e.key.toLowerCase() === 'x') {
    setTool('pixelate');
  } else if (e.key.toLowerCase() === 'b') {
    setTool('blur');
  } else if (e.key.toLowerCase() === 'e') {
    setTool('erase');
  } else if (e.key.toLowerCase() === 'f') {
    cycleBackdrop();
  } else if (e.key.toLowerCase() === 'v') {
    setTool('select');
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedAnnotation) {
      saveHistoryState();
      annotations = annotations.filter(a => a !== selectedAnnotation);
      selectedAnnotation = null;
      redraw();
    }
  } else if (selectedAnnotation && selectedAnnotation.type === 'step' && /^[0-9]$/.test(e.key)) {
    saveHistoryState();
    const cur = String(selectedAnnotation.number || '');
    if (selectedAnnotation._justTyped) {
      selectedAnnotation.number = parseInt(cur + e.key, 10) || parseInt(e.key, 10);
      selectedAnnotation._justTyped = false;
    } else {
      selectedAnnotation.number = parseInt(e.key, 10);
      selectedAnnotation._justTyped = true;
    }
    redraw();
  } else if (selectedAnnotation && selectedAnnotation.type === 'step' && (e.key === '+' || e.key === '=')) {
    saveHistoryState();
    selectedAnnotation.number = (Number(selectedAnnotation.number) || 0) + 1;
    redraw();
  } else if (selectedAnnotation && selectedAnnotation.type === 'step' && (e.key === '-' || e.key === '_')) {
    saveHistoryState();
    selectedAnnotation.number = Math.max(1, (Number(selectedAnnotation.number) || 1) - 1);
    redraw();
  }
}

function cycleBackdrop() {
  const modes = ['none', 'sunset', 'ocean', 'obsidian', 'aurora'];
  const curIdx = modes.indexOf(activeBackdrop);
  const next = modes[(curIdx + 1) % modes.length];
  activeBackdrop = next;
  document.querySelectorAll('.backdrop-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.backdrop === next);
  });
  resizeCanvasForBackdrop();
  redraw();
}
