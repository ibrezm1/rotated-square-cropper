/**
 * SpinCrop - Rotated Image Cropper Application Logic
 * 
 * Math coordinate spaces:
 * - Image Space: Coordinates relative to original image size (original pixels).
 *                Internal state (cx, cy, width, height) is stored here.
 * - Display Space: Coordinates scaled to fit the screen canvas.
 *                  displayScale = canvasDisplayWidth / originalImageWidth.
 */

// Application State
const state = {
  image: null,
  imageWidth: 0,
  imageHeight: 0,
  
  // Crop box parameters (in image pixels)
  cx: 0,
  cy: 0,
  width: 0,
  height: 0,
  angle: 0, // in radians
  
  // Configurations
  aspectRatio: 'free', // '1:1', 'free', '16:9', '4:3', '3:2', '2:3'
  lockAspect: false,
  bgFill: 'transparent', // 'transparent', 'blur', 'black', 'white'
  exportRes: '1024', // 'original', '512', '1024', '2048', 'custom'
  exportFormat: 'image/png', // 'image/png', 'image/jpeg', 'image/webp'
  exportCustomWidth: 1024,
  exportCustomHeight: 1024,
};

// UI Elements Cache
const DOM = {
  dropZone: document.getElementById('dropZone'),
  fileInput: document.getElementById('fileInput'),
  uploadPlaceholder: document.getElementById('uploadPlaceholder'),
  workspaceWrapper: document.getElementById('workspaceWrapper'),
  canvasContainer: document.getElementById('canvasContainer'),
  editorCanvas: document.getElementById('editorCanvas'),
  svgOverlay: document.getElementById('svgOverlay'),
  maskRect: document.getElementById('maskRect'),
  cropBox: document.getElementById('cropBox'),
  
  // Sidebar Controls
  aspectButtons: document.querySelectorAll('.btn-aspect'),
  lockAspectCheckbox: document.getElementById('lockAspect'),
  angleSlider: document.getElementById('angleSlider'),
  angleInput: document.getElementById('angleInput'),
  angleValue: document.getElementById('angleValue'),
  btnResetCrop: document.getElementById('btnResetCrop'),
  btnUndo: document.getElementById('btnUndo'),
  btnRedo: document.getElementById('btnRedo'),
  btnSample: document.getElementById('btnSample'),
  btnDownload: document.getElementById('btnDownload'),
  btnCopy: document.getElementById('btnCopy'),
  toastContainer: document.getElementById('toastContainer'),
  
  // Fine Tuning Fields
  posXInput: document.getElementById('posXInput'),
  posYInput: document.getElementById('posYInput'),
  widthInput: document.getElementById('widthInput'),
  heightInput: document.getElementById('heightInput'),
  
  // Fill Selector & Export
  bgFills: document.getElementsByName('bgFill'),
  exportResSelect: document.getElementById('exportRes'),
  exportFormatSelect: document.getElementById('exportFormat'),
  customResRow: document.getElementById('customResRow'),
  exportWidthInput: document.getElementById('exportWidthInput'),
  exportHeightInput: document.getElementById('exportHeightInput'),
  
  // Preview
  previewDrawer: document.getElementById('previewDrawer'),
  previewHeader: document.getElementById('previewHeader'),
  btnTogglePreview: document.getElementById('btnTogglePreview'),
  previewCanvas: document.getElementById('previewCanvas'),
  previewDims: document.getElementById('previewDims'),
  
  // Help Modal
  btnHelp: document.getElementById('btnHelp'),
  helpModal: document.getElementById('helpModal'),
  btnCloseHelp: document.getElementById('btnCloseHelp'),
};

// Interaction variables
let isInteracting = false;
let interactionType = null; // 'move', 'rotate', 'resize-tl', etc.
let displayScale = 1.0;
let canvasRect = { left: 0, top: 0, width: 0, height: 0 };
let startMousePos = { x: 0, y: 0 };

// Initial states for dragging
const initialState = {
  cx: 0,
  cy: 0,
  width: 0,
  height: 0,
  angle: 0,
};

// History (Undo/Redo)
const historyStack = [];
let historyIndex = -1;
const MAX_HISTORY = 50;
const MIN_SIZE = 20; // min crop box dimension in pixels

// Setup Application
window.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  
  // Load standard demo pattern on startup
  loadDemoPattern();
});

