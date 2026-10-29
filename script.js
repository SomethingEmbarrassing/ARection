const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const gallery = document.getElementById('gallery');
const viewer = document.getElementById('viewer');
const cardGrid = document.getElementById('cardGrid');
const regionChips = document.getElementById('regionChips');
const modelViewer = document.getElementById('model');
const viewerTitle = document.getElementById('viewerTitle');
const backBtn = document.getElementById('backBtn');
const qrContainer = document.getElementById('qrContainer');
const loadingOverlay = document.getElementById('loadingOverlay');

let models = [];
let activeRegion = 'All';
let qr = null;

function init() {
  if (typeof MODELS === 'undefined' || !Array.isArray(MODELS) || MODELS.length === 0) {
    cardGrid.innerHTML = '<div class="fallback">Could not load model list (check models.js).</div>';
    return;
  }
  models = MODELS;

  renderChips();
  renderCards();

  // Deep link: ?model=<id> opens the viewer directly (used by QR codes)
  const requested = new URLSearchParams(window.location.search).get('model');
  const match = models.find(m => m.id === requested);
  if (match) {
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
    card.addEventListener('click', () => openViewer(m, true));
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

function showGallery(pushState) {
  viewer.classList.add('hidden');
  gallery.classList.remove('hidden');
  // Release the big model so the gallery stays light on phones
  modelViewer.removeAttribute('src');
  modelViewer.removeAttribute('ios-src');
  if (pushState) {
    history.pushState({}, '', window.location.pathname);
  }
}

backBtn.addEventListener('click', () => showGallery(true));

const helpModal = document.getElementById('helpModal');
document.getElementById('helpBtn').addEventListener('click', () => helpModal.classList.remove('hidden'));
document.getElementById('helpClose').addEventListener('click', () => helpModal.classList.add('hidden'));
helpModal.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.classList.add('hidden'); });

window.addEventListener('popstate', () => {
  const requested = new URLSearchParams(window.location.search).get('model');
  const match = models.find(m => m.id === requested);
  if (match) openViewer(match, false);
  else showGallery(false);
});

modelViewer.addEventListener('load', () => loadingOverlay.classList.add('done'));

init();
