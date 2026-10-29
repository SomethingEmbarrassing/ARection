// ============================================================
// ARection — Spokane Metals LLC 3D Model Viewer
// © 2025-2026 Matt Leon / Spokane Metals LLC. All rights reserved.
// Proprietary. Unauthorized copying or redistribution is prohibited.
// ============================================================

const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Assumes GLB geometry is in meters (real-size AR). If a model is exported in other units, adjust here.
const METERS_PER_FOOT = 0.3048;

const gallery = document.getElementById('gallery');
const viewer = document.getElementById('viewer');
const cardGrid = document.getElementById('cardGrid');
const regionChips = document.getElementById('regionChips');
const modelViewer = document.getElementById('model');
const viewerTitle = document.getElementById('viewerTitle');
const backBtn = document.getElementById('backBtn');
const qrContainer = document.getElementById('qrContainer');
const loadingOverlay = document.getElementById('loadingOverlay');
const arInstructionPanel = document.getElementById('arInstructionPanel');
const floatingLockBtn = document.getElementById('floatingLockBtn');
const panelCloseBtn = document.getElementById('panelCloseBtn');
const instructionText = document.getElementById('instructionText');
const lockIcon = document.getElementById('lockIcon');
const lockText = document.getElementById('lockText');
const anchorScreen = document.getElementById('anchorScreen');
const anchorTitle = document.getElementById('anchorTitle');
const anchorMessage = document.getElementById('anchorMessage');
const startArBtn = document.getElementById('startArBtn');

let models = [];
let activeRegion = 'All';
let qr = null;

// Drawing-anchor state (set only when opened from an erection-drawing QR code)
let isAnchorMode = false;   // true when URL has anchor=origin
let elevationFt = 0;        // level on the drawing, in feet (from z=ft-in.decimal)
let isModelLocked = false;

/**
 * Parse elevation "ft-in.decimal": "45-6.25" = 45 ft 6.25 in. "0-0" = ground.
 * Returns feet as a number.
 */
function parseElevation(str) {
  if (!str) return 0;
  const parts = String(str).split('-');
  const feet = parseFloat(parts[0]) || 0;
  const inches = parts.length > 1 ? (parseFloat(parts[1]) || 0) : 0;
  return feet + inches / 12;
}

/** Read anchor settings from the current URL. */
function readAnchorParams() {
  const params = new URLSearchParams(window.location.search);
  isAnchorMode = params.get('anchor') === 'origin';
  elevationFt = isAnchorMode ? parseElevation(params.get('z')) : 0;
}

function resetAnchorState() {
  isAnchorMode = false;
  elevationFt = 0;
  isModelLocked = false;
}

function init() {
  if (typeof MODELS === 'undefined' || !Array.isArray(MODELS) || MODELS.length === 0) {
    cardGrid.innerHTML = '<div class="fallback">Could not load model list (check models.js).</div>';
    return;
  }
  models = MODELS;

  renderChips();
  renderCards();

  // Deep link: ?model=<id>[&anchor=origin&z=ft-in.decimal]
  const requested = new URLSearchParams(window.location.search).get('model');
  const match = models.find(m => m.id === requested);
  if (match) {
    readAnchorParams();
    openViewer(match, false);
  }
}

function renderChips() {
  const regions = [...new Set(models.map(m => (m.region || '').trim()).filter(Boolean))];
  if (regions.length === 0) {
    regionChips.style.display = 'none';
    return;
  }
  regionChips.innerHTML = '';
  ['All', ...regions].forEach(r => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (r === activeRegion ? ' active' : '');
    chip.type = 'button';
    chip.textContent = r;
    chip.addEventListener('click', () => {
      activeRegion = r;
      renderChips();
      renderCards();
    });
    regionChips.appendChild(chip);
  });
}

function renderCards() {
  cardGrid.innerHTML = '';
  const visible = models.filter(m =>
    activeRegion === 'All' || (m.region || '').trim() === activeRegion);
  visible.forEach(m => {
    const card = document.createElement('button');
    card.className = 'card';
    card.type = 'button';
    // Image thumbnail if provided; otherwise a live 3D preview (heavy on resources — use sparingly)
    const preview = m.image
      ? `<img class="card-preview" src="${encodeURI(m.image)}" alt="${m.name}" loading="lazy">`
      : `<model-viewer
          class="card-preview"
          src="${encodeURI(m.glb)}"
          loading="lazy"
          reveal="auto"
          auto-rotate
          disable-zoom
          interaction-prompt="none"
          environment-image="neutral"
          alt="Preview of ${m.name}">
        </model-viewer>`;
    card.innerHTML = `
      ${preview}
      <div class="card-body">
        <span class="card-title">${m.name}</span>
        <span class="card-desc">${m.description || ''}</span>
        ${m.region ? `<span class="card-region">${m.region}</span>` : ''}
      </div>`;
    card.addEventListener('click', () => {
      resetAnchorState();
      openViewer(m, true);
    });
    cardGrid.appendChild(card);
  });
}

