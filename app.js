(() => {
  'use strict';

  const memories = Array.isArray(window.MEMORIES) ? window.MEMORIES.slice() : [];
  const viewport = document.querySelector('#memory-viewport');
  const world = document.querySelector('#memory-world');
  const gallery = document.querySelector('#memory-gallery');
  const domeRoot = document.querySelector('#photo-dome');
  const dome = new window.DomePhotoSpace(domeRoot, (id, button, event) => focusPhoto(id, button, event));
  const spaceLayoutSwitch = document.querySelector('#space-layout-switch');
  const spaceLayoutButtons = [...spaceLayoutSwitch.querySelectorAll('button')];
  const filterBar = document.querySelector('#year-filter');
  const search = document.querySelector('#memory-search');
  const emptyState = document.querySelector('#empty-state');
  const totalLabel = document.querySelector('#photo-total');
  const rangeLabel = document.querySelector('#date-range');
  const resetButton = document.querySelector('#reset-view');
  const randomMemoryButton = document.querySelector('#random-memory');
  const zoomInButton = document.querySelector('#zoom-in');
  const zoomOutButton = document.querySelector('#zoom-out');
  const spaceEnd = document.querySelector('#space-end');
  const tourControls = document.querySelector('#tour-controls');
  const tourPlay = document.querySelector('#tour-play');
  const tourProgress = document.querySelector('#tour-progress');
  const tourSpeedButtons = [...document.querySelectorAll('[data-tour-rate]')];
  const exitFocusButton = document.querySelector('#exit-focus');
  const photoDetail = document.querySelector('#photo-detail');
  const photoStory = new window.PhotoStory(document.querySelector('#photo-story'));
  const photoDetailBody = photoDetail.querySelector('.photo-detail-body');
  const photoSpread = document.querySelector('#photo-detail-spread');
  const photoStage = document.querySelector('#photo-detail-stage');
  let detailImage = document.querySelector('#photo-detail-image');
  const detailDate = document.querySelector('#photo-detail-date');
  const detailCount = document.querySelector('#photo-detail-count');
  const sameDayPhotos = document.querySelector('#same-day-photos');
  const sameDayList = document.querySelector('#same-day-photo-list');
  const photoOverlap = document.querySelector('#photo-overlap');
  const overlapList = document.querySelector('#photo-overlap-list');
  const previousPhotoButton = document.querySelector('#photo-prev');
  const nextPhotoButton = document.querySelector('#photo-next');
  const identity = document.querySelector('.identity');
  const modeSwitch = document.querySelector('.mode-switch');
  const modeToggle = document.querySelector('#mode-toggle');
  const modeCurrent = document.querySelector('#mode-current');
  const modeOptions = document.querySelector('#mode-options');
  const spaceModeButton = document.querySelector('#mode-space');
  const depthModeButton = document.querySelector('#mode-depth');
  const ringModeButton = document.querySelector('#mode-ring');
  const listModeButton = document.querySelector('#mode-list');
  const tourModeButton = document.querySelector('#mode-tour');
  const sideModeButton = document.querySelector('#mode-side');
  const depthView = document.querySelector('#depth-view');
  const ringView = document.querySelector('#ring-view');
  const listView = document.querySelector('#list-view');
  const listScroll = document.querySelector('#photo-list-scroll');
  const listGrid = document.querySelector('#photo-list-grid');
  const listCount = document.querySelector('#photo-list-count');
  const jumpToLastButton = document.querySelector('#jump-to-last-photo');
  const depthCarousel = new window.DepthCarousel(depthView, openScenePhoto);
  const circularGallery = new window.CircularGallery(ringView, openScenePhoto);
  const modeButtons = { space: spaceModeButton, depth: depthModeButton, ring: ringModeButton, list: listModeButton, tour: tourModeButton, side: sideModeButton };
  const carousels = { depth: depthCarousel, ring: circularGallery };

  const WORLD = { width: 2800, height: 1900 };
  const PERSPECTIVE = 1500;
  const OPENING_DEPTH = -60;
  const NEAR_FADE_START = 650;
  const PASSED_DEPTH = 1100;
  const ADDED_LAYER_SIZE = 24;
  const DRAG_THRESHOLD = 8;
  const IMAGE_REFRESH_INTERVAL = 64;
  const MAX_IMAGE_UPGRADES = 4;
  const TOUR_DURATION = 24_000;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const view = { x: 0, y: 0, z: OPENING_DEPTH, scale: 0.5, yaw: 0, pivotZ: 0 };
  const pointers = new Map();
  const cards = new Map();
  const listCards = new Map();
  let listedPhotos = null;
  let activeYear = 'all';
  let filtered = memories.slice();
  let activeFocusId = null;
  let detailPhotos = null;
  let lastViewedPhotoId = null;
  let lastRandomPhotoId = null;
  let focusOrigin = null;
  let photoTapPoint = null;
  let photoSwipe = null;
  let photoEntrance = null;
  let sceneEndDepth = PASSED_DEPTH + 360;
  let didDrag = false;
  let lastPointer = null;
  let pinchStart = null;
  let cameraFrame = 0;
  let cameraRevision = 0;
  let imageRefreshTimer = 0;
  let imageUpgrades = 0;
  let zoomAnchor = null;
  let activeMode = 'space';
  let spaceLayout = 'floating';
  let tourPath = null;
  let tourElapsed = 0;
  let tourRate = 1;
  let tourStartedAt = null;
  let tourFrame = 0;
  const storyBackup = new window.StoryBackup(memories, restored => {
    const item = focusedPhoto();
    if (item && restored.has(window.PhotoStoryStore.identityFor(item))) photoStory.setPhoto(item);
  });
  const photoImport = new window.PhotoImport(addLocalPhotos, showLocalPhoto);
  const photoTrash = new window.PhotoTrash(memories, refreshAlbum);
  document.querySelector('#delete-photo').addEventListener('click', () => {
    const item = focusedPhoto();
    if (item) photoTrash.confirmDelete(item);
  });

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function isPhotoScene() {
    return activeMode === 'space' || isTourMode();
  }

  function isDomeActive() {
    return activeMode === 'space' && spaceLayout === 'dome';
  }

  function isTourMode(mode = activeMode) {
    return mode === 'tour' || mode === 'side';
  }

  function seededNumber(seed) {
    let value = seed >>> 0;
    value += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  function parseId(item) {
    if (item.storyKey) return Number.parseInt(item.id.slice(6, 14), 16) || 1;
    return Number(item.id.replace(/\D/g, '')) || 1;
  }

  function updateYearRange() {
    const years = availablePhotos().map(item => Number(item.year)).filter(Boolean);
    rangeLabel.textContent = years.length ? `${Math.min(...years)} — ${Math.max(...years)}` : '—';
  }

  function availablePhotos() {
    return memories.filter(item => !photoTrash.isDeleted(item));
  }

  function refreshAlbum() {
    if (activeYear !== 'all' && !availablePhotos().some(item => String(item.year) === activeYear)) {
      activeYear = 'all';
    }
    updateYearRange();
    createFilters();
    applyFilter();
  }

  function addLocalPhotos(records) {
    const knownIds = new Set(memories.map(item => item.id));
    let changed = false;
    for (const photo of records) {
      if (knownIds.has(photo.id)) continue;
      memories.push({
        ...photo,
        storyKey: photo.id,
        thumb: URL.createObjectURL(photo.thumb),
        full: URL.createObjectURL(photo.full),
        zoom: photo.zoom ? URL.createObjectURL(photo.zoom) : null,
      });
      knownIds.add(photo.id);
      changed = true;
    }
    if (!changed) return;
    memories.sort((first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id));
    refreshAlbum();
  }

  function showLocalPhoto(id) {
    exitFocus(false);
    if (activeYear !== 'all' || search.value) {
      activeYear = 'all';
      search.value = '';
      createFilters();
      applyFilter();
    }
    setMode('list');
    alignModeWithPhoto(id);
    listCards.get(id)?.focus({ preventScroll: true });
  }

  function formatDate(date) {
    const [year, month, day] = date.split('-');
    return `${year}.${month}.${day}`;
  }

  function setView(next) {
    Object.assign(view, next);
    updateCardVisibility();
    applyTransform();
  }

  function updateCardVisibility() {
    let sceneryAhead = false;
    const radians = view.yaw * Math.PI / 180;
    const sine = Math.sin(radians);
    const cosine = Math.cos(radians);
    const axisX = view.yaw ? view.x - viewport.clientWidth / 2 : 0;
    cards.forEach((card) => {
      const centerX = (card.layout.x + card.layout.width / 2) * view.scale + axisX;
      const depth = view.z + view.pivotZ + (card.layout.z - view.pivotZ) * cosine - centerX * sine;
      const ahead = depth < PASSED_DEPTH;
      const fade = 1 - clamp((depth - NEAR_FADE_START) / (PASSED_DEPTH - NEAR_FADE_START), 0, 1);
      const clarity = card.layout.opacity + (1 - card.layout.opacity) * clamp(depth / 400, 0, 1);
      card.element.style.opacity = String(clarity * fade);
      card.element.style.visibility = ahead ? 'visible' : 'hidden';
      card.element.style.pointerEvents = fade < 0.18 ? 'none' : '';
      sceneryAhead ||= ahead;
    });
    spaceEnd.hidden = !cards.size || sceneryAhead;
  }

  function applyTransform() {
    if (view.yaw) {
      const x = viewport.clientWidth / 2;
      const y = viewport.clientHeight / 2;
      world.style.transform = [
        `translate3d(${x}px, ${y}px, ${view.z + view.pivotZ}px)`,
        `rotateY(${view.yaw}deg)`,
        `translate3d(${view.x - x}px, ${view.y - y}px, ${-view.pivotZ}px)`,
        `scale(${view.scale})`,
      ].join(' ');
    } else {
      world.style.transform = `translate3d(${view.x}px, ${view.y}px, ${view.z}px) scale(${view.scale})`;
    }
    scheduleImageRefresh();
  }

  function scheduleImageRefresh() {
    if (imageRefreshTimer || !isPhotoScene() || isDomeActive() || activeFocusId) return;
    imageRefreshTimer = window.setTimeout(() => {
      imageRefreshTimer = 0;
      refreshVisibleImages();
    }, IMAGE_REFRESH_INTERVAL);
  }

  function refreshVisibleImages() {
    if (!isPhotoScene() || isDomeActive() || activeFocusId) return;
    const bounds = viewport.getBoundingClientRect();
    const anchor = zoomAnchor ?? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    const pixelRatio = window.devicePixelRatio || 1;
    const candidates = [];
    for (const card of cards.values()) {
      if (!card.restoreImage && Number(card.element.style.opacity) < 0.2) continue;
      const quality = card.image.dataset.quality;
      if (quality === 'full' && !card.item.zoom) continue;
      const rect = card.element.getBoundingClientRect();
      const inView = Number(card.element.style.opacity) >= 0.2
        && rect.right > bounds.left - 80 && rect.left < bounds.right + 80
        && rect.bottom > bounds.top - 80 && rect.top < bounds.bottom + 80;
      if (inView && card.image.loading === 'lazy') card.image.loading = 'eager';
      const displayedPixels = Math.max(rect.width, rect.height) * pixelRatio;
      if (card.restoreImage && (!inView || displayedPixels < 900)) {
        card.image.replaceWith(card.restoreImage);
        card.image = card.restoreImage;
        card.restoreImage = null;
      }
      if (!inView || card.upgrading || quality === 'zoom') continue;
      const useZoom = displayedPixels >= 1300 && card.item.zoom && !card.zoomUnavailable;
      const needsFull = displayedPixels >= 360 && quality === 'thumb' && !card.fullUnavailable;
      if (useZoom || needsFull) {
        const dx = Math.max(rect.left - anchor.x, anchor.x - rect.right, 0);
        const dy = Math.max(rect.top - anchor.y, anchor.y - rect.bottom, 0);
        candidates.push({ card, quality: needsFull ? 'full' : 'zoom', distance: Math.hypot(dx, dy) });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const { card, quality } of candidates.slice(0, MAX_IMAGE_UPGRADES - imageUpgrades)) {
      upgradeImage(card, quality);
    }
  }

  async function upgradeImage(card, quality) {
    card.upgrading = true;
    imageUpgrades++;
    const nextImage = new Image();
    nextImage.alt = card.image.alt;
    nextImage.draggable = false;
    nextImage.decoding = 'async';
    nextImage.dataset.quality = quality;
    nextImage.src = card.item[quality];
    try {
      await nextImage.decode();
      if (!card.element.isConnected) return;
      if (quality === 'zoom') card.restoreImage = card.image;
      card.image.replaceWith(nextImage);
      card.image = nextImage;
    } catch {
      if (quality === 'zoom') card.zoomUnavailable = true;
      else card.fullUnavailable = true;
    } finally {
      card.upgrading = false;
      imageUpgrades--;
      scheduleImageRefresh();
    }
  }

  function stopCameraAnimation() {
    cancelAnimationFrame(cameraFrame);
    cameraFrame = 0;
    cameraRevision++;
  }

  function interpolateView(from, to, progress) {
    const mix = key => from[key] + (to[key] - from[key]) * progress;
    return {
      x: mix('x'), y: mix('y'), z: mix('z'),
      scale: mix('scale'), yaw: mix('yaw'), pivotZ: mix('pivotZ'),
    };
  }

  function animateView(next, { duration = 620, ease = progress => 1 - (1 - progress) ** 3, onComplete } = {}) {
    stopCameraAnimation();
    const revision = cameraRevision;
    if (reducedMotion.matches) {
      setView(next);
      onComplete?.(revision);
      return;
    }
    const from = { ...view };
    const start = performance.now();
    const frame = now => {
      const progress = clamp((now - start) / duration, 0, 1);
      setView(interpolateView(from, next, ease(progress)));
      if (progress < 1) cameraFrame = requestAnimationFrame(frame);
      else {
        cameraFrame = 0;
        onComplete?.(revision);
      }
    };
    cameraFrame = requestAnimationFrame(frame);
  }

  function createFilters() {
    const photos = availablePhotos();
    const years = [...new Set(photos.map((item) => String(item.year)))].sort();
    const options = [{ value: 'all', label: '全部', count: photos.length }].concat(
      years.map((year) => ({
        value: year,
        label: year,
        count: photos.filter((item) => String(item.year) === year).length,
      }))
    );

    filterBar.replaceChildren(...options.map((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.year = option.value;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(option.value === activeYear));
      button.innerHTML = `${option.label}<span>${option.count}</span>`;
      button.addEventListener('click', () => {
        activeYear = option.value;
        filterBar.querySelectorAll('button').forEach((item) => {
          item.setAttribute('aria-selected', String(item.dataset.year === activeYear));
        });
        applyFilter();
      });
      return button;
    }));
  }

  function layoutItems(items) {
    const originals = items.filter(item => !item.storyKey);
    if (!originals.length || originals.length === items.length) return layoutLayer(items);
    const additions = items.filter(item => item.storyKey).sort((a, b) =>
      (a.addedAt ?? 0) - (b.addedAt ?? 0) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
    );
    const layouts = layoutLayer(originals);
    for (let offset = 0; offset < additions.length; offset += ADDED_LAYER_SIZE) {
      const depthIndex = offset / ADDED_LAYER_SIZE + 1;
      layouts.push(...layoutLayer(additions.slice(offset, offset + ADDED_LAYER_SIZE), depthIndex));
    }
    return layouts;
  }

  function layoutLayer(items, depthIndex = 0) {
    const layers = items.map((_, index) =>
      depthIndex ? 'far' : index % 9 === 0 ? 'near' : index % 4 === 1 ? 'middle' : 'far'
    );
    const counts = {
      near: layers.filter((layer) => layer === 'near').length,
      middle: layers.filter((layer) => layer === 'middle').length,
      far: layers.filter((layer) => layer === 'far').length,
    };
    const positions = { near: 0, middle: 0, far: 0 };

    return items.map((item, index) => {
      const seed = parseId(item);
      const layer = layers[index];
      const position = positions[layer]++;
      const count = counts[layer];
      const columns = Math.max(1, Math.ceil(Math.sqrt(count * 1.45)));
      const rows = Math.max(1, Math.ceil(count / columns));
      const col = position % columns;
      const row = Math.floor(position / columns);
      const marginX = items.length < 10 ? 650 : 150;
      const marginY = items.length < 10 ? 450 : 145;
      const cellWidth = (WORLD.width - marginX * 2) / columns;
      const cellHeight = (WORLD.height - marginY * 2) / rows;
      const featured = layer === 'near';
      const portrait = item.height > item.width * 1.12;
      const landscape = item.width > item.height * 1.18;
      const base = depthIndex ? 178 + seededNumber(seed * 7) * 55
        : layer === 'near'
        ? 225 + seededNumber(seed * 7) * 70
        : layer === 'middle'
          ? 155 + seededNumber(seed * 7) * 55
          : 105 + seededNumber(seed * 7) * 48;
      let width = base;
      let height = base;

      if (portrait) {
        width *= 0.78;
        height *= 1.17;
      } else if (landscape) {
        width *= 1.22;
        height *= 0.78;
      }

      const wave = Math.sin((col / columns) * Math.PI * 2 + row * 0.9) * cellHeight * 0.12;
      const x = marginX + (col + 0.5) * cellWidth
        + (seededNumber(seed * 13) - 0.5) * cellWidth * 0.58 - width / 2;
      const y = marginY + (row + 0.5) * cellHeight + wave
        + (seededNumber(seed * 29) - 0.5) * cellHeight * 0.5 - height / 2;
      const z = depthIndex ? -1370 - (depthIndex - 1) * 620 - position * 8
        : layer === 'near'
        ? 190 + seededNumber(seed * 67) * 150
        : layer === 'middle'
          ? -160 + seededNumber(seed * 67) * 220
          : -850 + seededNumber(seed * 67) * 480;
      const rotation = (seededNumber(seed * 41) - 0.5) * (featured ? 8 : 13);
      const tiltX = (seededNumber(seed * 73) - 0.5) * 10;
      const tiltY = (seededNumber(seed * 83) - 0.5) * 16;
      const opacity = layer === 'far' ? 0.82 : layer === 'middle' ? 0.94 : 1;

      return { item, x, y, z, width, height, rotation, tiltX, tiltY, opacity, featured, layer, depthIndex };
    });
  }

  function renderGallery() {
    emptyState.hidden = filtered.length > 0;
    randomMemoryButton.disabled = !filtered.length;
    cards.clear();
    const fragment = document.createDocumentFragment();

    const layouts = layoutItems(filtered);
    const furthestZ = layouts.reduce((furthest, item) => Math.min(furthest, item.z), 0);
    sceneEndDepth = PASSED_DEPTH - furthestZ + 360;
    layouts.forEach((layout, index) => {
      const { item, x, y, z, width, height, rotation, tiltX, tiltY, opacity, featured, layer } = layout;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `memory-card is-${layer}${featured ? ' is-featured' : ''}`;
      button.dataset.id = item.id;
      button.setAttribute('aria-label', `靠近 ${formatDate(item.date)} 的照片`);
      button.style.width = `${width}px`;
      button.style.height = `${height}px`;
      button.style.opacity = String(opacity);
      button.style.zIndex = String(1 + Math.round(z - furthestZ));
      button.style.setProperty('--space-x', `${x}px`);
      button.style.setProperty('--space-y', `${y}px`);
      button.style.setProperty('--space-z', `${z}px`);
      button.style.setProperty('--rotation', `${rotation.toFixed(2)}deg`);
      button.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`);
      button.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`);

      const image = document.createElement('img');
      image.src = item.thumb;
      image.alt = '';
      image.dataset.quality = 'thumb';
      image.loading = featured || z > 240 ? 'eager' : 'lazy';
      image.decoding = 'async';

      const date = document.createElement('time');
      date.dateTime = item.date;
      date.textContent = formatDate(item.date);

      button.append(image, date);
      cards.set(item.id, { element: button, image, item, layout, index });
      fragment.append(button);
    });

    gallery.replaceChildren(fragment);
    totalLabel.textContent = `${filtered.length} 张空间记忆`;
    updateCardVisibility();
  }

  function applyFilter() {
    exitFocus(false);
    lastViewedPhotoId = null;
    const query = search.value.trim().toLowerCase();
    filtered = availablePhotos().filter((item) => {
      const yearMatches = activeYear === 'all' || String(item.year) === activeYear;
      const queryMatches = !query || item.date.includes(query) || item.name.toLowerCase().includes(query);
      return yearMatches && queryMatches;
    });
    renderGallery();
    if (isDomeActive()) dome.setItems(filtered);
    if (activeMode === 'list') renderPhotoList();
    depthCarousel.setItems(filtered);
    circularGallery.setItems(filtered);
    if (isTourMode()) prepareTour(false);
    else if (filtered.length >= 20) showOpeningView();
    else fitView();
  }

  function renderPhotoList() {
    if (listedPhotos === filtered) return;
    listedPhotos = filtered;
    listCards.clear();
    const fragment = document.createDocumentFragment();
    for (const item of filtered) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'photo-list-card';
      button.dataset.id = item.id;
      const image = document.createElement('img');
      image.src = item.thumb;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      const date = document.createElement('time');
      date.dateTime = item.date;
      date.textContent = formatDate(item.date);
      button.setAttribute('aria-label', `查看 ${date.textContent} 的照片`);
      button.append(image, date);
      button.addEventListener('click', () => focusPhoto(item.id, button));
      fragment.append(button);
      listCards.set(item.id, button);
    }
    listGrid.replaceChildren(fragment);
    listCount.textContent = `${filtered.length} 张照片`;
    jumpToLastButton.disabled = !filtered.length;
    listScroll.scrollTop = 0;
  }

  function setMode(mode) {
    if (mode === activeMode) return;
    stopCameraAnimation();
    const previousMode = activeMode;
    const wasTour = isTourMode(previousMode);
    if (wasTour) pauseTour();
    const currentCarousel = carousels[activeMode];
    const currentPhotoId = activeFocusId ?? (currentCarousel ? filtered[currentCarousel.currentIndex]?.id : lastViewedPhotoId);
    activeMode = mode;
    const isDepth = mode === 'depth';
    const isRing = mode === 'ring';
    const isList = mode === 'list';
    const isTour = isTourMode();
    viewport.classList.toggle('is-depth-mode', isDepth);
    viewport.classList.toggle('is-ring-mode', isRing);
    viewport.classList.toggle('is-list-mode', isList);
    viewport.classList.toggle('is-tour-mode', isTour);
    depthView.hidden = !isDepth;
    ringView.hidden = !isRing;
    listView.hidden = !isList;
    syncBackgroundInteraction();
    for (const [name, button] of Object.entries(modeButtons)) {
      button.setAttribute('aria-pressed', String(name === mode));
    }
    const name = modeButtons[mode].textContent;
    modeCurrent.textContent = name;
    modeToggle.setAttribute('aria-label', `观看模式，当前为${name}`);
    const labels = {
      space: '可拖动和缩放的大学回忆照片空间',
      depth: '可左右拖动切换的立体叠影照片',
      ring: '可左右拖动浏览的环形照片画廊',
      list: '按时间排列的大学回忆照片',
      tour: '从中央向下靠近照片的自动巡览',
      side: '从侧面斜向靠近照片的自动巡览',
    };
    viewport.setAttribute('aria-label', labels[mode]);
    carousels[mode]?.resize();
    if (isList) renderPhotoList();
    if (isTour) prepareTour(!activeFocusId && !reducedMotion.matches);
    else {
      updateTourControls();
      if (wasTour) setView({ yaw: 0, pivotZ: 0 });
      if (!(wasTour && mode === 'space') && mode !== focusOrigin?.mode) alignModeWithPhoto(currentPhotoId);
    }
    scheduleImageRefresh();
  }

  function syncBackgroundInteraction() {
    const domeActive = isDomeActive();
    viewport.classList.toggle('is-dome-layout', domeActive);
    spaceLayoutSwitch.hidden = activeMode !== 'space';
    world.setAttribute('aria-hidden', String(!isPhotoScene() || domeActive));
    gallery.inert = !isPhotoScene() || domeActive || Boolean(activeFocusId);
    if (domeActive) dome.setItems(filtered);
    dome.setActive(domeActive);
    domeRoot.inert = Boolean(activeFocusId);
    if (domeActive && activeFocusId) dome.stop();
    zoomInButton.setAttribute('aria-label', domeActive ? '放大球幕' : '向前穿行');
    zoomOutButton.setAttribute('aria-label', domeActive ? '缩小球幕' : '向后退回');
    depthView.inert = Boolean(activeFocusId);
    ringView.inert = Boolean(activeFocusId);
    listView.inert = Boolean(activeFocusId);
    filterBar.hidden = Boolean(activeFocusId);
  }

  function setSpaceLayout(layout) {
    if (spaceLayout === layout) return;
    stopCameraAnimation();
    spaceLayout = layout;
    for (const button of spaceLayoutButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.spaceLayout === layout));
    }
    syncBackgroundInteraction();
    scheduleImageRefresh();
  }

  function alignModeWithPhoto(id) {
    const index = filtered.findIndex((item) => item.id === id);
    if (index < 0) return;
    const carousel = carousels[activeMode];
    if (carousel) {
      carousel.select(index);
    } else if (activeMode === 'list') {
      listCards.get(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      lastViewedPhotoId = id;
    } else if (isDomeActive()) {
      dome.pointAt(id);
      lastViewedPhotoId = id;
    } else {
      const { layout } = cards.get(id);
      stopCameraAnimation();
      setView(viewCenteredOn(layout, layout.depthIndex ? 400 : 200));
      lastViewedPhotoId = id;
    }
  }

  function viewCenteredOn(layout, approachDepth) {
    return {
      x: viewport.clientWidth / 2 - (layout.x + layout.width / 2) * view.scale,
      y: viewport.clientHeight / 2 - (layout.y + layout.height / 2) * view.scale,
      z: Math.max(OPENING_DEPTH, approachDepth - layout.z),
      scale: view.scale,
      yaw: 0,
      pivotZ: 0,
    };
  }

  function loadDetailImage(src) {
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    return image.decode().then(() => image);
  }

  function displayPreparedImage(image) {
    image.id = detailImage.id;
    image.alt = detailImage.alt;
    image.draggable = false;
    image.dataset.fixedRatio = '';
    detailImage.replaceWith(image);
    detailImage = image;
  }

  function showRandomMemory() {
    if (!filtered.length) return;
    const choices = filtered.filter(item => item.id !== lastRandomPhotoId && item.id !== activeFocusId);
    const pool = choices.length ? choices : filtered.filter(item => item.id !== lastRandomPhotoId);
    const eligible = pool.length ? pool : filtered;
    const { identityFor, readDetails } = window.PhotoStoryStore;
    const withStories = eligible.filter(item => {
      try {
        return Boolean(readDetails(identityFor(item)).story.trim());
      } catch {
        return false;
      }
    });
    const candidates = withStories.length ? withStories : eligible;
    const item = candidates[Math.floor(Math.random() * candidates.length)];
    const card = cards.get(item.id);
    if (!card) return;

    let fullImage;
    const full = loadDetailImage(item.full).then(image => {
      fullImage = image;
      return image;
    });
    const ready = Promise.any([full, loadDetailImage(item.thumb)]).catch(() => null);
    const startFromOverview = activeMode !== 'space' || !spaceEnd.hidden;
    exitFocus(false);
    setMode('space');
    const reveal = async (origin, stillCurrent) => {
      const image = fullImage ?? await ready;
      if (!stillCurrent() || activeMode !== 'space' || activeFocusId || cards.get(item.id) !== card
        || storyBackup.isOpen || photoImport.isOpen || photoTrash.isOpen) return;
      lastRandomPhotoId = item.id;
      if (!image) {
        photoTrash.announce('这张照片暂时无法加载，可以再随机选一张。');
        return;
      }
      focusPhoto(item.id, origin, undefined, filtered, image);
      if (image !== fullImage) {
        full.then(sharp => {
          if (detailImage === image && activeFocusId === item.id && 'fixedRatio' in image.dataset) {
            displayPreparedImage(sharp);
          }
        }, () => {});
      }
    };
    if (isDomeActive()) {
      dome.pointAt(item.id, reveal);
      return;
    }
    if (startFromOverview) showOpeningView();
    const depth = card.layout.z + view.z;
    animateView(viewCenteredOn(card.layout, Math.max(560, Math.min(620, depth))), {
      duration: 1150,
      ease: progress => progress * progress * (3 - 2 * progress),
      onComplete: revision => reveal(card.element, () => revision === cameraRevision && !isDomeActive()),
    });
  }

  function overviewView(framing = 1) {
    const bounds = viewport.getBoundingClientRect();
    const padding = window.innerWidth < 600 ? 28 : 84;
    const scale = clamp(Math.min(
      (bounds.width - padding) / WORLD.width,
      (bounds.height - padding) / WORLD.height
    ), window.innerWidth < 600 ? 0.3 : 0.14, 0.7) * framing;
    return {
      x: (bounds.width - WORLD.width * scale) / 2,
      y: (bounds.height - WORLD.height * scale) / 2,
      z: OPENING_DEPTH,
      scale,
      yaw: 0,
      pivotZ: 0,
    };
  }

  function fitView(animate = false, framing = 1) {
    const next = overviewView(framing);
    if (animate) animateView(next);
    else {
      stopCameraAnimation();
      setView(next);
    }
  }

  function travelAt(nextDepth, clientX, clientY) {
    stopCameraAnimation();
    zoomAnchor = { x: clientX, y: clientY };
    const bounds = viewport.getBoundingClientRect();
    const depth = clamp(nextDepth, -1500, sceneEndDepth);
    const movement = (depth - view.z) / PERSPECTIVE;
    // Shift the camera along the pointer's viewing ray as it advances.
    setView({
      x: view.x - (clientX - bounds.left - bounds.width / 2) * movement,
      y: view.y - (clientY - bounds.top - bounds.height / 2) * movement,
      z: depth,
    });
  }

  function centerTravel(amount) {
    const bounds = viewport.getBoundingClientRect();
    travelAt(view.z + amount, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
  }

  function showOpeningView() {
    fitView(false, viewport.clientWidth < 600 ? 1.18 : 1.05);
  }

  function planTour() {
    if (!cards.size) return null;
    const narrow = viewport.clientWidth < 600;
    const from = overviewView(narrow ? 1.18 : 1.05);
    const layouts = [...cards.values()].map(card => card.layout);
    const side = activeMode === 'side';
    if (!side) return planFrontTour(from, layouts);

    const candidates = layouts.map(layout => ({
      x: layout.x + layout.width / 2,
      y: layout.y + layout.height / 2,
      z: layout.z,
    }));
    const lower = candidates.filter(photo => photo.y > WORLD.height * 0.55);
    const cost = photo => Math.abs(photo.x - WORLD.width * 0.48) * 1.6
      + Math.abs(photo.y - WORLD.height * 0.82);
    const destination = (lower.length ? lower : candidates)
      .reduce((best, photo) => cost(photo) < cost(best) ? photo : best);
    from.x -= WORLD.width * (narrow ? 0.09 : 0.16) * from.scale;
    from.y += WORLD.height * 0.04 * from.scale;
    from.z = -230;
    from.yaw = narrow ? -20 : -29;
    from.pivotZ = -410;
    return {
      from,
      to: {
        x: viewport.clientWidth / 2 - destination.x * from.scale,
        y: viewport.clientHeight / 2 - Math.max(WORLD.height / 2, destination.y) * from.scale,
        z: Math.max(OPENING_DEPTH, 500 - destination.z),
        scale: from.scale,
        yaw: narrow ? -12 : -17,
        pivotZ: destination.z,
      },
    };
  }

  function planFrontTour(from, layouts) {
    const opening = layouts.filter(photo => photo.depthIndex === 0);
    let totalWeight = 0;
    let weightedX = 0;
    let weightedY = 0;
    let bottom = 0;
    for (const photo of opening) {
      const perspective = PERSPECTIVE / (PERSPECTIVE - from.z - photo.z);
      // Projected area weights the photo, and perspective also scales each offset from the aim point.
      const weight = photo.width * photo.height * perspective ** 3;
      totalWeight += weight;
      weightedX += (photo.x + photo.width / 2) * weight;
      weightedY += (photo.y + photo.height / 2) * weight;
      bottom = Math.max(bottom, photo.y + photo.height);
    }
    const centerX = weightedX / totalWeight;
    const centerY = weightedY / totalWeight;
    const viewportHeight = viewport.clientHeight;
    let scale = from.scale;
    if (viewport.clientWidth < 600) {
      // Keep the opening cluster in view on short phones before the camera approaches it.
      const verticalExtent = opening.reduce((extent, photo) => {
        const perspective = PERSPECTIVE / (PERSPECTIVE - from.z - photo.z);
        const edge = Math.max(Math.abs(photo.y - centerY), Math.abs(photo.y + photo.height - centerY));
        return Math.max(extent, edge * perspective);
      }, 1);
      const halfFrame = viewportHeight * (viewportHeight < 500 ? 0.4 : 0.45);
      scale = Math.min(scale, halfFrame / verticalExtent);
    }
    const lowerY = centerY + (bottom - centerY) * 0.7;
    const candidates = opening.filter(photo => photo.y + photo.height / 2 >= centerY);
    const cost = photo => Math.abs(photo.x + photo.width / 2 - centerX) * 1.5
      + Math.abs(photo.y + photo.height / 2 - lowerY);
    const destination = (candidates.length ? candidates : opening)
      .reduce((best, photo) => cost(photo) < cost(best) ? photo : best);
    const finalY = Math.max(centerY, destination.y + destination.height / 2);

    // Follow the photo group's center line; a nearby photo sets only the landing depth and height.
    const y = viewportHeight / 2;
    const start = {
      ...from,
      scale,
      x: viewport.clientWidth / 2 - centerX * scale,
      y: y - centerY * scale,
    };
    return {
      from: start,
      to: { ...start, y: y - finalY * scale, z: Math.max(OPENING_DEPTH, 560 - destination.z) },
    };
  }

  function drawTour() {
    if (!tourPath) return;
    const { from, to } = tourPath;
    const progress = tourElapsed / TOUR_DURATION;
    const eased = progress * progress * (3 - 2 * progress);
    setView(interpolateView(from, to, eased));
    tourProgress.value = progress;
  }

  function updateTourControls() {
    tourControls.hidden = !isTourMode() || !tourPath;
    tourPlay.textContent = tourStartedAt !== null ? '暂停'
      : tourElapsed >= TOUR_DURATION ? '再看一次' : tourElapsed > 0 ? '继续' : '播放';
  }

  function pauseTour() {
    cancelAnimationFrame(tourFrame);
    tourFrame = 0;
    tourStartedAt = null;
    updateTourControls();
  }

  function playTour() {
    if (!tourPath || tourStartedAt !== null || !isTourMode() || activeFocusId) return;
    if (tourElapsed >= TOUR_DURATION) {
      tourElapsed = 0;
      drawTour();
    }
    tourStartedAt = performance.now() - tourElapsed / tourRate;
    updateTourControls();
    const frame = now => {
      if (storyBackup.isOpen || photoImport.isOpen || photoTrash.isOpen) {
        pauseTour();
        return;
      }
      tourElapsed = clamp((now - tourStartedAt) * tourRate, tourElapsed, TOUR_DURATION);
      drawTour();
      if (tourElapsed < TOUR_DURATION) tourFrame = requestAnimationFrame(frame);
      else pauseTour();
    };
    tourFrame = requestAnimationFrame(frame);
  }

  function prepareTour(play) {
    pauseTour();
    stopCameraAnimation();
    tourElapsed = 0;
    tourProgress.value = 0;
    didDrag = false;
    zoomAnchor = null;
    tourPath = planTour();
    drawTour();
    updateTourControls();
    if (play) playTour();
  }

  function renderOverlapChoices(id, start, event) {
    if (!start?.width) return;
    const hit = event?.detail ? photoTapPoint ?? event : null;
    photoTapPoint = null;
    const x = hit?.clientX ?? start.left + start.width / 2;
    const y = hit?.clientY ?? start.top + start.height / 2;
    const overlapIds = new Set([id]);
    for (const element of document.elementsFromPoint(x, y)) {
      const photoId = element.closest('button[data-id]')?.dataset.id;
      if (cards.has(photoId)) overlapIds.add(photoId);
    }
    if (overlapIds.size < 2) return;

    const choices = [...overlapIds].map((photoId, index) => {
      const { item } = cards.get(photoId);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'photo-overlap-choice';
      button.dataset.photoId = photoId;
      button.setAttribute('aria-label', `查看这里的第 ${index + 1} 张照片，${formatDate(item.date)}`);
      const thumbnail = document.createElement('img');
      thumbnail.src = item.thumb;
      thumbnail.alt = '';
      thumbnail.draggable = false;
      button.append(thumbnail);
      button.addEventListener('click', () => focusPhoto(photoId));
      return button;
    });
    overlapList.replaceChildren(...choices);
    photoOverlap.hidden = false;
  }

  function openScenePhoto(id, origin, event) {
    // Use the physical tap rather than a touch-adjusted click on an adjacent card.
    const point = event.detail ? photoTapPoint : null;
    const hit = point && document.elementFromPoint(point.clientX, point.clientY)
      ?.closest('.memory-card, .depth-card, .ring-card');
    if (hit) focusPhoto(hit.dataset.id, hit, event);
    else if (id) focusPhoto(id, origin, event);
  }

  function focusedPhoto() {
    return detailPhotos?.find(item => item.id === activeFocusId);
  }

  function renderSameDayPhotos(item) {
    if (sameDayList.dataset.date !== item.date) {
      const day = availablePhotos().filter(photo => photo.date === item.date);
      sameDayList.dataset.date = item.date;
      sameDayPhotos.hidden = day.length < 2;
      sameDayList.replaceChildren(...(day.length < 2 ? [] : day.map((photo, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.photoId = photo.id;
        button.setAttribute('aria-label', `查看同一天的第 ${index + 1} 张照片`);
        const thumbnail = document.createElement('img');
        thumbnail.src = photo.thumb;
        thumbnail.alt = '';
        thumbnail.draggable = false;
        thumbnail.decoding = 'async';
        button.append(thumbnail);
        button.addEventListener('click', () => {
          if (photo.id === activeFocusId) return;
          photoOverlap.hidden = true;
          overlapList.replaceChildren();
          focusPhoto(photo.id, null, null, day);
        });
        return button;
      })));
      sameDayList.scrollLeft = 0;
    }
    for (const button of sameDayList.children) {
      if (button.dataset.photoId === item.id) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
  }

  function focusPhoto(id, origin, event, sequence = detailPhotos ?? filtered, preparedImage = null) {
    const index = sequence.findIndex((item) => item.id === id);
    if (index < 0) return;
    if (isTourMode()) pauseTour();
    const opening = !activeFocusId;
    const start = opening ? origin?.getBoundingClientRect() : null;
    const item = sequence[index];
    if (opening) {
      stopCameraAnimation();
      focusOrigin = { id, mode: activeMode, element: origin };
      // Find the photos at the click before the detail overlay covers the scene.
      if (activeMode !== 'list') renderOverlapChoices(id, start, event);
    }
    detailPhotos = sequence;
    activeFocusId = id;
    lastViewedPhotoId = id;
    photoDetail.hidden = false;
    viewport.classList.add('is-focused');
    syncBackgroundInteraction();
    detailImage.alt = `${formatDate(item.date)} 的照片`;
    if (preparedImage) {
      photoSpread.style.setProperty('--photo-ratio', preparedImage.naturalWidth / preparedImage.naturalHeight);
      displayPreparedImage(preparedImage);
    } else {
      delete detailImage.dataset.fixedRatio;
      photoSpread.style.setProperty('--photo-ratio', item.width / item.height || 1.5);
      detailImage.src = item.full;
    }
    detailDate.dateTime = item.date;
    detailDate.textContent = formatDate(item.date);
    detailCount.textContent = `${sequence === filtered ? '' : '同一天 · '}${index + 1} / ${sequence.length}`;
    photoStory.setPhoto(item);
    renderSameDayPhotos(item);
    photoDetailBody.scrollTop = 0;
    previousPhotoButton.disabled = nextPhotoButton.disabled = sequence.length < 2;
    for (const button of overlapList.children) {
      button.setAttribute('aria-pressed', String(button.dataset.photoId === id));
    }

    photoEntrance?.cancel();
    if (preparedImage && !reducedMotion.matches) {
      photoEntrance = photoDetail.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 230, easing: 'ease-out' });
    } else if (start?.width && !reducedMotion.matches) {
      const end = detailImage.getBoundingClientRect();
      const x = start.left + start.width / 2 - end.left - end.width / 2;
      const y = start.top + start.height / 2 - end.top - end.height / 2;
      const scale = clamp(start.width / end.width, 0.08, 1);
      photoEntrance = detailImage.animate(
        [{ transform: `translate(${x}px, ${y}px) scale(${scale})`, opacity: 0.64 }, { transform: 'none', opacity: 1 }],
        { duration: 480, easing: 'cubic-bezier(0.2, 0.76, 0.2, 1)' }
      );
    }
    if (opening) exitFocusButton.focus({ preventScroll: true });
  }

  function exitFocus(restoreFocus = true) {
    if (!activeFocusId) return;
    const { id: originId, mode, element } = focusOrigin;
    const id = cards.has(activeFocusId) ? activeFocusId : originId;
    activeFocusId = null;
    detailPhotos = null;
    lastViewedPhotoId = id;
    focusOrigin = null;
    photoSwipe = null;
    photoEntrance?.cancel();
    photoDetail.hidden = true;
    photoStory.setPhoto(null);
    sameDayPhotos.hidden = true;
    sameDayList.replaceChildren();
    delete sameDayList.dataset.date;
    photoOverlap.hidden = true;
    overlapList.replaceChildren();
    viewport.classList.remove('is-focused');
    syncBackgroundInteraction();
    scheduleImageRefresh();
    if (restoreFocus) {
      if (mode !== activeMode && !isTourMode()) alignModeWithPhoto(id);
      const target = mode === activeMode && element?.isConnected ? element : modeToggle;
      target.focus({ preventScroll: true });
    }
  }

  function moveFocus(direction) {
    if (!detailPhotos || detailPhotos.length < 2) return;
    const index = detailPhotos.findIndex((item) => item.id === activeFocusId);
    const next = (index + direction + detailPhotos.length) % detailPhotos.length;
    focusPhoto(detailPhotos[next].id);
  }

  previousPhotoButton.addEventListener('click', () => moveFocus(-1));
  nextPhotoButton.addEventListener('click', () => moveFocus(1));
  photoStage.addEventListener('load', event => {
    if (event.target === detailImage && detailImage.naturalHeight && !('fixedRatio' in detailImage.dataset)) {
      photoSpread.style.setProperty('--photo-ratio', detailImage.naturalWidth / detailImage.naturalHeight);
    }
  }, true);
  photoStage.addEventListener('error', event => {
    const item = focusedPhoto();
    if (event.target === detailImage && item && detailImage.getAttribute('src') === item.full) detailImage.src = item.thumb;
  }, true);
  photoStage.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    photoSwipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
    photoStage.setPointerCapture(event.pointerId);
  });
  photoStage.addEventListener('pointerup', (event) => {
    if (photoSwipe?.id !== event.pointerId) return;
    const x = event.clientX - photoSwipe.x;
    const y = event.clientY - photoSwipe.y;
    photoSwipe = null;
    if (Math.abs(x) >= 42 && Math.abs(x) > Math.abs(y) * 1.25) moveFocus(x < 0 ? 1 : -1);
  });
  photoStage.addEventListener('lostpointercapture', () => { photoSwipe = null; });

  viewport.addEventListener('pointerdown', () => { photoTapPoint = null; }, true);
  viewport.addEventListener('pointerup', (event) => {
    if (!activeFocusId && event.isPrimary && (isPhotoScene() || event.target.closest('button[data-id]'))) {
      // A browser may move the subsequent click coordinates to the nearest touch target.
      photoTapPoint = { clientX: event.clientX, clientY: event.clientY };
    }
  }, true);

  viewport.addEventListener('click', (event) => {
    if (!isPhotoScene() || isDomeActive() || activeFocusId
      || event.target.closest('.view-actions, .space-end, .tour-controls, .space-layout-switch')) return;
    if (event.detail !== 0 && didDrag) return;
    const card = event.target.closest('.memory-card');
    openScenePhoto(card?.dataset.id, card, event);
  });

  viewport.addEventListener('wheel', (event) => {
    if (activeFocusId || activeMode !== 'space' || isDomeActive()) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    const travel = clamp(-event.deltaY * unit * 1.65, -420, 420);
    travelAt(view.z + travel, event.clientX, event.clientY);
  }, { passive: false });

  viewport.addEventListener('pointerdown', (event) => {
    if (isTourMode() && !activeFocusId && event.target.closest('.memory-card')) pauseTour();
    if (activeFocusId || activeMode !== 'space' || isDomeActive() || event.button !== 0) return;
    if (event.target.closest('.view-actions, .space-end, .space-layout-switch')) return;
    stopCameraAnimation();
    if (!pointers.size) {
      didDrag = false;
      lastPointer = { x: event.clientX, y: event.clientY };
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2) {
      didDrag = true;
      const [a, b] = [...pointers.values()];
      pinchStart = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        depth: view.z,
      };
    }
  });

  viewport.addEventListener('pointermove', (event) => {
    if (activeMode !== 'space' || isDomeActive()) return;
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const threshold = event.pointerType === 'touch' ? 12 : DRAG_THRESHOLD;
    if (!didDrag && Math.hypot(event.clientX - lastPointer.x, event.clientY - lastPointer.y) < threshold) return;
    didDrag = true;
    viewport.classList.add('is-dragging');

    if (!viewport.hasPointerCapture(event.pointerId)) {
      viewport.setPointerCapture(event.pointerId);
    }

    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      travelAt(
        pinchStart.depth + 1280 * Math.log(Math.max(1, distance) / pinchStart.distance),
        (a.x + b.x) / 2,
        (a.y + b.y) / 2
      );
      return;
    }

    if (pointers.size === 1 && lastPointer) {
      view.x += event.clientX - lastPointer.x;
      view.y += event.clientY - lastPointer.y;
      lastPointer = { x: event.clientX, y: event.clientY };
      applyTransform();
    }
  });

  function releasePointer(event) {
    if (!pointers.delete(event.pointerId)) return;
    if (!pointers.size) {
      viewport.classList.remove('is-dragging');
      lastPointer = null;
      pinchStart = null;
    } else if (pointers.size === 1) {
      const only = [...pointers.values()][0];
      lastPointer = { x: only.x, y: only.y };
      pinchStart = null;
    }
  }

  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);
  viewport.addEventListener('dragstart', (event) => event.preventDefault());

  search.addEventListener('input', applyFilter);
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyFilter();
    }
  });

  resetButton.addEventListener('click', () => {
    if (activeFocusId) exitFocus(false);
    if (isDomeActive()) dome.reset();
    else fitView(true);
  });
  document.querySelector('#space-end-reset').addEventListener('click', () => {
    fitView(true, viewport.clientWidth < 600 ? 1.18 : 1.05);
    modeToggle.focus({ preventScroll: true });
  });
  zoomInButton.addEventListener('click', () => isDomeActive() ? dome.zoomBy(1.2) : centerTravel(245));
  zoomOutButton.addEventListener('click', () => isDomeActive() ? dome.zoomBy(0.83) : centerTravel(-245));
  for (const button of spaceLayoutButtons) {
    button.addEventListener('click', () => setSpaceLayout(button.dataset.spaceLayout));
  }
  exitFocusButton.addEventListener('click', () => exitFocus());
  randomMemoryButton.addEventListener('click', showRandomMemory);
  tourPlay.addEventListener('click', () => {
    if (tourStartedAt === null) playTour();
    else pauseTour();
  });
  for (const button of tourSpeedButtons) {
    button.addEventListener('click', () => {
      const rate = Number(button.dataset.tourRate);
      if (rate === tourRate) return;
      tourRate = rate;
      if (tourStartedAt !== null) tourStartedAt = performance.now() - tourElapsed / rate;
      for (const option of tourSpeedButtons) {
        option.setAttribute('aria-pressed', String(option === button));
      }
    });
  }
  document.querySelector('#tour-restart').addEventListener('click', () => prepareTour(true));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && tourStartedAt !== null) pauseTour();
  });
  function showModeOptions(open, restoreFocus = false) {
    modeOptions.hidden = !open;
    modeToggle.setAttribute('aria-expanded', String(open));
    if (restoreFocus) modeToggle.focus({ preventScroll: true });
  }

  modeToggle.addEventListener('click', () => showModeOptions(modeOptions.hidden));
  for (const [mode, button] of Object.entries(modeButtons)) {
    button.addEventListener('click', () => {
      setMode(mode);
      showModeOptions(false, true);
    });
  }
  document.addEventListener('pointerdown', event => {
    if (!modeOptions.hidden && !modeSwitch.contains(event.target)) showModeOptions(false);
  });
  modeSwitch.addEventListener('focusout', event => {
    if (event.relatedTarget && !modeSwitch.contains(event.relatedTarget)) showModeOptions(false);
  });
  modeSwitch.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modeOptions.hidden) {
      event.preventDefault();
      showModeOptions(false, true);
      return;
    }
    const direction = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 }[event.key];
    if (!direction) return;
    event.preventDefault();
    if (modeOptions.hidden || event.target === modeToggle) {
      showModeOptions(true);
      modeButtons[activeMode].focus();
      return;
    }
    const options = Object.values(modeButtons);
    const index = options.indexOf(event.target);
    options[(index + direction + options.length) % options.length].focus();
  });
  jumpToLastButton.addEventListener('click', () => {
    const lastPhoto = listGrid.lastElementChild;
    if (!lastPhoto) return;
    listScroll.scrollTop = listScroll.scrollHeight;
    lastPhoto.focus({ preventScroll: true });
  });
  identity.addEventListener('click', (event) => {
    event.preventDefault();
    activeYear = 'all';
    search.value = '';
    createFilters();
    applyFilter();
  });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || storyBackup.isOpen || photoImport.isOpen || photoTrash.isOpen
      || event.target.closest('input, textarea, [contenteditable="true"]')) return;
    if (activeFocusId) {
      if (event.key === 'Escape') exitFocus();
      if (event.key === 'ArrowLeft') moveFocus(-1);
      if (event.key === 'ArrowRight') moveFocus(1);
      return;
    }
    if (activeMode === 'depth') {
      if (event.key === 'ArrowLeft') depthCarousel.navigate(-1);
      if (event.key === 'ArrowRight') depthCarousel.navigate(1);
      return;
    }
    if (activeMode === 'ring') {
      if (event.key === 'ArrowLeft') circularGallery.navigate(-1);
      if (event.key === 'ArrowRight') circularGallery.navigate(1);
      if (event.key === 'Home') circularGallery.home();
      return;
    }
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (activeMode === 'depth') {
        depthCarousel.resize();
        return;
      }
      if (activeMode === 'ring') {
        circularGallery.resize();
        return;
      }
      if (isTourMode()) {
        tourPath = planTour();
        if (!activeFocusId) drawTour();
        return;
      }
      if (activeMode === 'space' && !activeFocusId) showOpeningView();
    }, 120);
  });

  requestAnimationFrame(refreshAlbum);
  photoImport.load();
})();
