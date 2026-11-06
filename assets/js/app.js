/* =========================================================
   Tree Book House — public gallery app
   Reads data/gallery.json and renders the welcome + gallery.
   ========================================================= */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const els = {
    welcome: $('#welcome'),
    enterButton: $('#enterButton'),
    galleryShell: $('#galleryShell'),
    galleryIntro: $('#galleryIntro'),
    filters: $('#filters'),
    photoCount: $('#photoCount'),
    galleryToolbar: $('#galleryToolbar'),
    collectionsList: $('#collectionsList'),
    loadingState: $('#loadingState'),
    emptyState: $('#emptyState'),
    errorState: $('#errorState'),
    doorwayOverlay: $('#doorwayOverlay'),
    lightbox: $('#lightbox'),
    lightboxClose: $('#lightboxClose'),
    lightboxMedia: $('#lightboxMedia'),
    lightboxImage: $('#lightboxImage'),
    lightboxVideo: $('#lightboxVideo'),
    mediaBadge: $('#mediaBadge'),
    mediaHint: $('#mediaHint'),
    lightboxTitle: $('#lightboxTitle'),
    lightboxGroup: $('#lightboxGroup'),
    lightboxDate: $('#lightboxDate'),
    lightboxNote: $('#lightboxNote'),
    factOriginal: $('#factOriginal'),
    factGroup: $('#factGroup'),
    downloadLarge: $('#downloadLarge'),
    downloadLargeMeta: $('#downloadLargeMeta'),
    downloadWeb: $('#downloadWeb'),
    downloadWebMeta: $('#downloadWebMeta'),
    downloadVideo: $('#downloadVideo'),
    downloadVideoMeta: $('#downloadVideoMeta'),
    prevPhoto: $('#prevPhoto'),
    nextPhoto: $('#nextPhoto'),
    lightboxPosition: $('#lightboxPosition'),
    year: $('#year'),
  };

  const state = {
    data: null,
    groups: new Map(),
    photos: [],
    visiblePhotos: [],
    currentId: null,
    lastTrigger: null,
    filter: 'all',
    entered: false,
    pendingDeepLink: null,
  };

  /* ---------------- utilities ---------------- */
  const pad2 = (n) => String(n).padStart(2, '0');
  function formatDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);
    return `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`;
  }
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  function safeName(text) {
    return String(text || 'photo')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'photo';
  }
  function downloadName(photo, variant, suffix) {
    const dims = variant?.width && variant?.height ? `-${variant.width}x${variant.height}` : '';
    return `${safeName(photo.title)}${suffix}${dims}.${variant?.ext || 'jpg'}`;
  }
  function fileLabel(variant) {
    if (!variant) return '';
    return [variant.width && variant.height ? `${variant.width} × ${variant.height}` : '', formatBytes(variant.bytes), (variant.ext || 'jpg').toUpperCase()].filter(Boolean).join(' · ');
  }
  function setText(el, text) {
    if (el) el.textContent = text == null ? '' : String(text);
  }
  function escapeSelector(value) {
    if (window.CSS?.escape) return window.CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  /* ---------------- ambient background ---------------- */
  function seedSparkles() {
    const holder = $('#sparkles');
    if (!holder) return;
    const colors = ['#dcc07a', '#d992a4', '#91bdd7', '#b7c99c', '#e5c8a2'];
    const count = window.innerWidth < 700 ? 13 : 22;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i += 1) {
      const star = document.createElement('span');
      const size = 3 + Math.random() * 5;
      star.style.left = `${Math.random() * 94 + 2}%`;
      star.style.top = `${Math.random() * 82 + 3}%`;
      star.style.setProperty('--s', `${size.toFixed(1)}px`);
      star.style.setProperty('--c', colors[i % colors.length]);
      star.style.setProperty('--d', `${(3.5 + Math.random() * 4.5).toFixed(1)}s`);
      star.style.setProperty('--delay', `${(-Math.random() * 8).toFixed(1)}s`);
      frag.appendChild(star);
    }
    holder.appendChild(frag);
  }

  /* ---------------- data loading ---------------- */
  async function loadGallery() {
    try {
      const res = await fetch('data/gallery.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || !Array.isArray(data.photos)) throw new Error('Invalid gallery data');
      state.data = data;
      state.groups = new Map((Array.isArray(data.groups) ? data.groups : []).map((group, index) => [
        String(group.id),
        { ...group, order: index },
      ]));
      state.photos = data.photos
        .filter((photo) => photo && photo.id)
        .map((photo) => ({
          ...photo,
          group: String(photo.group || ''),
          variants: photo.variants || {},
        }));

      if (data.site?.intro) setText(els.galleryIntro, data.site.intro);
      if (data.site?.title) document.title = `${data.site.title} · Tree Book House`;
      if (els.year) setText(els.year, new Date().getFullYear());

      renderGallery();
      handleInitialDeepLink();
    } catch (error) {
      console.error('[Tree Book House] gallery load failed:', error);
      els.loadingState.hidden = true;
      els.errorState.hidden = false;
      els.emptyState.hidden = true;
    }
  }

  /* ---------------- rendering ---------------- */
  function getPhotoGroup(photo) {
    return state.groups.get(photo.group) || { id: photo.group, name: '其他收藏', description: '', order: 999 };
  }

  function orderedGroups() {
    const present = new Set(state.photos.map((p) => p.group));
    const groups = [...state.groups.values()].filter((group) => present.has(String(group.id))).sort((a, b) => a.order - b.order);
    const known = new Set(groups.map((group) => String(group.id)));
    [...present].forEach((groupId) => {
      if (!known.has(String(groupId))) {
        groups.push({ id: groupId, name: '未分组收藏', description: '', order: 999 });
      }
    });
    return groups;
  }

  function renderGallery() {
    els.loadingState.hidden = true;
    els.emptyState.hidden = state.photos.length > 0;
    els.collectionsList.textContent = '';

    if (!state.photos.length) {
      els.filters.textContent = '';
      setText(els.photoCount, '');
      if (els.galleryToolbar) els.galleryToolbar.hidden = true;
      return;
    }
    if (els.galleryToolbar) els.galleryToolbar.hidden = false;

    const groups = orderedGroups();
    renderFilters(groups);
    updatePhotoCount(state.photos.length);

    const frag = document.createDocumentFragment();
    groups.forEach((group, groupIndex) => {
      const groupPhotos = state.photos.filter((photo) => photo.group === String(group.id));
      if (!groupPhotos.length) return;

      const section = document.createElement('section');
      section.className = 'collection';
      section.id = `collection-${group.id}`;
      section.dataset.group = group.id;
      section.setAttribute('aria-labelledby', `group-title-${group.id}`);

      const head = document.createElement('header');
      head.className = 'collection__head';

      const title = document.createElement('div');
      title.className = 'collection__title';
      const kicker = document.createElement('span');
      kicker.className = 'collection__kicker';
      setText(kicker, `COLLECTION ${pad2(groupIndex + 1)}`);
      const h2 = document.createElement('h2');
      h2.id = `group-title-${group.id}`;
      setText(h2, group.name || '未命名分组');
      const count = document.createElement('span');
      count.className = 'collection__count';
      setText(count, groupPhotos.length);
      count.setAttribute('aria-label', `${groupPhotos.length} 张照片`);
      title.append(kicker, h2, count);

      const desc = document.createElement('p');
      desc.className = 'collection__desc';
      setText(desc, group.description || '');

      head.append(title, desc);

      const grid = document.createElement('div');
      grid.className = 'photo-grid';

      groupPhotos.forEach((photo, index) => {
        grid.appendChild(createPhotoCard(photo, index, group));
      });

      section.append(head, grid);
      frag.appendChild(section);
    });
    els.collectionsList.appendChild(frag);
    observeCards();
  }

  function createPhotoCard(photo, index, group) {
    const article = document.createElement('article');
    article.className = 'photo-card';
    article.dataset.photoId = photo.id;
    article.dataset.group = group.id;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'photo-card__button';
    button.dataset.openPhoto = photo.id;
    button.setAttribute('aria-label', `查看照片：${photo.title || '未命名'}，可下载`);

    const web = photo.variants?.web || photo.variants?.large;
    const frame = document.createElement('div');
    frame.className = 'photo-card__frame';

    const img = document.createElement('img');
    img.className = 'photo-card__image';
    img.src = web?.src || '';
    img.alt = photo.title ? `照片：${photo.title}` : '树屋照片';
    img.loading = 'lazy';
    img.decoding = 'async';
    if (web?.width && web?.height) {
      img.width = web.width;
      img.height = web.height;
    }
    img.addEventListener('error', () => {
      img.style.opacity = '.25';
      img.alt = '照片暂时无法显示';
    });
    frame.appendChild(img);

    if (photo.video?.src) {
      const video = document.createElement('video');
      video.className = 'photo-card__video';
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'none';
      video.dataset.src = photo.video.src;
      if (photo.video.poster) video.poster = photo.video.poster;
      video.setAttribute('aria-hidden', 'true');
      video.addEventListener('playing', () => video.classList.add('is-playing'));
      frame.appendChild(video);

      const badge = document.createElement('span');
      badge.className = 'photo-card__badge';
      badge.innerHTML = '<span></span>LOOP';
      frame.appendChild(badge);

      button.addEventListener('pointerenter', () => previewVideo(button));
      button.addEventListener('pointerleave', () => stopPreviewVideo(button));
      button.addEventListener('focus', () => {
        if (window.matchMedia('(hover: hover)').matches) previewVideo(button);
      });
      button.addEventListener('blur', () => stopPreviewVideo(button));
    }

    const open = document.createElement('span');
    open.className = 'photo-card__open';
    open.textContent = '打开看看 ↗';
    frame.appendChild(open);

    const caption = document.createElement('div');
    caption.className = 'photo-card__caption';
    const number = document.createElement('span');
    number.className = 'photo-card__number';
    setText(number, pad2(index + 1));
    const text = document.createElement('div');
    text.className = 'photo-card__text';
    const h3 = document.createElement('h3');
    setText(h3, photo.title || '未命名照片');
    const meta = document.createElement('p');
    setText(meta, `${group.name || '照片'} · ${formatDate(photo.date)}`);
    text.append(h3, meta);
    const heart = document.createElement('span');
    heart.className = 'photo-card__heart';
    heart.setAttribute('aria-hidden', 'true');
    heart.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M20.8 5.9a5.2 5.2 0 00-7.4 0L12 7.4l-1.4-1.5a5.2 5.2 0 10-7.4 7.4L12 22l8.8-8.7a5.2 5.2 0 000-7.4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    caption.append(number, text, heart);

    button.append(frame, caption);
    button.addEventListener('click', () => openLightbox(photo.id, button));
    article.appendChild(button);
    return article;
  }

  function renderFilters(groups) {
    els.filters.textContent = '';
    const all = createFilterButton('all', '全部', state.photos.length);
    els.filters.appendChild(all);
    groups.forEach((group) => {
      const count = state.photos.filter((photo) => photo.group === String(group.id)).length;
      els.filters.appendChild(createFilterButton(group.id, group.name || '未命名分组', count));
    });
    syncFilterUI();
  }

  function createFilterButton(id, name, count) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter';
    button.dataset.filter = id;
    button.setAttribute('aria-pressed', 'false');
    const label = document.createElement('span');
    setText(label, name);
    const badge = document.createElement('span');
    badge.className = 'filter__count';
    setText(badge, count);
    button.append(label, badge);
    button.addEventListener('click', () => applyFilter(id));
    return button;
  }

  function syncFilterUI() {
    $$('.filter', els.filters).forEach((button) => {
      const active = button.dataset.filter === state.filter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function applyFilter(groupId) {
    const valid = groupId === 'all' || state.groups.has(String(groupId));
    state.filter = valid ? groupId : 'all';
    $$('.collection', els.collectionsList).forEach((section) => {
      const show = state.filter === 'all' || section.dataset.group === String(state.filter);
      section.hidden = !show;
    });
    const visible = state.filter === 'all'
      ? state.photos.length
      : state.photos.filter((photo) => photo.group === String(state.filter)).length;
    updatePhotoCount(visible);
    syncFilterUI();
    if (state.filter !== 'all') {
      const section = $(`#collection-${escapeSelector(state.filter)}`, els.collectionsList);
      if (section) {
        const y = section.getBoundingClientRect().top + window.scrollY - 150;
        window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }
  }

  function updatePhotoCount(count) {
    if (!els.photoCount) return;
    els.photoCount.innerHTML = `共 <strong>${count}</strong> 张照片`;
  }

  function getVisiblePhotos() {
    if (state.filter === 'all') return state.photos.slice();
    return state.photos.filter((photo) => photo.group === String(state.filter));
  }

  function observeCards() {
    const cards = $$('.photo-card', els.collectionsList);
    if (!('IntersectionObserver' in window) || reduceMotion) {
      cards.forEach((card) => card.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.04 });
    cards.forEach((card) => io.observe(card));
  }

  /* ---------------- card video previews ---------------- */
  function previewVideo(card) {
    if (reduceMotion) return;
    const video = $('.photo-card__video', card);
    if (!video) return;
    if (!video.getAttribute('src') && video.dataset.src) {
      video.src = video.dataset.src;
      video.load();
    }
    const play = video.play();
    if (play?.catch) play.catch(() => {});
  }
  function stopPreviewVideo(card) {
    const video = $('.photo-card__video', card);
    if (!video) return;
    video.pause();
    video.classList.remove('is-playing');
  }

  /* ---------------- welcome → gallery ---------------- */
  function openDoor() {
    if (state.entered) return;
    state.entered = true;
    els.enterButton.disabled = true;
    els.enterButton.setAttribute('aria-busy', 'true');

    if (reduceMotion) {
      showGallery(false);
      return;
    }

    els.welcome.classList.add('is-leaving');
    els.doorwayOverlay.classList.add('is-active', 'is-closing');
    window.setTimeout(() => {
      showGallery(true);
      els.doorwayOverlay.classList.remove('is-closing');
      els.doorwayOverlay.classList.add('is-opening');
      window.setTimeout(() => {
        els.doorwayOverlay.classList.remove('is-active', 'is-opening');
      }, 880);
    }, 610);
  }

  function showGallery(animated) {
    els.welcome.hidden = true;
    document.body.classList.remove('is-welcome');
    document.body.classList.remove('no-scroll');
    els.galleryShell.hidden = false;
    els.galleryShell.classList.toggle('is-entering', animated && !reduceMotion);
    window.scrollTo({ top: 0, behavior: 'auto' });
    const heading = $('#gallery-title');
    window.setTimeout(() => {
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
      els.enterButton.disabled = false;
      els.enterButton.removeAttribute('aria-busy');
    }, reduceMotion ? 0 : 300);
    if (state.pendingDeepLink) {
      const photo = state.photos.find((item) => item.id === state.pendingDeepLink);
      state.pendingDeepLink = null;
      if (photo) {
        window.setTimeout(() => openLightbox(photo.id, null), reduceMotion ? 0 : 380);
      }
    }
  }

  /* ---------------- deep links ---------------- */
  function handleInitialDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('photo');
    if (!id) return;
    const exists = state.photos.some((photo) => photo.id === id);
    if (!exists) return;
    state.pendingDeepLink = id;
    state.entered = true;
    showGallery(false);
  }

  function writeDeepLink(id) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('photo', id);
    else url.searchParams.delete('photo');
    history.replaceState({ photo: id || null }, '', url);
  }

  /* ---------------- lightbox ---------------- */
  function setDownload(anchor, metaEl, photo, variant, label, suffix) {
    if (!anchor) return;
    if (!variant?.src) {
      anchor.hidden = true;
      return;
    }
    anchor.hidden = false;
    anchor.href = variant.src;
    anchor.download = downloadName(photo, variant, suffix);
    anchor.setAttribute('aria-label', `下载${label}，${fileLabel(variant)}`);
    setText(metaEl, `${fileLabel(variant)} · ${label}`);
  }

  function openLightbox(photoId, trigger) {
    const visible = getVisiblePhotos();
    const photo = state.photos.find((item) => item.id === photoId);
    if (!photo || !visible.some((item) => item.id === photoId)) return;

    state.visiblePhotos = visible;
    state.currentId = photoId;
    state.lastTrigger = trigger || null;
    document.activeElement?.blur?.();

    fillLightbox(photo);
    writeDeepLink(photoId);
    document.body.classList.add('no-scroll');

    if (!els.lightbox.open) els.lightbox.showModal();
    requestAnimationFrame(() => els.lightbox.classList.add('is-open'));
    updateNav();
  }

  function fillLightbox(photo) {
    const group = getPhotoGroup(photo);
    const large = photo.variants?.large || photo.variants?.web || null;
    const web = photo.variants?.web || large;
    const original = photo.original || large || {};
    const imageVariant = large || web;
    const hasVideo = Boolean(photo.video?.src);

    els.lightboxImage.src = imageVariant?.src || '';
    els.lightboxImage.alt = photo.title ? `照片：${photo.title}` : '树屋照片';
    setText(els.lightboxGroup, group.name || '照片');
    setText(els.lightboxDate, formatDate(photo.date));
    setText(els.lightboxTitle, photo.title || '未命名照片');
    setText(els.lightboxNote, photo.note || '一张被树屋好好收藏的瞬间。');
    setText(
      els.factOriginal,
      original.width && original.height ? `${original.width} × ${original.height}` : '未记录',
    );
    setText(els.factGroup, group.name || '未分组');

    setDownload(els.downloadLarge, els.downloadLargeMeta, photo, large, '高清版', '-HD');
    setDownload(els.downloadWeb, els.downloadWebMeta, photo, web, '轻巧版', '-WEB');

    // Video
    els.lightboxVideo.pause();
    els.lightboxVideo.classList.remove('is-playing');
    els.lightboxVideo.removeAttribute('src');
    els.lightboxVideo.removeAttribute('poster');
    els.mediaBadge.hidden = !hasVideo;
    els.mediaHint.hidden = !hasVideo;
    els.lightboxMedia.classList.toggle('has-video', hasVideo);

    if (hasVideo) {
      els.lightboxVideo.poster = photo.video.poster || imageVariant?.src || '';
      els.lightboxVideo.src = photo.video.src;
      els.lightboxVideo.setAttribute('aria-label', `${photo.title || '照片'}的动态循环预览`);
      els.lightboxVideo.load();
      if (!reduceMotion) {
        const attempt = els.lightboxVideo.play();
        if (attempt?.catch) attempt.catch(() => {});
      }
      els.lightboxVideo.onplaying = () => els.lightboxVideo.classList.add('is-playing');
      els.lightboxVideo.onerror = () => {
        els.lightboxVideo.classList.remove('is-playing');
        els.mediaBadge.hidden = true;
        els.mediaHint.hidden = true;
      };
      setText(els.mediaHint, reduceMotion ? '点击画面播放动态壁纸' : '点击画面暂停动态壁纸');
    }

    const videoMeta = [];
    if (photo.video?.seconds) videoMeta.push(`${photo.video.seconds} 秒循环`);
    if (photo.video?.bytes) videoMeta.push(formatBytes(photo.video.bytes));
    const ext = photo.video?.ext || (photo.video?.type?.includes('mp4') ? 'mp4' : 'webm');
    videoMeta.push(ext.toUpperCase());
    if (!hasVideo) {
      els.downloadVideo.hidden = true;
    } else {
      els.downloadVideo.hidden = false;
      els.downloadVideo.href = photo.video.src;
      els.downloadVideo.download = `${safeName(photo.title)}-LOOP.${ext}`;
      els.downloadVideo.setAttribute('aria-label', `下载动态壁纸，${videoMeta.join('，')}`);
      setText(els.downloadVideoMeta, videoMeta.join(' · '));
    }

    // Preload neighbours for a snappier next/prev.
    const index = state.visiblePhotos.findIndex((item) => item.id === photo.id);
    [index - 1, index + 1].forEach((i) => {
      const neighbour = state.visiblePhotos[(i + state.visiblePhotos.length) % state.visiblePhotos.length];
      if (neighbour) {
        const preload = new Image();
        preload.src = neighbour.variants?.large?.src || neighbour.variants?.web?.src || '';
      }
    });
    els.lightboxVideo.onclick = null;
    els.lightboxMedia.onclick = hasVideo
      ? () => {
          if (els.lightboxVideo.paused) {
            const attempt = els.lightboxVideo.play();
            if (attempt?.catch) attempt.catch(() => {});
            setText(els.mediaHint, '点击画面暂停动态壁纸');
          } else {
            els.lightboxVideo.pause();
            setText(els.mediaHint, '点击画面播放动态壁纸');
          }
        }
      : null;
  }

  function updateNav() {
    const total = state.visiblePhotos.length;
    const index = state.visiblePhotos.findIndex((photo) => photo.id === state.currentId);
    setText(els.lightboxPosition, `${pad2(index + 1)} / ${pad2(total)}`);
    els.prevPhoto.disabled = total <= 1;
    els.nextPhoto.disabled = total <= 1;
  }

  function stepPhoto(direction) {
    if (!state.visiblePhotos.length || !state.currentId) return;
    const index = state.visiblePhotos.findIndex((photo) => photo.id === state.currentId);
    if (index < 0) return;
    const total = state.visiblePhotos.length;
    const next = (index + direction + total) % total;
    const photo = state.visiblePhotos[next];
    if (!photo) return;
    state.currentId = photo.id;
    fillLightbox(photo);
    writeDeepLink(photo.id);
    updateNav();
  }

  function closeLightbox() {
    if (!els.lightbox.open) return;
    els.lightbox.classList.remove('is-open');
    els.lightboxVideo.pause();
    els.lightboxVideo.removeAttribute('src');
    els.lightboxVideo.load();
    document.body.classList.remove('no-scroll');
    writeDeepLink(null);
    const trigger = state.lastTrigger;
    window.setTimeout(() => {
      if (els.lightbox.open) els.lightbox.close();
      state.currentId = null;
      if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
    }, reduceMotion ? 0 : 260);
  }

  /* ---------------- events ---------------- */
  function bindEvents() {
    els.enterButton.addEventListener('click', openDoor);
    els.lightboxClose.addEventListener('click', closeLightbox);
    els.prevPhoto.addEventListener('click', () => stepPhoto(-1));
    els.nextPhoto.addEventListener('click', () => stepPhoto(1));

    els.lightbox.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeLightbox();
    });
    els.lightbox.addEventListener('click', (event) => {
      if (event.target === els.lightbox) closeLightbox();
    });
    document.addEventListener('keydown', (event) => {
      if (!els.lightbox.open) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        stepPhoto(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        stepPhoto(1);
      }
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (window.innerWidth < 700) {
          $$('.sparkles span').forEach((star, i) => { if (i >= 13) star.remove(); });
        }
      }, 200);
    });
  }

  /* ---------------- boot ---------------- */
  function init() {
    if (els.year) setText(els.year, new Date().getFullYear());
    seedSparkles();
    bindEvents();
    loadGallery();

    // If the user returns with a #collection hash, reveal the gallery.
    if (window.location.hash.startsWith('#collection-')) {
      state.entered = true;
      showGallery(false);
    }
  }

  init();
})();