function openViewer(m, pushState) {
  viewerTitle.textContent = m.name;
  loadingOverlay.classList.remove('done');

  modelViewer.setAttribute('src', m.glb);
  if (m.usdz) modelViewer.setAttribute('ios-src', m.usdz);
  else modelViewer.removeAttribute('ios-src');
  modelViewer.setAttribute('scale', m.scale || '1 1 1');
  modelViewer.setAttribute('alt', `3D model of ${m.name}`);

  gallery.classList.add('hidden');
  viewer.classList.remove('hidden');

  const base = (typeof YOUR_PUBLIC_URL !== 'undefined' && YOUR_PUBLIC_URL)
    ? YOUR_PUBLIC_URL
    : window.location.origin + window.location.pathname;
  const deepLink = `${base}${base.includes('?') ? '&' : '?'}model=${encodeURIComponent(m.id)}`;

  if (pushState) {
    history.pushState({ model: m.id }, '', `?model=${encodeURIComponent(m.id)}`);
  }

  // Erection-drawing QR: go straight to a phone-only AR start screen (no 3D preview)
  if (isAnchorMode) {
    setupAnchorScreen(m);
  } else {
    anchorScreen.classList.add('hidden');
  }

  // Drawing-anchor UI (lock button + instructions) only when opened from an erection-drawing QR
  if (isAnchorMode) {
    modelViewer.removeAttribute('auto-rotate'); // no spinning while aligning to paper
    arInstructionPanel.classList.add('visible');
    floatingLockBtn.classList.add('visible');
  } else {
    modelViewer.setAttribute('auto-rotate', '');
    arInstructionPanel.classList.remove('visible');
    floatingLockBtn.classList.remove('visible');
  }
  applyLockState();

  if (!isMobile) {
    qrContainer.style.display = 'flex';
    if (qr) {
      qr.value = deepLink;
    } else {
      qr = new QRious({
        element: document.getElementById('qrcode'),
        value: deepLink,
        size: 180,
        background: 'white',
        foreground: 'black',
      });
    }
  }

  if (!modelViewer.canActivateAR && !viewer.querySelector('.fallback')) {
    const fallback = document.createElement('div');
    fallback.className = 'fallback';
    fallback.textContent = 'AR is not supported on this device.';
    viewer.appendChild(fallback);
  }
}

/** Phone-only start screen for erection-drawing QR codes. */
function setupAnchorScreen(m) {
  anchorTitle.textContent = m.name;
  anchorScreen.classList.remove('hidden');
  anchorMessage.textContent = '';
  startArBtn.disabled = false;

  if (!isMobile) {
    anchorMessage.textContent = 'Scan this code with your phone to open AR.';
    startArBtn.disabled = true;
  } else if (!modelViewer.canActivateAR) {
    anchorMessage.textContent = 'AR is not supported on this device.';
    startArBtn.disabled = true;
  }
}

startArBtn.addEventListener('click', async () => {
  anchorScreen.classList.add('hidden');
  try {
    await modelViewer.activateAR();
  } catch (err) {
    anchorScreen.classList.remove('hidden');
    anchorMessage.textContent = 'Could not start AR. Try again.';
  }
});

function showGallery(pushState) {
  viewer.classList.add('hidden');
  gallery.classList.remove('hidden');
  resetAnchorState();
  // Release the big model so the gallery stays light on phones
  modelViewer.removeAttribute('src');
  modelViewer.removeAttribute('ios-src');
  if (pushState) {
    history.pushState({}, '', window.location.pathname);
  }
}

/**
 * Lock/unlock works in both the 3D preview and the AR session:
 * - interaction-policy="none" stops orbit/pan/zoom in the 3D preview.
 * - ar-scale="fixed" stops pinch-resize in WebXR AR.
 * Rotation lock in AR is best-effort; see notes in the README.
 */
function applyLockState() {
  modelViewer.setAttribute('interaction-policy', isModelLocked ? 'none' : 'always-allow');
  modelViewer.setAttribute('ar-scale', isModelLocked ? 'fixed' : 'auto');

  if (isModelLocked) {
    lockIcon.textContent = '🔓';
    lockText.textContent = 'Unlock';
    floatingLockBtn.classList.add('locked');
    instructionText.textContent = 'Locked. Tap Unlock to adjust.';
  } else {
    lockIcon.textContent = '🔒';
    lockText.textContent = 'Lock';
    floatingLockBtn.classList.remove('locked');
    instructionText.textContent = 'Rotate & zoom to align, then Lock.';
  }
}

/**
 * Shift the model so the drawing's level sits at paper height.
 * Model geometry is in true elevation (0 = ground), so the model moves DOWN by the level.
 * Example: z=45-6.25 on a 10-story tower puts the 45'-6.25" level flush with the sheet.
 * Note: applied to the Three.js root after load. If a viewer resets the root position,
 * the fallback is to bake the offset into the GLB (translate -elevation in Blender).
 */
function applyElevation() {
  const root = modelViewer.model;
  if (!root) return;
  root.position.y = -(elevationFt * METERS_PER_FOOT);
}

// Event listeners
backBtn.addEventListener('click', () => showGallery(true));
floatingLockBtn.addEventListener('click', () => {
  isModelLocked = !isModelLocked;
  applyLockState();
});
panelCloseBtn.addEventListener('click', () => {
  arInstructionPanel.classList.remove('visible');
});

const helpModal = document.getElementById('helpModal');
document.getElementById('helpBtn').addEventListener('click', () => helpModal.classList.remove('hidden'));
document.getElementById('helpClose').addEventListener('click', () => helpModal.classList.add('hidden'));
helpModal.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.classList.add('hidden'); });

window.addEventListener('popstate', () => {
  const requested = new URLSearchParams(window.location.search).get('model');
  const match = models.find(m => m.id === requested);
  if (match) {
    readAnchorParams();
    openViewer(match, false);
  } else {
    showGallery(false);
  }
});

modelViewer.addEventListener('load', () => {
  loadingOverlay.classList.add('done');
  applyElevation();
});

init();