// 1. EVENT LISTENERS SETUP
function initEventListeners() {
  // Image Upload / Drag and Drop
  DOM.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.dropZone.classList.add('dragover');
  });
  
  DOM.dropZone.addEventListener('dragleave', () => {
    DOM.dropZone.classList.remove('dragover');
  });
  
  DOM.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    DOM.dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      loadImageFromFile(e.dataTransfer.files[0]);
    }
  });
  
  DOM.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      loadImageFromFile(e.target.files[0]);
    }
  });
  
  DOM.btnSample.addEventListener('click', loadDemoPattern);
  
  // Aspect Ratio Settings
  DOM.aspectButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.aspectButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setAspectRatio(btn.dataset.ratio);
    });
  });
  
  DOM.lockAspectCheckbox.addEventListener('change', (e) => {
    state.lockAspect = e.target.checked;
    if (state.lockAspect && state.aspectRatio === 'free') {
      // Switch aspect ratio to square 1:1 if locked but ratio was free
      DOM.aspectButtons.forEach(b => b.classList.remove('active'));
      const squareBtn = Array.from(DOM.aspectButtons).find(b => b.dataset.ratio === '1:1');
      if (squareBtn) squareBtn.classList.add('active');
      setAspectRatio('1:1');
    } else {
      saveHistoryState();
      renderPreview();
    }
  });

  // Slider & Numerical Inputs for Rotation
  DOM.angleSlider.addEventListener('input', (e) => {
    const deg = parseFloat(e.target.value);
    state.angle = deg * (Math.PI / 180);
    DOM.angleInput.value = deg;
    DOM.angleValue.textContent = deg.toFixed(1);
    updateUIFromState(false);
    renderPreview();
  });
  
  DOM.angleSlider.addEventListener('change', () => {
    saveHistoryState();
  });

  DOM.angleInput.addEventListener('change', (e) => {
    let deg = parseFloat(e.target.value) || 0;
    deg = Math.max(-180, Math.min(180, deg));
    state.angle = deg * (Math.PI / 180);
    DOM.angleSlider.value = deg;
    DOM.angleValue.textContent = deg.toFixed(1);
    updateUIFromState(false);
    renderPreview();
    saveHistoryState();
  });
  
  // Coordinates Manual Focus updates (Disabled by default, update when typed)
  // Let the user edit inputs for perfect nudge
  const setupNudgeInput = (element, key) => {
    element.addEventListener('change', (e) => {
      let val = parseFloat(e.target.value) || 0;
      if (key === 'width' || key === 'height') {
        val = Math.max(MIN_SIZE, val);
      }
      state[key] = val;
      if (state.lockAspect && (key === 'width' || key === 'height')) {
        const ratio = initialState.width / initialState.height;
        if (key === 'width') {
          state.height = state.width / ratio;
        } else {
          state.width = state.height * ratio;
        }
      }
      updateUIFromState(true);
      renderPreview();
      saveHistoryState();
    });
  };
  setupNudgeInput(DOM.posXInput, 'cx');
  setupNudgeInput(DOM.posYInput, 'cy');
  setupNudgeInput(DOM.widthInput, 'width');
  setupNudgeInput(DOM.heightInput, 'height');

  DOM.btnResetCrop.addEventListener('click', () => {
    resetCropBox();
    saveHistoryState();
  });
  
  // Background Fill Options
  DOM.bgFills.forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.bgFill = e.target.value;
      renderPreview();
    });
  });
  
  // Export Configurations
  DOM.exportResSelect.addEventListener('change', (e) => {
    state.exportRes = e.target.value;
    if (state.exportRes === 'custom') {
      DOM.customResRow.style.display = 'grid';
      updateCustomExportSizes();
    } else {
      DOM.customResRow.style.display = 'none';
    }
    renderPreview();
  });
  
  DOM.exportWidthInput.addEventListener('change', (e) => {
    let w = parseInt(e.target.value) || 1024;
    w = Math.max(32, Math.min(8192, w));
    state.exportCustomWidth = w;
    updateCustomExportSizes();
    renderPreview();
  });
  
  DOM.exportFormatSelect.addEventListener('change', (e) => {
    state.exportFormat = e.target.value;
  });
  
  DOM.btnDownload.addEventListener('click', downloadCrop);
  DOM.btnCopy.addEventListener('click', copyToClipboard);
  
  // Global Clipboard Paste handler
  document.addEventListener('paste', handleClipboardPaste);
  
  // Undo / Redo Click actions
  DOM.btnUndo.addEventListener('click', undo);
  DOM.btnRedo.addEventListener('click', redo);
  
  // Interactive Crop Overlay Mouse/Touch Bindings
  DOM.cropBox.addEventListener('mousedown', startInteraction);
  DOM.cropBox.addEventListener('touchstart', startInteraction, { passive: false });
  
  document.addEventListener('mousemove', handleInteraction);
  document.addEventListener('touchmove', handleInteraction, { passive: false });
  
  document.addEventListener('mouseup', endInteraction);
  document.addEventListener('touchend', endInteraction);
  
  // Keyboard Shortcuts Listener
  document.addEventListener('keydown', handleKeyboardShortcuts);
  
  // Toggle Preview Drawer
  DOM.previewHeader.addEventListener('click', () => {
    DOM.previewDrawer.classList.toggle('collapsed');
  });
  
  // Help Modal Actions
  DOM.btnHelp.addEventListener('click', () => DOM.helpModal.style.display = 'flex');
  DOM.btnCloseHelp.addEventListener('click', () => DOM.helpModal.style.display = 'none');
  DOM.helpModal.addEventListener('click', (e) => {
    if (e.target === DOM.helpModal) DOM.helpModal.style.display = 'none';
  });
  
  // Window Resizing Recalculation
  window.addEventListener('resize', () => {
    if (state.image) {
      recalculateDisplayScale();
      updateUIFromState(true);
    }
  });
}

