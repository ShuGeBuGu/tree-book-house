/* =========================================================
   Tree Book House — static, serverless keeper's desk
   Uses the GitHub Git Data API to publish photos in one commit.
   ========================================================= */
(() => {
  'use strict';

  const API = 'https://api.github.com';
  const CONFIG_KEY = 'tbh-admin-config-v1';
  const IMAGE_MAX = 40 * 1024 * 1024;
  const QUEUE_MAX = 30;
  const LARGE_EDGE = 2560;
  const WEB_EDGE = 1280;
  const VIDEO_MAX = 60 * 1024 * 1024;
  const VIDEO_EXTENSIONS = new Set(['mp4', 'webm']);

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const els = {
    connectionPill: $('#connectionPill'),
    connectionText: $('#connectionText'),
    setupPanel: $('#setupPanel'),
    setupForm: $('#setupForm'),
    setupState: $('#setupState'),
    setupStatus: $('#setupStatus'),
    repoInput: $('#repoInput'),
    branchInput: $('#branchInput'),
    tokenInput: $('#tokenInput'),
    tokenToggle: $('#tokenToggle'),
    rememberInput: $('#rememberInput'),
    connectButton: $('#connectButton'),
    openGuide: $('#openGuide'),
    repoSetupHint: $('#repoSetupHint'),
    uploadPanel: $('#uploadPanel'),
    uploadState: $('#uploadState'),
    uploadBody: $('#uploadBody'),
    groupSelect: $('#groupSelect'),
    newGroupFields: $('#newGroupFields'),
    newGroupName: $('#newGroupName'),
    newGroupDesc: $('#newGroupDesc'),
    dropzone: $('#dropzone'),
    fileInput: $('#fileInput'),
    queueWrap: $('#queueWrap'),
    queueList: $('#queueList'),
    queueCount: $('#queueCount'),
    clearQueue: $('#clearQueue'),
    publishSettings: $('#publishSettings'),
    publishSummary: $('#publishSummary'),
    publishButton: $('#publishButton'),
    progressWrap: $('#progressWrap'),
    progressBar: $('#progressBar'),
    progressLabel: $('#progressLabel'),
    publishLog: $('#publishLog'),
    managePanel: $('#managePanel'),
    manageLockNote: $('#manageLockNote'),
    manageBody: $('#manageBody'),
    manageGroups: $('#manageGroups'),
    manageEmpty: $('#manageEmpty'),
    manageState: $('#managePanel .panel-state'),
    totalPhotoCount: $('#totalPhotoCount'),
    totalGroupCount: $('#totalGroupCount'),
    repoSize: $('#repoSize'),
    removeDemoButton: $('#removeDemoButton'),
    refreshButton: $('#refreshButton'),
    toast: $('#toast'),
    confirmDialog: $('#confirmDialog'),
    confirmTitle: $('#confirmTitle'),
    confirmText: $('#confirmText'),
    confirmCancel: $('#confirmCancel'),
    confirmOk: $('#confirmOk'),
  };

  const state = {
    repo: '',
    branch: 'main',
    token: '',
    connected: false,
    repoInfo: null,
    manifest: null,
    headSha: null,
    treeSha: null,
    queue: [],
    busy: false,
    lastPublish: null,
    autoConnecting: false,
  };

  /* ---------------- generic helpers ---------------- */
  function esc(value) {
    if (window.CSS?.escape) return window.CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  function todayISO() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function normalizeRepo(value) {
    return String(value || '')
      .trim()
      .replace(/^https?:\/\/github\.com\//i, '')
      .replace(/\.git$/i, '')
      .replace(/^\/+|\/+$/g, '');
  }
  function splitRepo(value) {
    const clean = normalizeRepo(value);
    const parts = clean.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return { owner: parts[0], name: parts[1], full: `${parts[0]}/${parts[1]}` };
  }
  function repoApiPath() {
    const parsed = splitRepo(state.repo);
    return parsed ? `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.name)}` : '';
  }
  function branchPath() {
    return String(state.branch || 'main').split('/').map(encodeURIComponent).join('/');
  }
  function siteUrl() {
    if (!state.repoInfo) return '';
    const owner = state.repoInfo.owner?.login || splitRepo(state.repo)?.owner;
    const name = state.repoInfo.name || splitRepo(state.repo)?.name;
    if (!owner || !name) return '';
    if (name.toLowerCase() === `${owner.toLowerCase()}.github.io`) return `https://${owner}.github.io/`;
    return `https://${owner}.github.io/${name}/`;
  }
  function toast(message, type = '') {
    els.toast.textContent = message;
    els.toast.dataset.type = type;
    els.toast.classList.add('is-visible');
    window.clearTimeout(toast._timer);
    toast._timer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 3600);
  }
  function setStatus(type, message) {
    els.setupStatus.dataset.type = type || '';
    els.setupStatus.textContent = message || '';
  }
  function setLoading(button, active) {
    button.disabled = active;
    button.classList.toggle('is-loading', active);
    button.setAttribute('aria-busy', String(active));
  }
  function safeTitle(value, fallback = '照片') {
    const text = String(value || '').trim().slice(0, 80);
    return text || fallback;
  }
  function fileNameBase(name) {
    return String(name || '照片')
      .replace(/\.[^.]+$/, '')
      .replace(/[_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || '照片';
  }

  /* ---------------- config storage ---------------- */
  function readConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }
  function writeConfig() {
    try {
      const remember = els.rememberInput.checked;
      localStorage.setItem(CONFIG_KEY, JSON.stringify({
        repo: state.repo,
        branch: state.branch,
        token: remember ? state.token : '',
        remember,
      }));
    } catch (_) {}
  }
  function initConfig() {
    const cfg = readConfig();
    if (cfg.repo) els.repoInput.value = cfg.repo;
    if (cfg.branch) els.branchInput.value = cfg.branch;
    if (cfg.remember) els.rememberInput.checked = true;
    if (cfg.token && cfg.remember) els.tokenInput.value = cfg.token;
  }

  /* ---------------- GitHub API ---------------- */
  async function api(path, { method = 'GET', body } = {}) {
    if (!state.token) throw new Error('请先填写 GitHub Token。');
    const headers = {
      Authorization: `Bearer ${state.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetch(API + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      const err = new Error('无法连接 GitHub。请检查网络后重试。');
      err.cause = error;
      throw err;
    }
    const raw = await response.text();
    let data = null;
    if (raw) {
      try { data = JSON.parse(raw); } catch (_) { data = null; }
    }
    if (!response.ok) {
      const message = data?.message || `GitHub 返回了 ${response.status}`;
      const err = new Error(message);
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function humanError(err) {
    if (!err) return '未知错误';
    const status = err.status;
    const msg = String(err.message || '');
    if (status === 401) return 'Token 无效或已过期，请重新生成一个 Fine-grained Token。';
    if (status === 403 && /rate limit/i.test(msg)) return '触发了 GitHub API 频率限制，请过一会儿再试。';
    if (status === 403) return '仓库没有写入权限，请检查 Token 的 Contents 是否为 Read and write。';
    if (status === 404) return '没有找到这个仓库或分支。请检查用户名、仓库名、分支，以及 Token 的访问范围。';
    if (status === 409) return '远端仓库有了新的变化，请点击刷新后再试一次。';
    if (status === 422) return 'GitHub 拒绝了这次提交。分支可能被保护，或仓库已满。';
    if (/Failed to fetch|NetworkError/i.test(msg)) return '网络连接失败，请检查网络。';
    return msg || '操作失败，请稍后重试。';
  }

  function base64ToText(base64) {
    const clean = String(base64 || '').replace(/\s/g, '');
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  async function blobToBase64(blob) {
    const buffer = new Uint8Array(await blob.arrayBuffer());
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < buffer.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, buffer.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }
  function textToBlob(text) {
    return new Blob([new TextEncoder().encode(text)], { type: 'application/json' });
  }

  async function fetchRepositoryState() {
    const root = repoApiPath();
    if (!root) throw new Error('仓库格式应为 用户名/仓库名。');
    const ref = await api(`${root}/git/ref/heads/${branchPath()}`);
    const headSha = ref?.object?.sha;
    if (!headSha) throw new Error('无法读取分支的最新提交。');
    const commit = await api(`${root}/git/commits/${headSha}`);
    const treeSha = commit?.tree?.sha;
    if (!treeSha) throw new Error('无法读取仓库文件树。');
    const tree = await api(`${root}/git/trees/${treeSha}?recursive=1`);
    const manifestEntry = (tree?.tree || []).find((entry) => entry.path === 'data/gallery.json' && entry.type === 'blob');
    if (!manifestEntry) {
      const err = new Error('这个仓库里没有 data/gallery.json。请先把完整的网站文件上传到仓库根目录。');
      err.code = 'MISSING_SITE';
      throw err;
    }
    const manifestBlob = await api(`${root}/git/blobs/${manifestEntry.sha}`);
    let manifest;
    try {
      manifest = JSON.parse(base64ToText(manifestBlob.content));
    } catch (error) {
      throw new Error('data/gallery.json 无法解析，请确认它是完整的 JSON 文件。');
    }
    if (!manifest || !Array.isArray(manifest.photos) || !Array.isArray(manifest.groups)) {
      throw new Error('data/gallery.json 的结构不完整。');
    }
    state.manifest = manifest;
    state.headSha = headSha;
    state.treeSha = treeSha;
    return { manifest, headSha, treeSha, tree };
  }

  async function connect({ silent = false } = {}) {
    if (state.busy) return false;
    const parsed = splitRepo(els.repoInput.value);
    if (!parsed) {
      setStatus('error', '仓库格式应为 用户名/仓库名，例如 yourname/tree-book-house。');
      if (!silent) toast('请填写正确的仓库名', 'error');
      return false;
    }
    const branch = els.branchInput.value.trim() || 'main';
    const token = els.tokenInput.value.trim();
    if (!token) {
      setStatus('error', '请填写 GitHub Fine-grained Token。');
      if (!silent) toast('还需要一个 GitHub Token', 'error');
      return false;
    }

    state.repo = parsed.full;
    state.branch = branch;
    state.token = token;
    setLoading(els.connectButton, true);
    setStatus('info', silent ? '正在恢复上次的连接…' : '正在连接仓库，请稍等…');
    setConnectionState('connecting', '连接中');

    try {
      const root = repoApiPath();
      const repoInfo = await api(root);
      if (repoInfo?.permissions && repoInfo.permissions.push === false) {
        throw new Error('PERMISSION');
      }
      const data = await fetchRepositoryState();
      state.repoInfo = repoInfo;
      state.connected = true;
      writeConfig();
      updateConnectedUI();
      if (!silent) toast('仓库已连接，可以开始上传了');
      setStatus('success', `已连接 ${repoInfo.full_name || parsed.full} · 默认分支 ${branch}。照片会提交到这个仓库。`);
      return true;
    } catch (error) {
      state.connected = false;
      state.manifest = null;
      state.headSha = null;
      state.treeSha = null;
      updateDisconnectedUI();
      const message = error.message === 'PERMISSION'
        ? '这个 Token 没有 Contents 写入权限。请在 GitHub 里把 Contents 设为 Read and write。'
        : error.code === 'MISSING_SITE'
          ? error.message
          : humanError(error);
      setStatus('error', message);
      setConnectionState('error', '连接失败');
      if (!silent) toast(message, 'error');
      return false;
    } finally {
      setLoading(els.connectButton, false);
      state.autoConnecting = false;
    }
  }

  function setConnectionState(kind, text) {
    els.connectionPill.dataset.state = kind;
    els.connectionText.textContent = text;
  }

  function updateConnectedUI() {
    setConnectionState('online', state.repo);
    els.setupState.textContent = '已连接';
    els.repoSetupHint.hidden = true;
    els.setupPanel.classList.remove('is-locked');
    els.uploadPanel.classList.remove('is-locked');
    els.managePanel.classList.remove('is-locked');
    els.uploadState.textContent = '可以上传';
    els.manageState.textContent = '已同步';
    els.manageBody.hidden = false;
    els.refreshButton.disabled = false;
    els.dropzone.classList.remove('is-disabled');
    renderGroupOptions();
    renderManage();
    refreshPublishVisibility();
  }

  function updateDisconnectedUI() {
    setConnectionState('offline', '尚未连接');
    els.setupState.textContent = '待连接';
    els.repoSetupHint.hidden = false;
    els.uploadPanel.classList.add('is-locked');
    els.managePanel.classList.add('is-locked');
    els.uploadState.textContent = '连接后可用';
    els.manageState.textContent = '待连接';
    els.manageBody.hidden = true;
    els.refreshButton.disabled = true;
    els.dropzone.classList.add('is-disabled');
    els.publishButton.disabled = true;
  }

  /* ---------------- group handling ---------------- */
  function groupPhotoCount(groupId) {
    return (state.manifest?.photos || []).filter((photo) => String(photo.group) === String(groupId)).length;
  }

  function renderGroupOptions() {
    const previous = els.groupSelect.value;
    const groups = state.manifest?.groups || [];
    els.groupSelect.textContent = '';
    if (groups.length) {
      groups.forEach((group) => {
        const option = document.createElement('option');
        option.value = String(group.id);
        option.textContent = `${group.name || '未命名分组'}（${groupPhotoCount(group.id)} 张）`;
        els.groupSelect.appendChild(option);
      });
      const newOption = document.createElement('option');
      newOption.value = '__new__';
      newOption.textContent = '＋ 新建一个分组';
      els.groupSelect.appendChild(newOption);
      if (previous && [...els.groupSelect.options].some((option) => option.value === previous)) {
        els.groupSelect.value = previous;
      }
    } else {
      const option = document.createElement('option');
      option.value = '__new__';
      option.textContent = '＋ 新建第一个分组';
      els.groupSelect.appendChild(option);
      els.groupSelect.value = '__new__';
    }
    updateNewGroupFields();
  }

  function updateNewGroupFields() {
    const isNew = els.groupSelect.value === '__new__';
    els.newGroupFields.hidden = !isNew;
  }

  function hashString(value) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  }

  function resolveGroupForPublish() {
    const groups = state.manifest?.groups || [];
    if (els.groupSelect.value === '__new__') {
      const name = els.newGroupName.value.trim();
      if (!name) throw new Error('请给新分组取一个名字。');
      const description = els.newGroupDesc.value.trim();
      const existing = groups.find((group) => group.name === name);
      if (existing) {
        return { id: String(existing.id), name: existing.name || name, description: existing.description || description, isNew: false };
      }
      let id = `group-${hashString(name)}`;
      if (groups.some((group) => String(group.id) === id)) id = `${id}-${Date.now().toString(36).slice(-4)}`;
      return { id, name, description, isNew: true };
    }
    const group = groups.find((item) => String(item.id) === els.groupSelect.value);
    if (!group) throw new Error('没有找到这个分组，请刷新页面后再试。');
    return { id: String(group.id), name: group.name || '未命名分组', description: group.description || '', isNew: false };
  }

  /* ---------------- image & video generation ---------------- */
  async function decodeImage(file) {
    if (window.createImageBitmap) {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (_) {
        // Some browsers cannot apply EXIF in createImageBitmap; fall through to <img>.
      }
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      await image.decode();
      return image;
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
  }

  function sourceSize(source) {
    return {
      width: source.width || source.naturalWidth || 0,
      height: source.height || source.naturalHeight || 0,
    };
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('图片压缩失败，请换一张图片试试。'));
      }, type, quality);
    });
  }

  async function makeJpegVariant(source, maxEdge, quality) {
    const src = sourceSize(source);
    if (!src.width || !src.height) throw new Error('无法读取图片尺寸。');
    const scale = Math.min(1, maxEdge / Math.max(src.width, src.height));
    const width = Math.max(1, Math.round(src.width * scale));
    const height = Math.max(1, Math.round(src.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff8ef';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    return { blob, width, height };
  }

  function isVideoFile(file) {
    if (file.type === 'video/mp4' || file.type === 'video/webm') return true;
    const ext = String(file.name || '').split('.').pop().toLowerCase();
    return VIDEO_EXTENSIONS.has(ext);
  }

  function isImageFile(file) {
    if (file.type.startsWith('image/')) return true;
    return /\.(jpe?g|png|webp|avif)$/i.test(String(file.name || ''));
  }

  function videoExtension(file) {
    const ext = String(file.name || '').split('.').pop().toLowerCase();
    return VIDEO_EXTENSIONS.has(ext) ? ext : '';
  }

  async function readVideoMetadata(file) {
    const ext = videoExtension(file);
    if (!ext) throw new Error('视频请使用 MP4 或 WebM 格式。');
    if (file.type && !['video/mp4', 'video/webm'].includes(file.type)) {
      throw new Error('这个视频的浏览器格式不是 MP4 / WebM，请先转换成 MP4 再上传。');
    }
    if (file.size > VIDEO_MAX) {
      throw new Error(`视频超过 ${Math.round(VIDEO_MAX / 1024 / 1024)} MB，请压缩后再上传。`);
    }
    const objectUrl = URL.createObjectURL(file);
    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = objectUrl;
      await new Promise((resolve, reject) => {
        video.addEventListener('loadedmetadata', resolve, { once: true });
        video.addEventListener('error', () => reject(new Error('无法读取这个视频，可能是编码格式不受支持。')), { once: true });
      });
      return {
        file,
        name: file.name,
        ext,
        type: ext === 'webm' ? 'video/webm' : 'video/mp4',
        bytes: file.size,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        seconds: Number.isFinite(video.duration) ? Math.round(video.duration * 10) / 10 : null,
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function videoFileBase(name) {
    return String(name || '').replace(/\.[^.]+$/, '').trim().toLowerCase();
  }

  async function attachVideoToItem(item, file) {
    const meta = await readVideoMetadata(file);
    item.video = meta;
    item.statusText = item.status === 'waiting' ? '已附带动态视频，等待发布' : item.statusText;
    const li = $(`.queue-item[data-key="${esc(item.key)}"]`, els.queueList);
    if (li) renderQueueVideo(item, li);
    return meta;
  }

  function pickVideoForItem(item) {
    if (state.busy) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/webm';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const meta = await attachVideoToItem(item, file);
        updateQueueItem(item);
        updatePublishSummary();
        toast(`已附加视频「${meta.name}」`);
      } catch (error) {
        toast(error.message || '视频添加失败', 'error');
      }
    });
    input.click();
  }

  function removeItemVideo(item) {
    if (state.busy) return;
    item.video = null;
    item.statusText = item.status === 'waiting' ? '等待发布' : item.statusText;
    const li = $(`.queue-item[data-key="${esc(item.key)}"]`, els.queueList);
    if (li) renderQueueVideo(item, li);
    updateQueueItem(item);
    updatePublishSummary();
    toast('已移除这张照片的动态视频');
  }

  function renderQueueVideo(item, li) {
    const wrap = $('.queue-video', li);
    if (!wrap) return;
    wrap.textContent = '';
    if (item.video) {
      const chip = document.createElement('span');
      chip.className = 'queue-video-chip';
      const detail = [formatBytes(item.video.bytes), item.video.seconds ? `${item.video.seconds} 秒` : ''].filter(Boolean).join(' · ');
      chip.title = `${item.video.name} · ${detail}`;
      chip.innerHTML = '<span aria-hidden="true">▸</span>';
      const name = document.createElement('span');
      name.className = 'queue-video-chip__name';
      name.textContent = item.video.name;
      const meta = document.createElement('small');
      meta.textContent = detail;
      chip.append(name, meta);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'queue-video-clear';
      remove.setAttribute('aria-label', `移除视频 ${item.video.name}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => removeItemVideo(item));
      const replace = document.createElement('button');
      replace.type = 'button';
      replace.className = 'queue-video-replace';
      replace.textContent = '更换';
      replace.addEventListener('click', () => pickVideoForItem(item));
      wrap.append(chip, replace, remove);
    } else {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'queue-video-add';
      add.innerHTML = '<span aria-hidden="true">＋</span> 添加动态视频（可选）';
      add.addEventListener('click', () => pickVideoForItem(item));
      wrap.appendChild(add);
    }
  }

  function photoId() {
    const now = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    const random = Math.random().toString(36).slice(2, 6);
    return `${stamp}-${random}`;
  }

  /* ---------------- queue UI ---------------- */
  function queueItemEl(item) {
    const li = document.createElement('li');
    li.className = 'queue-item';
    li.dataset.key = item.key;

    const thumb = document.createElement('div');
    thumb.className = 'queue-thumb';
    const img = document.createElement('img');
    img.src = item.thumbUrl;
    img.alt = '';
    thumb.appendChild(img);

    const main = document.createElement('div');
    main.className = 'queue-main';
    const row = document.createElement('div');
    row.className = 'queue-title-row';
    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'queue-title-input';
    title.value = item.title;
    title.maxLength = 80;
    title.setAttribute('aria-label', '照片标题');
    title.addEventListener('input', () => { item.title = title.value; });
    row.appendChild(title);
    const meta = document.createElement('p');
    meta.className = 'queue-meta';
    meta.textContent = `${item.file.name} · ${item.width && item.height ? `${item.width} × ${item.height}` : '读取尺寸中…'} · ${formatBytes(item.file.size)}`;
    const videoRow = document.createElement('div');
    videoRow.className = 'queue-video';
    const status = document.createElement('p');
    status.className = 'queue-status';
    status.textContent = item.statusText || '等待发布';
    const progress = document.createElement('div');
    progress.className = 'queue-progress';
    const bar = document.createElement('span');
    progress.appendChild(bar);
    main.append(row, meta, videoRow, status, progress);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'queue-remove';
    remove.setAttribute('aria-label', `移除 ${item.file.name}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => removeQueueItem(item.key));

    li.append(thumb, main, remove);
    renderQueueVideo(item, li);
    return li;
  }

  function renderQueue() {
    els.queueList.textContent = '';
    state.queue.forEach((item) => els.queueList.appendChild(queueItemEl(item)));
    els.queueWrap.hidden = state.queue.length === 0;
    els.queueCount.textContent = state.queue.length;
    refreshPublishVisibility();
    updatePublishSummary();
  }

  function updateQueueItem(item) {
    const li = $(`.queue-item[data-key="${esc(item.key)}"]`, els.queueList);
    if (!li) return;
    li.classList.toggle('is-processing', item.status === 'processing');
    li.classList.toggle('is-done', item.status === 'done');
    li.classList.toggle('is-error', item.status === 'error');
    const status = $('.queue-status', li);
    if (status) status.textContent = item.statusText || '等待发布';
    const bar = $('.queue-progress span', li);
    if (bar) bar.style.width = `${Math.round(item.progress || 0)}%`;
    const meta = $('.queue-meta', li);
    if (meta) {
      meta.textContent = `${item.file.name} · ${item.width && item.height ? `${item.width} × ${item.height}` : '读取尺寸中…'} · ${formatBytes(item.file.size)}`;
    }
    const remove = $('.queue-remove', li);
    if (remove) remove.hidden = item.status === 'processing';
  }

  function refreshPublishVisibility() {
    const hasQueue = state.queue.length > 0;
    const showingSuccess = Boolean(state.lastPublish);
    els.publishSettings.hidden = !hasQueue && !showingSuccess;
    if (!hasQueue && showingSuccess) {
      els.publishButton.disabled = true;
    }
    els.publishButton.disabled = state.busy || !state.connected || !hasQueue;
  }

  function updatePublishSummary() {
    if (state.lastPublish && !state.queue.length) {
      const count = state.lastPublish.count;
      els.publishSummary.innerHTML = `<strong>已发布 ${count} 张照片。</strong> GitHub Pages 通常会在 1 分钟内完成更新。`;
      return;
    }
    if (!state.queue.length) {
      els.publishSummary.textContent = '还没有添加照片';
      return;
    }
    const total = state.queue.reduce((sum, item) => sum + item.file.size, 0);
    const videos = state.queue.filter((item) => item.video).length;
    const group = els.groupSelect.value === '__new__'
      ? (els.newGroupName.value.trim() || '新分组')
      : (state.manifest?.groups || []).find((item) => String(item.id) === els.groupSelect.value)?.name || '分组';
    const videoText = videos ? ` · ${videos} 个视频` : '';
    els.publishSummary.innerHTML = `<strong>${state.queue.length} 张照片</strong>${videoText} · ${formatBytes(total)} 原始文件 · 将放入「${escapeHtml(group)}」`;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function addFiles(fileList) {
    if (!state.connected) {
      toast('请先连接仓库', 'error');
      return;
    }
    const files = [...fileList];
    if (!files.length) return;
    const images = files.filter(isImageFile);
    const videos = files.filter(isVideoFile);
    const unsupported = files.filter((file) => !isImageFile(file) && !isVideoFile(file));
    unsupported.forEach((file) => toast(`${file.name} 不是支持的照片或视频格式，已跳过`, 'error'));
    if (!images.length && !videos.length) return;
    if (images.length && state.queue.length >= QUEUE_MAX) {
      toast(`一次最多处理 ${QUEUE_MAX} 张照片`, 'error');
      return;
    }

    state.lastPublish = null;
    const capacity = QUEUE_MAX - state.queue.length;
    const acceptedImages = images.slice(0, capacity);
    if (images.length > capacity) toast(`一次最多 ${QUEUE_MAX} 张，多出的照片没有加入`, 'error');
    let added = 0;
    for (const file of acceptedImages) {
      if (file.size > IMAGE_MAX) {
        toast(`${file.name} 超过 40 MB，已跳过`, 'error');
        continue;
      }
      const duplicate = state.queue.some((item) => item.file.name === file.name
        && item.file.size === file.size
        && item.file.lastModified === file.lastModified);
      if (duplicate) {
        toast(`${file.name} 已经在列表里了`);
        continue;
      }
      let source;
      try {
        source = await decodeImage(file);
      } catch (error) {
        toast(`${file.name} 无法读取，可能是浏览器不支持的图片格式`, 'error');
        continue;
      }
      const size = sourceSize(source);
      if (source.close) source.close();
      if (!size.width || !size.height) {
        toast(`${file.name} 无法识别尺寸，已跳过`, 'error');
        continue;
      }
      const item = {
        key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        title: fileNameBase(file.name),
        width: size.width,
        height: size.height,
        thumbUrl: URL.createObjectURL(file),
        video: null,
        status: 'waiting',
        statusText: '等待发布',
        progress: 0,
      };
      state.queue.push(item);
      added += 1;
    }

    // Pair selected videos with photos that share the same base file name.
    let paired = 0;
    for (const file of videos) {
      const base = videoFileBase(file.name);
      const target = state.queue.find((item) => videoFileBase(item.file.name) === base);
      if (!target) {
        toast(`视频「${file.name}」没有找到同名照片，请在该照片下单独添加`, 'error');
        continue;
      }
      try {
        await attachVideoToItem(target, file);
        paired += 1;
      } catch (error) {
        toast(`视频「${file.name}」：${error.message || '无法读取'}`, 'error');
      }
    }

    els.fileInput.value = '';
    if (added || paired) {
      resetPublishOutput();
      renderQueue();
      const parts = [];
      if (added) parts.push(`${added} 张照片`);
      if (paired) parts.push(`${paired} 个动态视频`);
      toast(`${parts.join('、')}已加入，等待发布`);
    }
  }

  function removeQueueItem(key) {
    if (state.busy) return;
    const index = state.queue.findIndex((item) => item.key === key);
    if (index < 0) return;
    URL.revokeObjectURL(state.queue[index].thumbUrl);
    state.queue.splice(index, 1);
    if (!state.queue.length) state.lastPublish = null;
    renderQueue();
  }

  function clearQueue({ silent = false } = {}) {
    if (state.busy) return;
    state.queue.forEach((item) => URL.revokeObjectURL(item.thumbUrl));
    state.queue = [];
    if (!state.lastPublish) resetPublishOutput();
    renderQueue();
    if (!silent) toast('已清空待上传照片');
  }

  function resetPublishOutput() {
    state.lastPublish = null;
    els.progressWrap.hidden = true;
    els.progressBar.style.width = '0%';
    els.progressLabel.textContent = '准备中…';
    els.publishLog.textContent = '';
    els.publishButton.classList.remove('is-loading');
    updatePublishSummary();
    refreshPublishVisibility();
  }

  function setOverallProgress(percent, label) {
    els.progressWrap.hidden = false;
    els.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    if (label) els.progressLabel.textContent = label;
  }

  function logLine(message, kind = '') {
    const p = document.createElement('p');
    if (kind) p.className = `log-${kind}`;
    p.textContent = message;
    els.publishLog.appendChild(p);
    els.publishLog.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function logSuccess(message, links) {
    const p = document.createElement('p');
    p.className = 'log-success';
    p.textContent = message;
    els.publishLog.appendChild(p);
    if (links?.length) {
      const wrap = document.createElement('div');
      wrap.className = 'log-links';
      links.forEach(({ href, text }) => {
        const a = document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = text;
        wrap.appendChild(a);
      });
      els.publishLog.appendChild(wrap);
    }
  }

  /* ---------------- publishing ---------------- */
  async function apiCreateBlob(blob) {
    const content = await blobToBase64(blob);
    return api(`${repoApiPath()}/git/blobs`, {
      method: 'POST',
      body: { content, encoding: 'base64' },
    });
  }

  async function uploadBuffer(path, blob, treeEntries) {
    const result = await apiCreateBlob(blob);
    treeEntries.push({ path, mode: '100644', type: 'blob', sha: result.sha });
    return result.sha;
  }

  async function publish() {
    if (state.busy || !state.connected || !state.queue.length) return;
    state.busy = true;
    state.lastPublish = null;
    els.publishButton.classList.add('is-loading');
    els.publishButton.disabled = true;
    els.connectButton.disabled = true;
    els.fileInput.disabled = true;
    els.refreshButton.disabled = true;
    els.clearQueue.disabled = true;
    els.publishLog.textContent = '';
    els.progressWrap.hidden = false;
    setOverallProgress(1, '正在检查仓库的最新状态…');
    let group;
    try {
      group = resolveGroupForPublish();
      await fetchRepositoryState();
      renderGroupOptions();
      // resolve again in case the group already exists remotely
      els.groupSelect.value = group.id;
      if (!(state.manifest.groups || []).some((item) => String(item.id) === group.id)) {
        els.groupSelect.value = '__new__';
        els.newGroupName.value = group.name;
        els.newGroupDesc.value = group.description;
        group = resolveGroupForPublish();
      }
    } catch (error) {
      finishPublish();
      logLine(humanError(error), 'error');
      toast(humanError(error), 'error');
      return;
    }

    const treeEntries = [];
    const createdPhotos = [];
    const total = state.queue.length;

    try {
      for (let index = 0; index < total; index += 1) {
        const item = state.queue[index];
        const itemBase = (index / total) * 100;
        const itemSpan = 100 / total;
        item.status = 'processing';
        item.progress = 2;
        item.statusText = '正在生成两个尺寸…';
        updateQueueItem(item);
        setOverallProgress(itemBase + itemSpan * 0.05, `正在处理第 ${index + 1} / ${total} 张：${item.title}`);
        await sleep(30);

        let source;
        try {
          source = await decodeImage(item.file);
          const id = photoId();
          const folder = `media/${group.id}/${id}`;

          const large = await makeJpegVariant(source, LARGE_EDGE, 0.9);
          item.progress = 28;
          item.statusText = '高清版完成，正在压缩轻巧版…';
          updateQueueItem(item);
          const web = await makeJpegVariant(source, WEB_EDGE, 0.84);
          item.progress = 48;
          item.statusText = '图片准备好了，正在上传…';
          updateQueueItem(item);
          setOverallProgress(itemBase + itemSpan * 0.45, `第 ${index + 1} / ${total} 张：正在上传图片`);

          await uploadBuffer(`${folder}/large.jpg`, large.blob, treeEntries);
          item.progress = 68;
          updateQueueItem(item);
          await uploadBuffer(`${folder}/web.jpg`, web.blob, treeEntries);
          item.progress = 79;
          updateQueueItem(item);

          let videoMeta = null;
          if (item.video) {
            item.statusText = '正在上传你的动态视频…';
            updateQueueItem(item);
            const videoSrc = `${folder}/loop.${item.video.ext}`;
            await uploadBuffer(videoSrc, item.video.file, treeEntries);
            videoMeta = {
              src: videoSrc,
              poster: `${folder}/web.jpg`,
              type: item.video.type,
              ext: item.video.ext,
              seconds: item.video.seconds,
              bytes: item.video.bytes,
              width: item.video.width,
              height: item.video.height,
            };
          }

          item.progress = 93;
          item.statusText = '上传完成';
          updateQueueItem(item);

          createdPhotos.push({
            id,
            group: group.id,
            title: safeTitle(item.title),
            date: todayISO(),
            original: { width: item.width, height: item.height },
            variants: {
              large: {
                src: `${folder}/large.jpg`,
                width: large.width,
                height: large.height,
                bytes: large.blob.size,
                ext: 'jpg',
              },
              web: {
                src: `${folder}/web.jpg`,
                width: web.width,
                height: web.height,
                bytes: web.blob.size,
                ext: 'jpg',
              },
            },
            ...(videoMeta ? { video: videoMeta } : {}),
          });
          item.status = 'done';
          item.progress = 100;
          item.statusText = '已上传';
          updateQueueItem(item);
          setOverallProgress(itemBase + itemSpan * 0.96, `第 ${index + 1} / ${total} 张：完成`);
        } finally {
          if (source?.close) source.close();
        }
      }

      setOverallProgress(96, '正在写入照片清单…');
      const manifest = JSON.parse(JSON.stringify(state.manifest));
      if (group.isNew && !(manifest.groups || []).some((item) => String(item.id) === group.id)) {
        manifest.groups.push({ id: group.id, name: group.name, description: group.description });
      }
      manifest.photos = [...createdPhotos, ...(manifest.photos || [])];
      manifest.updatedAt = todayISO();
      if (!manifest.site) manifest.site = { title: '树屋', englishName: 'Tree Book House' };

      const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
      await uploadBuffer('data/gallery.json', manifestBlob, treeEntries);

      setOverallProgress(98, '正在创建一次提交…');
      const tree = await api(`${repoApiPath()}/git/trees`, {
        method: 'POST',
        body: { base_tree: state.treeSha, tree: treeEntries },
      });
      const countLabel = createdPhotos.length === 1 ? '1 photo' : `${createdPhotos.length} photos`;
      const commit = await api(`${repoApiPath()}/git/commits`, {
        method: 'POST',
        body: {
          message: `Add ${countLabel} · Tree Book House`,
          tree: tree.sha,
          parents: [state.headSha],
        },
      });
      await api(`${repoApiPath()}/git/refs/heads/${branchPath()}`, {
        method: 'PATCH',
        body: { sha: commit.sha, force: false },
      });

      state.headSha = commit.sha;
      state.treeSha = tree.sha;
      state.manifest = manifest;
      state.lastPublish = { count: createdPhotos.length, commit: commit.sha };
      state.busy = false;
      setOverallProgress(100, '发布完成');
      els.progressBar.style.width = '100%';

      // Leave a tidy success state.
      const successCount = createdPhotos.length;
      state.queue.forEach((item) => URL.revokeObjectURL(item.thumbUrl));
      state.queue = [];
      renderGroupOptions();
      els.groupSelect.value = group.id;
      updateNewGroupFields();
      els.newGroupName.value = '';
      els.newGroupDesc.value = '';
      renderManage();
      renderQueue();
      els.publishButton.classList.remove('is-loading');
      els.publishButton.disabled = true;
      els.progressWrap.hidden = false;
      els.progressLabel.textContent = '发布完成 · GitHub Pages 通常会在 1 分钟内更新';
      els.publishSummary.innerHTML = `<strong>已成功发布 ${successCount} 张照片。</strong> 等一下下，树屋就更新了。`;
      logSuccess('已提交到 GitHub。若页面还没变化，请等一分钟再刷新。', [
        { href: `${siteUrl()}?v=${Date.now()}`, text: '打开网站看看 →' },
        { href: `https://github.com/${state.repo}/commit/${commit.sha}`, text: '查看这次提交' },
      ]);
      toast('发布成功，树屋更新中…');
      els.connectButton.disabled = false;
      els.fileInput.disabled = false;
      els.refreshButton.disabled = false;
      els.clearQueue.disabled = false;
      refreshPublishVisibility();
    } catch (error) {
      const message = humanError(error);
      logLine(message, 'error');
      if (error?.message && error.message !== message) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = '查看更多错误信息';
        const pre = document.createElement('pre');
        pre.textContent = `${error.name || 'Error'}: ${error.message}`;
        details.append(summary, pre);
        els.publishLog.appendChild(details);
      }
      toast(message, 'error');
      const processing = state.queue.find((item) => item.status === 'processing');
      if (processing) {
        processing.status = 'error';
        processing.statusText = '处理或上传失败';
        updateQueueItem(processing);
      }
      els.progressLabel.textContent = '发布没有完成，请检查后重试';
      finishPublish();
      // Keep uploaded blobs harmless; no ref was changed unless commit succeeded.
      return;
    }
    state.busy = false;
  }

  function finishPublish() {
    state.busy = false;
    els.publishButton.classList.remove('is-loading');
    els.connectButton.disabled = false;
    els.fileInput.disabled = false;
    els.refreshButton.disabled = false;
    els.clearQueue.disabled = false;
    refreshPublishVisibility();
  }

  /* ---------------- manage ---------------- */
  function mediaBytes(photo) {
    return ['large', 'web'].reduce((sum, key) => sum + (Number(photo.variants?.[key]?.bytes) || 0), 0)
      + (Number(photo.video?.bytes) || 0);
  }

  function renderManage() {
    if (!state.manifest || !state.connected) return;
    const photos = state.manifest.photos || [];
    const groups = state.manifest.groups || [];
    els.totalPhotoCount.textContent = photos.length;
    els.totalGroupCount.textContent = new Set(photos.map((photo) => photo.group)).size;
    const totalBytes = photos.reduce((sum, photo) => sum + mediaBytes(photo), 0);
    els.repoSize.textContent = formatBytes(totalBytes);
    els.removeDemoButton.hidden = !photos.some((photo) => String(photo.id).startsWith('demo-'));
    els.manageEmpty.hidden = photos.length > 0;
    els.manageGroups.textContent = '';

    groups.forEach((group) => {
      const groupPhotos = photos.filter((photo) => String(photo.group) === String(group.id));
      if (!groupPhotos.length) return;
      const section = document.createElement('section');
      section.className = 'manage-group';
      const head = document.createElement('div');
      head.className = 'manage-group__head';
      const title = document.createElement('div');
      title.className = 'manage-group__title';
      const strong = document.createElement('strong');
      strong.textContent = group.name || '未命名分组';
      const desc = document.createElement('span');
      desc.textContent = group.description || '';
      title.append(strong, desc);
      const count = document.createElement('span');
      count.className = 'manage-group__count';
      count.textContent = `${groupPhotos.length} 张`;
      head.append(title, count);

      const photoWrap = document.createElement('div');
      photoWrap.className = 'manage-photos';
      groupPhotos.forEach((photo) => {
        const figure = document.createElement('figure');
        figure.className = 'manage-photo';
        const img = document.createElement('img');
        img.src = photo.variants?.web?.src || '';
        img.alt = photo.title || '照片';
        img.loading = 'lazy';
        const bar = document.createElement('div');
        bar.className = 'manage-photo__bar';
        const name = document.createElement('span');
        name.textContent = photo.title || '未命名';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.dataset.deletePhoto = photo.id;
        remove.setAttribute('aria-label', `从网站移除 ${photo.title || '这张照片'}`);
        remove.title = '从网站移除';
        remove.textContent = '×';
        bar.append(name, remove);
        figure.append(img, bar);
        photoWrap.appendChild(figure);
      });
      section.append(head, photoWrap);
      els.manageGroups.appendChild(section);
    });

    // Photos whose group is missing are still visible to the keeper.
    const orphaned = photos.filter((photo) => !groups.some((group) => String(group.id) === String(photo.group)));
    if (orphaned.length) {
      const section = document.createElement('section');
      section.className = 'manage-group';
      const head = document.createElement('div');
      head.className = 'manage-group__head';
      head.innerHTML = `<div class="manage-group__title"><strong>其他照片</strong><span>这些照片的分组已不存在</span></div><span class="manage-group__count">${orphaned.length} 张</span>`;
      const wrap = document.createElement('div');
      wrap.className = 'manage-photos';
      orphaned.forEach((photo) => {
        const figure = document.createElement('figure');
        figure.className = 'manage-photo';
        const img = document.createElement('img');
        img.src = photo.variants?.web?.src || '';
        img.alt = photo.title || '照片';
        img.loading = 'lazy';
        const bar = document.createElement('div');
        bar.className = 'manage-photo__bar';
        const name = document.createElement('span');
        name.textContent = photo.title || '未命名';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.dataset.deletePhoto = photo.id;
        remove.textContent = '×';
        remove.setAttribute('aria-label', `从网站移除 ${photo.title || '这张照片'}`);
        bar.append(name, remove);
        figure.append(img, bar);
        wrap.appendChild(figure);
      });
      section.append(head, wrap);
      els.manageGroups.appendChild(section);
    }
  }

  async function confirmAction({ title, text, okText = '确定', danger = true }) {
    if (els.confirmDialog.open) return false;
    els.confirmTitle.textContent = title;
    els.confirmText.textContent = text;
    els.confirmOk.textContent = okText;
    els.confirmOk.className = danger ? 'danger-button' : 'primary-button';
    els.confirmDialog.showModal();
    return new Promise((resolve) => {
      const done = (value) => {
        els.confirmOk.removeEventListener('click', onOk);
        els.confirmCancel.removeEventListener('click', onCancel);
        els.confirmDialog.removeEventListener('cancel', onCancelEvent);
        els.confirmDialog.removeEventListener('click', onBackdrop);
        if (els.confirmDialog.open) els.confirmDialog.close();
        resolve(value);
      };
      const onOk = () => done(true);
      const onCancel = () => done(false);
      const onCancelEvent = (event) => { event.preventDefault(); done(false); };
      const onBackdrop = (event) => { if (event.target === els.confirmDialog) done(false); };
      els.confirmOk.addEventListener('click', onOk);
      els.confirmCancel.addEventListener('click', onCancel);
      els.confirmDialog.addEventListener('cancel', onCancelEvent);
      els.confirmDialog.addEventListener('click', onBackdrop);
    });
  }

  async function deletePhotos(photoIds, message = '照片会从网站上移除。') {
    if (!photoIds.length) return;
    const ok = await confirmAction({
      title: `移除 ${photoIds.length} 张照片？`,
      text: `${message} 原图不会被修改，但你将无法从网站访问这些照片。`,
      okText: '确认移除',
      danger: true,
    });
    if (!ok) return;
    if (state.busy) return;
    state.busy = true;
    els.refreshButton.disabled = true;
    els.removeDemoButton.disabled = true;
    try {
      await fetchRepositoryState();
      const ids = new Set(photoIds.map(String));
      const removing = (state.manifest.photos || []).filter((photo) => ids.has(String(photo.id)));
      if (!removing.length) throw new Error('这些照片已经不在仓库里了。');
      const remainingPhotos = (state.manifest.photos || []).filter((photo) => !ids.has(String(photo.id)));
      const remainingGroupIds = new Set(remainingPhotos.map((photo) => String(photo.group)));
      const remainingGroups = (state.manifest.groups || []).filter((group) => remainingGroupIds.has(String(group.id)));
      const updated = {
        ...state.manifest,
        photos: remainingPhotos,
        groups: remainingGroups,
        updatedAt: todayISO(),
      };

      const deletePaths = new Set();
      removing.forEach((photo) => {
        ['large', 'web'].forEach((key) => {
          const src = photo.variants?.[key]?.src;
          if (src) deletePaths.add(src);
        });
        if (photo.video?.src) deletePaths.add(photo.video.src);
        if (photo.video?.poster && !deletePaths.has(photo.video.poster)) {
          // Only delete a poster if it is unique to this photo.
          const usedElsewhere = remainingPhotos.some((other) => other.video?.poster === photo.video.poster);
          if (!usedElsewhere) deletePaths.add(photo.video.poster);
        }
      });

      const treeEntries = [...deletePaths].map((path) => ({ path, mode: '100644', type: 'blob', sha: null }));
      const manifestBlob = new Blob([JSON.stringify(updated, null, 2)], { type: 'application/json' });
      const manifestSha = (await apiCreateBlob(manifestBlob)).sha;
      treeEntries.push({ path: 'data/gallery.json', mode: '100644', type: 'blob', sha: manifestSha });
      const tree = await api(`${repoApiPath()}/git/trees`, {
        method: 'POST',
        body: { base_tree: state.treeSha, tree: treeEntries },
      });
      const commit = await api(`${repoApiPath()}/git/commits`, {
        method: 'POST',
        body: {
          message: `Remove ${removing.length} photo${removing.length === 1 ? '' : 's'} · Tree Book House`,
          tree: tree.sha,
          parents: [state.headSha],
        },
      });
      await api(`${repoApiPath()}/git/refs/heads/${branchPath()}`, {
        method: 'PATCH',
        body: { sha: commit.sha, force: false },
      });
      state.manifest = updated;
      state.headSha = commit.sha;
      state.treeSha = tree.sha;
      state.lastPublish = null;
      renderGroupOptions();
      renderManage();
      refreshPublishVisibility();
      resetPublishOutput();
      toast('照片已从网站移除');
    } catch (error) {
      toast(humanError(error), 'error');
    } finally {
      state.busy = false;
      els.refreshButton.disabled = !state.connected;
      els.removeDemoButton.disabled = false;
    }
  }

  async function refreshFromGitHub({ notify = true } = {}) {
    if (!state.connected || state.busy) return;
    els.refreshButton.disabled = true;
    try {
      await fetchRepositoryState();
      renderGroupOptions();
      renderManage();
      if (notify) toast('已刷新仓库里的最新内容');
    } catch (error) {
      toast(humanError(error), 'error');
    } finally {
      els.refreshButton.disabled = !state.connected;
    }
  }

  /* ---------------- events ---------------- */
  function bindEvents() {
    els.setupForm.addEventListener('submit', (event) => {
      event.preventDefault();
      connect();
    });
    els.tokenToggle.addEventListener('click', () => {
      const show = els.tokenInput.type === 'password';
      els.tokenInput.type = show ? 'text' : 'password';
      els.tokenToggle.textContent = show ? '隐藏' : '显示';
      els.tokenToggle.setAttribute('aria-label', show ? '隐藏 Token' : '显示 Token');
    });
    els.openGuide.addEventListener('click', () => {
      const help = $('.setup-help');
      if (help) {
        help.open = true;
        help.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    els.groupSelect.addEventListener('change', () => {
      updateNewGroupFields();
      updatePublishSummary();
    });
    els.newGroupName.addEventListener('input', updatePublishSummary);
    els.newGroupDesc.addEventListener('input', updatePublishSummary);

    els.dropzone.addEventListener('click', () => els.fileInput.click());
    els.dropzone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        els.fileInput.click();
      }
    });
    els.fileInput.addEventListener('change', () => addFiles(els.fileInput.files));
    ['dragenter', 'dragover'].forEach((type) => {
      els.dropzone.addEventListener(type, (event) => {
        event.preventDefault();
        if (!state.busy) els.dropzone.classList.add('is-dragging');
      });
    });
    ['dragleave', 'dragend'].forEach((type) => {
      els.dropzone.addEventListener(type, (event) => {
        if (type === 'dragleave' && els.dropzone.contains(event.relatedTarget)) return;
        els.dropzone.classList.remove('is-dragging');
      });
    });
    els.dropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      els.dropzone.classList.remove('is-dragging');
      if (!state.busy) addFiles(event.dataTransfer.files);
    });

    els.clearQueue.addEventListener('click', () => clearQueue());
    els.publishButton.addEventListener('click', publish);
    els.refreshButton.addEventListener('click', () => refreshFromGitHub());

    els.manageGroups.addEventListener('click', (event) => {
      const button = event.target.closest('[data-delete-photo]');
      if (!button) return;
      const id = button.dataset.deletePhoto;
      const photo = state.manifest?.photos.find((item) => String(item.id) === String(id));
      if (!photo) return;
      deletePhotos([id], `「${photo.title || '这张照片'}」会从网站上移除。`);
    });
    els.removeDemoButton.addEventListener('click', () => {
      const demos = (state.manifest?.photos || []).filter((photo) => String(photo.id).startsWith('demo-'));
      if (!demos.length) return;
      deletePhotos(
        demos.map((photo) => photo.id),
        `这些示例照片只用于展示排版，移除后网站就只展示你上传的照片。没有其他照片的分组也会一并删除。`,
      );
    });

    window.addEventListener('beforeunload', (event) => {
      if (state.busy) {
        event.preventDefault();
        event.returnValue = '';
        return '';
      }
      state.queue.forEach((item) => URL.revokeObjectURL(item.thumbUrl));
      return undefined;
    });
  }

  function boot() {
    initConfig();
    bindEvents();
    updateDisconnectedUI();
    updateNewGroupFields();
    refreshPublishVisibility();

    const cfg = readConfig();
    if (cfg.repo && cfg.branch) {
      els.repoInput.value = cfg.repo;
      els.branchInput.value = cfg.branch;
    }
    if (cfg.token && cfg.remember) {
      state.autoConnecting = true;
      window.setTimeout(() => connect({ silent: true }), 350);
    }
  }

  boot();
})();
