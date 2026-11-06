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
  const VIDEO_EDGE = 1280;
  const VIDEO_SECONDS = 6;

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
    videoToggle: $('#videoToggle'),
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

  function pickRecorderMime() {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
    const candidates = [
      { mime: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4', type: 'video/mp4' },
      { mime: 'video/mp4', ext: 'mp4', type: 'video/mp4' },
      { mime: 'video/webm;codecs=vp9', ext: 'webm', type: 'video/webm' },
      { mime: 'video/webm;codecs=vp8', ext: 'webm', type: 'video/webm' },
      { mime: 'video/webm', ext: 'webm', type: 'video/webm' },
    ];
    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate.mime)) || null;
  }

  function drawLoopFrame(ctx, source, width, height, t) {
    const cycle = 0.5 - 0.5 * Math.cos(Math.PI * 2 * t);
    const scale = 1.035 + 0.045 * cycle;
    const dw = width * scale;
    const dh = height * scale;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(source, (width - dw) / 2, (height - dh) / 2, dw, dh);

    const gx = width * (0.18 + 0.64 * (0.5 - 0.5 * Math.cos(Math.PI * 2 * t + 0.7)));
    const wash = ctx.createRadialGradient(gx, height * 0.26, 0, gx, height * 0.26, width * 0.82);
    wash.addColorStop(0, 'rgba(255,249,220,0.19)');
    wash.addColorStop(0.55, 'rgba(255,236,224,0.06)');
    wash.addColorStop(1, 'rgba(255,240,230,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < 14; i += 1) {
      const seed = i * 1.618;
      const fx = ((seed * 0.37 + t * (0.025 + (i % 4) * 0.006)) % 1.08) - 0.04;
      const fy = 0.12 + ((seed * 0.71 + t * 0.018) % 0.8);
      const r = width * (0.012 + (i % 5) * 0.005);
      const alpha = 0.10 + 0.16 * (0.5 + 0.5 * Math.sin(Math.PI * 2 * (t + i * 0.17)));
      const bokeh = ctx.createRadialGradient(fx * width, fy * height, 0, fx * width, fy * height, r * 3);
      bokeh.addColorStop(0, `rgba(255,248,214,${alpha.toFixed(3)})`);
      bokeh.addColorStop(1, 'rgba(255,248,214,0)');
      ctx.fillStyle = bokeh;
      ctx.beginPath();
      ctx.arc(fx * width, fy * height, r * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    const vignette = ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.3,
      width / 2, height / 2, Math.max(width, height) * 0.72,
    );
    vignette.addColorStop(0, 'rgba(90,55,42,0)');
    vignette.addColorStop(1, 'rgba(90,55,42,0.11)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  async function makeLoopVideo(source) {
    const codec = pickRecorderMime();
    if (!codec) {
      throw new Error('当前浏览器不支持生成视频。请使用最新版 Chrome、Edge 或 Safari 再试。');
    }
    if (document.hidden) {
      throw new Error('请让这个页面保持在前台，再开始生成视频。');
    }
    const src = sourceSize(source);
    let width = src.width;
    let height = src.height;
    if (width >= height) {
      width = Math.min(VIDEO_EDGE, width);
      height = Math.round(src.height * (width / src.width));
    } else {
      height = Math.min(VIDEO_EDGE, height);
      width = Math.round(src.width * (height / src.height));
    }
    width = Math.max(2, Math.round(width / 2) * 2);
    height = Math.max(2, Math.round(height / 2) * 2);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    drawLoopFrame(ctx, source, width, height, 0);
    const stream = canvas.captureStream(24);
    const bitrate = Math.min(2_800_000, Math.max(900_000, Math.round(width * height * 24 * 0.072)));
    const recorder = new MediaRecorder(stream, { mimeType: codec.mime, videoBitsPerSecond: bitrate });
    const chunks = [];
    const blob = await new Promise((resolve, reject) => {
      let finished = false;
      const timeout = window.setTimeout(() => {
        if (finished) return;
        finished = true;
        try { if (recorder.state !== 'inactive') recorder.stop(); } catch (_) {}
        stream.getTracks().forEach((track) => track.stop());
        reject(new Error('视频生成超时，请重试或关闭“自动生成动态背景视频”。'));
      }, 15000);

      recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
      recorder.onerror = (event) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        stream.getTracks().forEach((track) => track.stop());
        reject(event.error || new Error('视频生成失败。'));
      };
      recorder.onstop = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        stream.getTracks().forEach((track) => track.stop());
        resolve(new Blob(chunks, { type: codec.type }));
      };

      const startedAt = performance.now();
      recorder.start(200);
      const tick = (now) => {
        const progress = Math.min(1, (now - startedAt) / (VIDEO_SECONDS * 1000));
        drawLoopFrame(ctx, source, width, height, progress);
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          window.setTimeout(() => {
            if (recorder.state !== 'inactive') recorder.stop();
          }, 90);
        }
      };
      requestAnimationFrame(tick);
    });

    return { blob, ext: codec.ext, type: codec.type, width, height, seconds: VIDEO_SECONDS };
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
    const status = document.createElement('p');
    status.className = 'queue-status';
    status.textContent = '等待生成';
    const progress = document.createElement('div');
    progress.className = 'queue-progress';
    const bar = document.createElement('span');
    progress.appendChild(bar);
    main.append(row, meta, status, progress);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'queue-remove';
    remove.setAttribute('aria-label', `移除 ${item.file.name}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => removeQueueItem(item.key));

    li.append(thumb, main, remove);
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
    if (status) status.textContent = item.statusText || '等待生成';
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
      els.videoToggle.disabled = true;
    } else if (hasQueue) {
      els.videoToggle.disabled = state.busy;
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
    const group = els.groupSelect.value === '__new__'
      ? (els.newGroupName.value.trim() || '新分组')
      : (state.manifest?.groups || []).find((item) => String(item.id) === els.groupSelect.value)?.name || '分组';
    els.publishSummary.innerHTML = `<strong>${state.queue.length} 张照片</strong> · ${formatBytes(total)} 原始文件 · 将放入「${escapeHtml(group)}」`;
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
    if (state.queue.length >= QUEUE_MAX) {
      toast(`一次最多处理 ${QUEUE_MAX} 张照片`, 'error');
      return;
    }
    state.lastPublish = null;
    const remaining = QUEUE_MAX - state.queue.length;
    const accepted = files.slice(0, remaining);
    if (files.length > remaining) toast(`一次最多 ${QUEUE_MAX} 张，多出的照片没有加入`, 'error');
    let added = 0;
    for (const file of accepted) {
      if (!file.type.startsWith('image/')) {
        toast(`${file.name} 不是图片文件，已跳过`, 'error');
        continue;
      }
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
        status: 'waiting',
        statusText: '等待生成',
        progress: 0,
      };
      state.queue.push(item);
      added += 1;
    }
    els.fileInput.value = '';
    if (added) {
      resetPublishOutput();
      renderQueue();
      toast(added === 1 ? '照片已加入，准备生成' : `${added} 张照片已加入`);
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
    if (!els.videoToggle.checked) {
      const proceed = await confirmAction({
        title: '不生成动态视频吗？',
        text: '关闭后，这次发布的照片将没有动态预览，也没有视频下载链接。建议保持开启。',
        okText: '仍然发布',
        danger: false,
      });
      if (!proceed) return;
    }
    state.busy = true;
    state.lastPublish = null;
    els.publishButton.classList.add('is-loading');
    els.publishButton.disabled = true;
    els.connectButton.disabled = true;
    els.fileInput.disabled = true;
    els.refreshButton.disabled = true;
    els.clearQueue.disabled = true;
    els.videoToggle.disabled = true;
    els.publishLog.textContent = '';
    els.progressWrap.hidden = false;
    setOverallProgress(1, '正在检查仓库的最新状态…');
    let group;
    try {
      group = resolveGroupForPublish();
      if (els.videoToggle.checked && !pickRecorderMime()) {
        throw new Error('这个浏览器不支持生成 WebM / MP4 视频。请使用最新版 Chrome、Edge 或 Safari。');
      }
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
          item.progress = 45;
          item.statusText = '图片准备好了，正在生成动态视频…';
          updateQueueItem(item);
          setOverallProgress(itemBase + itemSpan * 0.42, `第 ${index + 1} / ${total} 张：正在生成循环视频`);

          let videoMeta = null;
          if (els.videoToggle.checked) {
            const video = await makeLoopVideo(source);
            videoMeta = {
              src: `${folder}/loop.${video.ext}`,
              poster: `${folder}/web.jpg`,
              type: video.type,
              ext: video.ext,
              seconds: video.seconds,
              bytes: video.blob.size,
              width: video.width,
              height: video.height,
            };
            item.progress = 68;
            item.statusText = '视频完成，正在上传…';
            updateQueueItem(item);
            await uploadBuffer(`${folder}/large.jpg`, large.blob, treeEntries);
            item.progress = 78;
            updateQueueItem(item);
            await uploadBuffer(`${folder}/web.jpg`, web.blob, treeEntries);
            item.progress = 86;
            updateQueueItem(item);
            await uploadBuffer(videoMeta.src, video.blob, treeEntries);
          } else {
            await uploadBuffer(`${folder}/large.jpg`, large.blob, treeEntries);
            item.progress = 76;
            updateQueueItem(item);
            await uploadBuffer(`${folder}/web.jpg`, web.blob, treeEntries);
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
      els.videoToggle.disabled = false;
      els.videoToggle.checked = true;
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
        processing.statusText = '生成或上传失败';
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
    els.videoToggle.disabled = false;
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
      const manifestSha = await apiCreateBlob(manifestBlob);
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