// 2. IMAGE LOADING & PRESETS
function loadImageFromFile(file) {
  if (!file.type.startsWith('image/')) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      setupWorkspaceImage(img);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function loadDemoPattern() {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');
  
  // Background Gradient
  const grad = ctx.createLinearGradient(0, 0, 1200, 800);
  grad.addColorStop(0, '#111827');
  grad.addColorStop(0.5, '#1e1b4b');
  grad.addColorStop(1, '#030712');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1200, 800);
  
  // Grid Pattern
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = 0; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  
  // Concentric Circles in Center
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)';
  ctx.lineWidth = 2;
  const cx = 600;
  const cy = 400;
  for (let r = 100; r <= 400; r += 100) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  // Draw Bauhaus Abstract Shapes
  // 1. Neon red half circle
  ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
  ctx.beginPath();
  ctx.arc(400, 300, 120, 0, Math.PI);
  ctx.fill();
  
  // 2. Yellow circle
  ctx.fillStyle = 'rgba(245, 158, 11, 0.7)';
  ctx.beginPath();
  ctx.arc(800, 480, 90, 0, Math.PI * 2);
  ctx.fill();
  
  // 3. Cyan rotated square
  ctx.save();
  ctx.translate(600, 400);
  ctx.rotate(Math.PI / 6); // 30 deg
  ctx.fillStyle = 'rgba(6, 182, 212, 0.5)';
  ctx.fillRect(-150, -150, 300, 300);
  
  // Draw diagonal stripes across cyan square
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 8;
  for (let i = -120; i <= 120; i += 30) {
    ctx.beginPath();
    ctx.moveTo(i - 30, -150);
    ctx.lineTo(i + 30, 150);
    ctx.stroke();
  }
  ctx.restore();
  
  // 4. White framing box in center
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(300, 200, 600, 400);
  
  // Fine scale rulers
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px Courier New';
  ctx.fillText('0 px', 10, 20);
  ctx.fillText('1200 px', canvas.width - 60, 20);
  ctx.fillText('800 px', 10, canvas.height - 10);
  
  // Crosshairs in center
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy); ctx.lineTo(cx + 20, cy);
  ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy + 20);
  ctx.stroke();
  
  // Grid tick marks on center axes
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  for (let x = 100; x < canvas.width; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x, cy - 5); ctx.lineTo(x, cy + 5);
    ctx.stroke();
    ctx.fillText(`${x}`, x - 10, cy + 20);
  }
  for (let y = 100; y < canvas.height; y += 100) {
    ctx.beginPath();
    ctx.moveTo(cx - 5, y); ctx.lineTo(cx + 5, y);
    ctx.stroke();
    ctx.fillText(`${y}`, cx + 12, y + 4);
  }
  
  // Central Brand typography
  ctx.font = 'bold 50px Outfit, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('SPINCROP', cx, cy - 30);
  
  ctx.font = '500 24px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillText('ALIGNMENT TEST PATTERN', cx, cy + 15);
  
  ctx.font = '14px Inter, sans-serif';
  ctx.fillStyle = '#6b7280';
  ctx.fillText('ROTATE THIS SQUARE TO CROP ARBITRARY ANGLES', cx, cy + 50);

  const img = new Image();
  img.onload = () => {
    setupWorkspaceImage(img);
  };
  img.src = canvas.toDataURL();
}

function setupWorkspaceImage(img) {
  state.image = img;
  state.imageWidth = img.width;
  state.imageHeight = img.height;
  
  // Hide placeholder and reveal editor
  DOM.uploadPlaceholder.style.display = 'none';
  DOM.workspaceWrapper.style.display = 'flex';
  
  // Enable download & copy buttons
  DOM.btnDownload.disabled = false;
  DOM.btnCopy.disabled = false;
  
  // Reset crop configuration & scale
  recalculateDisplayScale();
  resetCropBox();
  
  // Reset Undo / Redo history
  historyStack.length = 0;
  historyIndex = -1;
  saveHistoryState();
}

function recalculateDisplayScale() {
  if (!state.image) return;
  
  // Setup editorCanvas display dimensions
  const containerWidth = DOM.dropZone.clientWidth - 64; // Padding
  const containerHeight = DOM.dropZone.clientHeight - 64;
  
  let w = state.imageWidth;
  let h = state.imageHeight;
  
  // Fit into boundaries
  if (w > containerWidth) {
    h = h * (containerWidth / w);
    w = containerWidth;
  }
  if (h > containerHeight) {
    w = w * (containerHeight / h);
    h = containerHeight;
  }
  
  DOM.editorCanvas.width = w;
  DOM.editorCanvas.height = h;
  
  // Draw base image onto canvas
  const ctx = DOM.editorCanvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(state.image, 0, 0, w, h);
  
  // Update rendering display scale
  displayScale = w / state.imageWidth;
  canvasRect = DOM.editorCanvas.getBoundingClientRect();
}

// 3. CROP BOX MANIPULATIONS
function resetCropBox() {
  if (!state.image) return;
  
  state.cx = state.imageWidth / 2;
  state.cy = state.imageHeight / 2;
  state.angle = 0;
  
  // Initial size: 60% of the smallest dimension
  const side = Math.min(state.imageWidth, state.imageHeight) * 0.6;
  
  if (state.aspectRatio === 'free') {
    state.width = side;
    state.height = side;
  } else {
    const ratio = getAspectNumerical();
    if (ratio >= 1) {
      state.width = side;
      state.height = side / ratio;
    } else {
      state.height = side;
      state.width = side * ratio;
    }
  }
  
  DOM.angleSlider.value = 0;
  DOM.angleInput.value = 0;
  DOM.angleValue.textContent = '0';
  
  updateUIFromState(true);
  renderPreview();
}

function setAspectRatio(ratioStr) {
  state.aspectRatio = ratioStr;
  
  if (ratioStr === 'free') {
    state.lockAspect = false;
    DOM.lockAspectCheckbox.checked = false;
  } else {
    state.lockAspect = true;
    DOM.lockAspectCheckbox.checked = true;
    
    // Adjust height matching the new ratio keeping width
    const ratio = getAspectNumerical();
    // Keep width, recalculate height
    state.height = state.width / ratio;
    
    // If it exceeds image dimensions, scale down the whole box
    const maxW = state.imageWidth * 0.95;
    const maxH = state.imageHeight * 0.95;
    if (state.width > maxW) {
      state.width = maxW;
      state.height = state.width / ratio;
    }
    if (state.height > maxH) {
      state.height = maxH;
      state.width = state.height * ratio;
    }
    
    // Re-center
    state.cx = state.imageWidth / 2;
    state.cy = state.imageHeight / 2;
  }
  
  updateUIFromState(true);
  renderPreview();
  saveHistoryState();
}

function getAspectNumerical() {
  if (state.aspectRatio === '1:1') return 1.0;
  if (state.aspectRatio === '16:9') return 16 / 9;
  if (state.aspectRatio === '4:3') return 4 / 3;
  if (state.aspectRatio === '3:2') return 3 / 2;
  if (state.aspectRatio === '2:3') return 2 / 3;
  return state.width / state.height; // Fallback
}

// 4. COORDINATE MAPPING & UI REDRAW
function updateUIFromState(updateInputs = true) {
  if (!state.image) return;
  
  // Calculate scaled values in display pixels
  const wDisp = state.width * displayScale;
  const hDisp = state.height * displayScale;
  const cxDisp = state.cx * displayScale;
  const cyDisp = state.cy * displayScale;
  
  // Update interactive crop overlay box dimensions & translate
  DOM.cropBox.style.width = `${wDisp}px`;
  DOM.cropBox.style.height = `${hDisp}px`;
  
  // Translate to center minus half sizes
  const xTranslate = cxDisp - wDisp / 2;
  const yTranslate = cyDisp - hDisp / 2;
  
  DOM.cropBox.style.left = `0px`;
  DOM.cropBox.style.top = `0px`;
  DOM.cropBox.style.transform = `translate3d(${xTranslate}px, ${yTranslate}px, 0) rotate(${state.angle}rad)`;
  
  // Update SVG Shroud Mask Rectangle
  // The SVG is full-size overlaying the canvas.
  // We need to position, size, and rotate #maskRect in image display coords.
  DOM.maskRect.setAttribute('x', `${xTranslate}`);
  DOM.maskRect.setAttribute('y', `${yTranslate}`);
  DOM.maskRect.setAttribute('width', `${wDisp}`);
  DOM.maskRect.setAttribute('height', `${hDisp}`);
  // SVG rotation origin must be the center of this rectangle: (cxDisp, cyDisp)
  DOM.maskRect.setAttribute('transform', `rotate(${(state.angle * 180 / Math.PI).toFixed(2)}, ${cxDisp}, ${cyDisp})`);
  
  // Update numerical fields in sidebar
  if (updateInputs) {
    DOM.posXInput.disabled = false;
    DOM.posYInput.disabled = false;
    DOM.widthInput.disabled = false;
    DOM.heightInput.disabled = false;
    
    DOM.posXInput.value = Math.round(state.cx);
    DOM.posYInput.value = Math.round(state.cy);
    DOM.widthInput.value = Math.round(state.width);
    DOM.heightInput.value = Math.round(state.height);
  }
}

// 5. MOUSE/TOUCH INTERACTION DRAG
function startInteraction(e) {
  if (!state.image) return;
  
  // Avoid multi-touch gesture issues
  if (e.touches && e.touches.length > 1) return;
  
  const target = e.target;
  const event = e.touches ? e.touches[0] : e;
  
  isInteracting = true;
  canvasRect = DOM.editorCanvas.getBoundingClientRect();
  startMousePos = { x: event.clientX, y: event.clientY };
  
  // Capture initial state
  initialState.cx = state.cx;
  initialState.cy = state.cy;
  initialState.width = state.width;
  initialState.height = state.height;
  initialState.angle = state.angle;
  
  if (target.classList.contains('handle-corner')) {
    interactionType = `resize-${target.dataset.handle}`;
    DOM.cropBox.style.cursor = window.getComputedStyle(target).cursor;
  } else if (target.classList.contains('handle-edge')) {
    interactionType = `resize-${target.dataset.handle}`;
    DOM.cropBox.style.cursor = window.getComputedStyle(target).cursor;
  } else if (target.classList.contains('handle-rotation')) {
    interactionType = 'rotate';
    document.body.style.cursor = 'grabbing';
  } else {
    // Clicked cropbox backdrop - standard translate move
    interactionType = 'move';
    DOM.cropBox.style.cursor = 'grabbing';
  }
  
  e.preventDefault();
}

function handleInteraction(e) {
  if (!isInteracting) return;
  
  const event = e.touches ? e.touches[0] : e;
  const currentMouse = { x: event.clientX, y: event.clientY };
  
  // Screen delta mapped to original image pixels
  const dxScreen = currentMouse.x - startMousePos.x;
  const dyScreen = currentMouse.y - startMousePos.y;
  const dxImg = dxScreen / displayScale;
  const dyImg = dyScreen / displayScale;
  
  if (interactionType === 'move') {
    // Simple translation
    let newCx = initialState.cx + dxImg;
    let newCy = initialState.cy + dyImg;
    
    // Boundary check centers
    newCx = Math.max(0, Math.min(state.imageWidth, newCx));
    newCy = Math.max(0, Math.min(state.imageHeight, newCy));
    
    state.cx = newCx;
    state.cy = newCy;
    
    updateUIFromState(true);
    renderPreview();
  } 
  else if (interactionType === 'rotate') {
    // Rotation calculations relative to center in screen coordinates
    const centerScreenX = canvasRect.left + (initialState.cx * displayScale);
    const centerScreenY = canvasRect.top + (initialState.cy * displayScale);
    
    const vx = currentMouse.x - centerScreenX;
    const vy = currentMouse.y - centerScreenY;
    
    const currentAngle = Math.atan2(vy, vx);
    // Add 90 deg (PI/2) because handle starts directly vertical (top)
    let newAngle = currentAngle + Math.PI / 2;
    
    // Normalize to [-PI, PI] range
    if (newAngle > Math.PI) newAngle -= 2 * Math.PI;
    if (newAngle < -Math.PI) newAngle += 2 * Math.PI;
    
    state.angle = newAngle;
    
    // Update angle sidebar slider & badge
    const deg = newAngle * (180 / Math.PI);
    DOM.angleSlider.value = deg;
    DOM.angleInput.value = Math.round(deg * 10) / 10;
    DOM.angleValue.textContent = deg.toFixed(1);
    
    updateUIFromState(false);
    renderPreview();
  }
  else if (interactionType.startsWith('resize-')) {
    const handleName = interactionType.replace('resize-', '');
    
    // Convert screen coordinates to canvas-space coordinates (relative to canvas top-left)
    const mxImg = (currentMouse.x - canvasRect.left) / displayScale;
    const myImg = (currentMouse.y - canvasRect.top) / displayScale;
    
    const cos = Math.cos(initialState.angle);
    const sin = Math.sin(initialState.angle);
    
    // A. EDGE RESIZE MATH (Top, Right, Bottom, Left)
    if (handleName.length === 1) {
      let su = 0, sv = 0;
      if (handleName === 'r') su = 1;
      else if (handleName === 'l') su = -1;
      else if (handleName === 'b') sv = 1;
      else if (handleName === 't') sv = -1;
      
      if (su !== 0) {
        // Anchor is the opposite side center line:
        // Position at (initialState.cx - su * W/2 * cos, initialState.cy - su * W/2 * sin)
        const ax = initialState.cx - su * (initialState.width / 2) * cos;
        const ay = initialState.cy - su * (initialState.width / 2) * sin;
        
        // Vector from anchor to mouse
        const dx = mxImg - ax;
        const dy = myImg - ay;
        
        // Project onto rotated local u-axis
        const du = su * (dx * cos + dy * sin);
        const newWidth = Math.max(MIN_SIZE, du);
        
        state.width = newWidth;
        // Shift center to accommodate width resizing keeping anchor fixed
        state.cx = ax + su * (newWidth / 2) * cos;
        state.cy = ay + su * (newWidth / 2) * sin;
      }
      else if (sv !== 0) {
        // Anchor is the opposite side center line:
        const ax = initialState.cx + sv * (initialState.height / 2) * sin;
        const ay = initialState.cy - sv * (initialState.height / 2) * cos;
        
        const dx = mxImg - ax;
        const dy = myImg - ay;
        
        // Project onto rotated local v-axis
        const dv = sv * (-dx * sin + dy * cos);
        const newHeight = Math.max(MIN_SIZE, dv);
        
        state.height = newHeight;
        state.cx = ax - sv * (newHeight / 2) * sin;
        state.cy = ay + sv * (newHeight / 2) * cos;
      }
    }
    // B. CORNER RESIZE MATH (TL, TR, BR, BL)
    else {
      let su = handleName.includes('r') ? 1 : -1;
      let sv = handleName.includes('b') ? 1 : -1;
      
      // Opposite Corner is the Anchor:
      const ax = initialState.cx - su * (initialState.width / 2) * cos + sv * (initialState.height / 2) * sin;
      const ay = initialState.cy - su * (initialState.width / 2) * sin - sv * (initialState.height / 2) * cos;
      
      // Vector from anchor to mouse
      const dx = mxImg - ax;
      const dy = myImg - ay;
      
      // Projected distances along axes
      const du = su * (dx * cos + dy * sin);
      const dv = sv * (-dx * sin + dy * cos);
      
      if (state.lockAspect) {
        // Find scale based on distance ratios
        const ratio = initialState.width / initialState.height;
        const scaleU = du / initialState.width;
        const scaleV = dv / initialState.height;
        // Use average scale factor
        const scale = Math.max(0.01, (scaleU + scaleV) / 2);
        
        state.width = Math.max(MIN_SIZE, scale * initialState.width);
        state.height = Math.max(MIN_SIZE, scale * initialState.height);
      } else {
        state.width = Math.max(MIN_SIZE, du);
        state.height = Math.max(MIN_SIZE, dv);
      }
      
      // Move center keeping opposite corner anchor fixed
      state.cx = ax + su * (state.width / 2) * cos - sv * (state.height / 2) * sin;
      state.cy = ay + su * (state.width / 2) * sin + sv * (state.height / 2) * cos;
    }
    
    updateUIFromState(true);
    renderPreview();
  }
  
  e.preventDefault();
}

function endInteraction() {
  if (!isInteracting) return;
  
  isInteracting = false;
  interactionType = null;
  
  DOM.cropBox.style.cursor = 'move';
  document.body.style.cursor = 'default';
  
  saveHistoryState();
}

// 6. KEYBOARD CONTROLS FOR PIXEL-PERFECT EDITING
function handleKeyboardShortcuts(e) {
  if (!state.image) return;
  
  // Don't intercept shortcuts when editing input numbers
  if (document.activeElement.tagName === 'INPUT') return;
  
  const step = e.shiftKey ? 10 : 1; // shift for large jump
  const rotateStep = e.shiftKey ? 15 : 1; // shift for 15 deg
  let changed = false;
  
  // Z and Y with Ctrl or Cmd for Undo/Redo
  const isCmdOrCtrl = e.metaKey || e.ctrlKey;
  if (isCmdOrCtrl && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
    return;
  }
  if (isCmdOrCtrl && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
    return;
  }
  
  // Arrow Keys positions
  if (e.key === 'ArrowUp' && !e.altKey) {
    state.cy -= step;
    changed = true;
    e.preventDefault();
  } else if (e.key === 'ArrowDown' && !e.altKey) {
    state.cy += step;
    changed = true;
    e.preventDefault();
  } else if (e.key === 'ArrowLeft' && !e.altKey && !isCmdOrCtrl) {
    state.cx -= step;
    changed = true;
    e.preventDefault();
  } else if (e.key === 'ArrowRight' && !e.altKey && !isCmdOrCtrl) {
    state.cx += step;
    changed = true;
    e.preventDefault();
  }
  
  // Alt + Arrow Keys sizing
  if (e.key === 'ArrowUp' && e.altKey) {
    state.height = Math.max(MIN_SIZE, state.height - 2);
    if (state.lockAspect) {
      state.width = state.height * getAspectNumerical();
    }
    changed = true;
    e.preventDefault();
  } else if (e.key === 'ArrowDown' && e.altKey) {
    state.height = state.height + 2;
    if (state.lockAspect) {
      state.width = state.height * getAspectNumerical();
    }
    changed = true;
    e.preventDefault();
  } else if (e.key === 'ArrowLeft' && e.altKey) {
    state.width = Math.max(MIN_SIZE, state.width - 2);
    if (state.lockAspect) {
      state.height = state.width / getAspectNumerical();
    }
    changed = true;
    e.preventDefault();
  } else if (e.key === 'ArrowRight' && e.altKey) {
    state.width = state.width + 2;
    if (state.lockAspect) {
      state.height = state.width / getAspectNumerical();
    }
    changed = true;
    e.preventDefault();
  }
  
  // Cmd/Ctrl + Arrow Keys rotation
  if (e.key === 'ArrowLeft' && isCmdOrCtrl) {
    let deg = (state.angle * 180 / Math.PI) - rotateStep;
    if (deg < -180) deg += 360;
    state.angle = deg * (Math.PI / 180);
    
    DOM.angleSlider.value = deg;
    DOM.angleInput.value = deg;
    DOM.angleValue.textContent = deg.toFixed(1);
    changed = true;
    e.preventDefault();
  } else if (e.key === 'ArrowRight' && isCmdOrCtrl) {
    let deg = (state.angle * 180 / Math.PI) + rotateStep;
    if (deg > 180) deg -= 360;
    state.angle = deg * (Math.PI / 180);
    
    DOM.angleSlider.value = deg;
    DOM.angleInput.value = deg;
    DOM.angleValue.textContent = deg.toFixed(1);
    changed = true;
    e.preventDefault();
  }
  
  if (changed) {
    updateUIFromState(true);
    renderPreview();
    saveHistoryState();
  }
}

// 7. PREVIEW DRAWING SYSTEM
function renderPreview() {
  if (!state.image) return;
  
  // Determine export sizes (e.g. 1024 or matching selection)
  let destWidth, destHeight;
  const ratio = state.width / state.height;
  
  if (state.exportRes === 'original') {
    destWidth = state.width;
    destHeight = state.height;
  } else if (state.exportRes === 'custom') {
    destWidth = state.exportCustomWidth;
    destHeight = Math.round(destWidth / ratio);
    DOM.exportHeightInput.value = destHeight;
  } else {
    // Presets: 512, 1024, 2048
    destWidth = parseInt(state.exportRes);
    destHeight = Math.round(destWidth / ratio);
  }
  
  // Display dimensions update on preview badge
  DOM.previewDims.textContent = `${Math.round(destWidth)} × ${Math.round(destHeight)}`;
  
  // Draw onto preview canvas
  drawCroppedArea(DOM.previewCanvas, destWidth, destHeight);
}

function updateCustomExportSizes() {
  const ratio = state.width / state.height;
  const h = Math.round(state.exportCustomWidth / ratio);
  state.exportCustomHeight = h;
  DOM.exportHeightInput.value = h;
}

function drawCroppedArea(targetCanvas, destWidth, destHeight) {
  targetCanvas.width = destWidth;
  targetCanvas.height = destHeight;
  const ctx = targetCanvas.getContext('2d');
  
  ctx.clearRect(0, 0, destWidth, destHeight);
  
  // Fill background according to state
  if (state.bgFill === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, destWidth, destHeight);
  } else if (state.bgFill === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, destWidth, destHeight);
  } else if (state.bgFill === 'blur') {
    ctx.save();
    // Heavy canvas blur filter
    ctx.filter = 'blur(24px) brightness(0.65)';
    // Stretch fill complete canvas
    ctx.drawImage(state.image, 0, 0, destWidth, destHeight);
    ctx.restore();
  }
  
  // Center destination context origin
  ctx.save();
  ctx.translate(destWidth / 2, destHeight / 2);
  
  // Rotate negative angle
  ctx.rotate(-state.angle);
  
  // Source image drawing scale mapping
  const scaleX = destWidth / state.width;
  const scaleY = destHeight / state.height;
  ctx.scale(scaleX, scaleY);
  
  // Draw unblurred image centered
  // Image coordinate cx, cy maps to 0,0 of scaled rotated context
  ctx.drawImage(state.image, -state.cx, -state.cy, state.imageWidth, state.imageHeight);
  ctx.restore();
}

// 8. FILE DOWNLOAD EXPORT
function downloadCrop() {
  if (!state.image) return;
  
  const exportCanvas = document.createElement('canvas');
  let destWidth, destHeight;
  const ratio = state.width / state.height;
  
  if (state.exportRes === 'original') {
    destWidth = state.width;
    destHeight = state.height;
  } else if (state.exportRes === 'custom') {
    destWidth = state.exportCustomWidth;
    destHeight = state.exportCustomHeight;
  } else {
    destWidth = parseInt(state.exportRes);
    destHeight = Math.round(destWidth / ratio);
  }
  
  // Draw cropped image onto export canvas
  drawCroppedArea(exportCanvas, destWidth, destHeight);
  
  // Determine file extension
  let ext = 'png';
  if (state.exportFormat === 'image/jpeg') ext = 'jpg';
  else if (state.exportFormat === 'image/webp') ext = 'webp';
  
  const link = document.createElement('a');
  link.download = `spincrop_${Date.now()}.${ext}`;
  link.href = exportCanvas.toDataURL(state.exportFormat, 0.92); // 92% quality for compression
  link.click();
}

// 9. HISTORY MANAGEMENT (UNDO / REDO)
function saveHistoryState() {
  // If user did some modifications after doing undos, discard future stack items
  if (historyIndex < historyStack.length - 1) {
    historyStack.splice(historyIndex + 1);
  }
  
  // Check if state is identical to last state in history to avoid copies
  const lastState = historyStack[historyStack.length - 1];
  if (lastState && 
      lastState.cx === state.cx && 
      lastState.cy === state.cy && 
      lastState.width === state.width && 
      lastState.height === state.height && 
      lastState.angle === state.angle &&
      lastState.lockAspect === state.lockAspect) {
    return;
  }
  
  historyStack.push({
    cx: state.cx,
    cy: state.cy,
    width: state.width,
    height: state.height,
    angle: state.angle,
    lockAspect: state.lockAspect,
    aspectRatio: state.aspectRatio,
  });
  
  if (historyStack.length > MAX_HISTORY) {
    historyStack.shift();
  }
  
  historyIndex = historyStack.length - 1;
  updateHistoryButtons();
}

function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    applyHistoryState(historyStack[historyIndex]);
  }
}

function redo() {
  if (historyIndex < historyStack.length - 1) {
    historyIndex++;
    applyHistoryState(historyStack[historyIndex]);
  }
}

function applyHistoryState(historyItem) {
  state.cx = historyItem.cx;
  state.cy = historyItem.cy;
  state.width = historyItem.width;
  state.height = historyItem.height;
  state.angle = historyItem.angle;
  state.lockAspect = historyItem.lockAspect;
  state.aspectRatio = historyItem.aspectRatio;
  
  // Sync UI Controls
  DOM.lockAspectCheckbox.checked = state.lockAspect;
  DOM.aspectButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ratio === state.aspectRatio);
  });
  
  const deg = state.angle * (180 / Math.PI);
  DOM.angleSlider.value = deg;
  DOM.angleInput.value = Math.round(deg * 10) / 10;
  DOM.angleValue.textContent = deg.toFixed(1);
  
  updateUIFromState(true);
  renderPreview();
  updateHistoryButtons();
}

function updateHistoryButtons() {
  DOM.btnUndo.disabled = (historyIndex <= 0);
  DOM.btnRedo.disabled = (historyIndex >= historyStack.length - 1);
}

// 10. CLIPBOARD INTERACTIONS & TOAST SYSTEM
function handleClipboardPaste(e) {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  let foundImage = false;
  
  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      const blob = item.getAsFile();
      loadImageFromFile(blob);
      foundImage = true;
      showToast('Image pasted from clipboard!');
      break;
    }
  }
  
  if (!foundImage && e.clipboardData.types.includes('text/plain')) {
    // If user pasted something else, don't show error, just let browser default
  }
}

function copyToClipboard() {
  if (!state.image) return;
  
  const exportCanvas = document.createElement('canvas');
  let destWidth, destHeight;
  const ratio = state.width / state.height;
  
  if (state.exportRes === 'original') {
    destWidth = state.width;
    destHeight = state.height;
  } else if (state.exportRes === 'custom') {
    destWidth = state.exportCustomWidth;
    destHeight = state.exportCustomHeight;
  } else {
    destWidth = parseInt(state.exportRes);
    destHeight = Math.round(destWidth / ratio);
  }
  
  // Render cropped image
  drawCroppedArea(exportCanvas, destWidth, destHeight);
  
  // Copy to system clipboard as a PNG blob
  exportCanvas.toBlob((blob) => {
    if (!blob) {
      showToast('Error generating crop blob', true);
      return;
    }
    
    // Write image to clipboard
    const data = [new ClipboardItem({ [blob.type]: blob })];
    
    navigator.clipboard.write(data)
      .then(() => {
        showToast('✓ Cropped image copied to clipboard!');
        
        // Temporarily animate copy button to indicate success
        const prevContent = DOM.btnCopy.innerHTML;
        DOM.btnCopy.classList.add('btn-primary');
        DOM.btnCopy.classList.remove('btn-secondary');
        DOM.btnCopy.innerHTML = `✓ Copied`;
        setTimeout(() => {
          DOM.btnCopy.classList.remove('btn-primary');
          DOM.btnCopy.classList.add('btn-secondary');
          DOM.btnCopy.innerHTML = prevContent;
        }, 1500);
      })
      .catch((err) => {
        console.error('Failed to copy to clipboard: ', err);
        showToast('Clipboard copy failed. Ensure permissions are granted.', true);
      });
  }, 'image/png');
}

// Show premium glassmorphic toast notification
function showToast(message, isError = false) {
  if (!DOM.toastContainer) return;
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  if (isError) toast.className += ' toast-error';
  
  // Inline SVG icons for toast
  const iconHtml = isError 
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 16 16 12 12 8"></polyline><line x1="8" y1="12" x2="16" y2="12"></line></svg>`;
    
  toast.innerHTML = `${iconHtml} <span>${message}</span>`;
  DOM.toastContainer.appendChild(toast);
  
  // Auto remove from DOM after animation completes (3 seconds)
  setTimeout(() => {
    toast.remove();
  }, 3000);
}
