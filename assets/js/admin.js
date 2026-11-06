/* =========================================================
   Tree Book House — static, serverless keeper's desk
   Uses the GitHub Git Data API to publish photos in one commit.
   ========================================================= */
(() => {
  'use strict';

  const API = 'https://api.github.com';
  const CONFIG_KEY = 'tbh-admin-config-v1';
  const IMAGE_MAX = 80 * 1024 * 1024;
  const PREVIEW_EDGE = 1280;
  const PREVIEW_QUALITY = 0.82;
  const VIDEO_PREVIEW_BITRATE = 2_000_000;
  const QUEUE_MAX = 30;
  const VIDEO_MAX = 60 * 1024 * 1024;
  const VIDEO_EXTENSIONS = new Set(['mp4', 'webm']);
  const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);

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
    versionEditor: $('#versionEditor'),
    versionSlots: $('#versionSlots'),
    resetEditor: $('#resetEditor'),
    addPhotoButton: $('#addPhotoButton'),
    editorHint: $('#editorHint'),
    photoTitle: $('#photoTitle'),
    photoNote: $('#photoNote'),
    largeInput: $('#largeInput'),
    webInput: $('#webInput'),
    wallpaperInput: $('#wallpaperInput'),
    largePreview: $('#largePreview'),
    webPreview: $('#webPreview'),
    wallpaperPreview: $('#wallpaperPreview'),
    largeFile: $('#largeFile'),
    webFile: $('#webFile'),
    wallpaperFile: $('#wallpaperFile'),
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
    editDialog: $('#editDialog'),
    editClose: $('#editClose'),
    editCancel: $('#editCancel'),
    editSave: $('#editSave'),
    editStatus: $('#editStatus'),
    editPhotoTitle: $('#editPhotoTitle'),
    editPhotoNote: $('#editPhotoNote'),
    editGroupSelect: $('#editGroupSelect'),
    editLargeInput: $('#editLargeInput'),
    editLargePreview: $('#editLargePreview'),
    editLargeMeta: $('#editLargeMeta'),
    editLargeState: $('#editLargeState'),
    editWebInput: $('#editWebInput'),
    editWebPreview: $('#editWebPreview'),
    editWebMeta: $('#editWebMeta'),
    editWebState: $('#editWebState'),
    editWallpaperInput: $('#editWallpaperInput'),
    editWallpaperPreview: $('#editWallpaperPreview'),
    editWallpaperMeta: $('#editWallpaperMeta'),
    editWallpaperState: $('#editWallpaperState'),
    editWallpaperEmpty: $('#editWallpaperEmpty'),
    editWallpaperRemove: $('#editWallpaperRemove'),
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
    editor: {
      large: null,
      web: null,
      wallpaper: null,
    },
    edit: null,
    editSaving: false,
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
    updateEditorState();
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
    updateEditorState();
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

  /* ---------------- editor: three uploaded versions ---------------- */
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
        else reject(new Error('预览图生成失败，请重试。'));
      }, type, quality);
    });
  }

  async function makePreviewImage(source) {
    const src = sourceSize(source);
    if (!src.width || !src.height) throw new Error('无法读取这张图片的尺寸。');
    const scale = Math.min(1, PREVIEW_EDGE / Math.max(src.width, src.height));
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
    const blob = await canvasToBlob(canvas, 'image/jpeg', PREVIEW_QUALITY);
    return { blob, width, height };
  }

  async function makeVideoPreview(file, meta) {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
    const srcWidth = Number(meta.width) || 0;
    const srcHeight = Number(meta.height) || 0;
    if (!srcWidth || !srcHeight) return null;
    if (Math.max(srcWidth, srcHeight) <= PREVIEW_EDGE) return null;

    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find((type) => MediaRecorder.isTypeSupported(type));
    if (!mime) return null;

    const scale = PREVIEW_EDGE / Math.max(srcWidth, srcHeight);
    const width = Math.max(2, Math.round((srcWidth * scale) / 2) * 2);
    const height = Math.max(2, Math.round((srcHeight * scale) / 2) * 2);
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = objectUrl;

    try {
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error('无法读取动态壁纸视频。'));
      });
      const duration = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : Number(meta.seconds) || 0;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, width, height);
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: VIDEO_PREVIEW_BITRATE,
      });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      const stopped = new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = () => reject(new Error('动态壁纸预览生成失败。'));
      });
      recorder.start(250);
      try {
        await video.play();
        await new Promise((resolve) => {
          let finished = false;
          const finish = () => {
            if (finished) return;
            finished = true;
            resolve();
          };
          const draw = () => {
            if (video.ended || (duration && video.currentTime >= duration - 0.03)) {
              finish();
              return;
            }
            ctx.drawImage(video, 0, 0, width, height);
            if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(draw);
            else requestAnimationFrame(draw);
          };
          draw();
          window.setTimeout(finish, Math.max(3000, (duration + 2) * 1000));
        });
      } finally {
        video.pause();
        if (recorder.state !== 'inactive') recorder.stop();
        await stopped;
        stream.getTracks().forEach((track) => track.stop());
      }
      const blob = new Blob(chunks, { type: 'video/webm' });
      if (blob.size < 2000) return null;
      return {
        blob,
        width,
        height,
        seconds: Math.round(duration * 10) / 10,
        type: 'video/webm',
        ext: 'webm',
      };
    } finally {
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
    }
  }

  function extensionOf(file) {
    return String(file?.name || '').split('.').pop().toLowerCase();
  }

  function imageExtension(file) {
    const ext = extensionOf(file);
    if (IMAGE_EXTENSIONS.has(ext)) return ext;
    if (file.type === 'image/jpeg') return 'jpg';
    if (file.type === 'image/png') return 'png';
    if (file.type === 'image/webp') return 'webp';
    if (file.type === 'image/avif') return 'avif';
    return '';
  }

  function isImageFile(file) {
    if (file.type.startsWith('image/')) return true;
    return IMAGE_EXTENSIONS.has(extensionOf(file));
  }

  function isVideoFile(file) {
    if (file.type === 'video/mp4' || file.type === 'video/webm') return true;
    return VIDEO_EXTENSIONS.has(extensionOf(file));
  }

  function videoExtension(file) {
    const ext = extensionOf(file);
    return VIDEO_EXTENSIONS.has(ext) ? ext : '';
  }

  async function readVideoMetadata(file) {
    const ext = videoExtension(file);
    if (!ext) throw new Error('动态壁纸请使用 MP4 或 WebM 格式。');
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

  function slotLabel(kind) {
    return kind === 'wallpaper' ? '动态壁纸' : kind === 'large' ? '高清版' : '轻巧版';
  }

  function slotDetails(kind, data) {
    if (kind === 'wallpaper') {
      return [data.seconds ? `${data.seconds} 秒` : '', formatBytes(data.bytes)].filter(Boolean).join(' · ');
    }
    return `${data.width} × ${data.height} · ${formatBytes(data.bytes)}`;
  }

  function renderEditorSlot(kind) {
    const label = $(`.version-slot[data-slot="${esc(kind)}"]`, els.versionSlots);
    if (!label) return;
    const data = state.editor[kind];
    label.classList.toggle('has-file', Boolean(data));
    const previewWrap = $('.version-slot__preview', label);
    const fileEl = kind === 'wallpaper' ? els.wallpaperFile : kind === 'large' ? els.largeFile : els.webFile;
    if (previewWrap) previewWrap.hidden = !data;
    if (fileEl) {
      fileEl.hidden = !data;
      fileEl.textContent = data ? `${data.name} · ${slotDetails(kind, data)}` : '';
    }
    if (kind === 'wallpaper') {
      const video = els.wallpaperPreview;
      if (data) {
        video.src = data.previewUrl;
        video.hidden = false;
      } else {
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.hidden = true;
      }
      return;
    }
    const image = kind === 'large' ? els.largePreview : els.webPreview;
    if (data) {
      image.src = data.previewUrl;
      image.hidden = false;
    } else {
      image.removeAttribute('src');
      image.hidden = true;
    }
  }

  function setEditorSlot(kind, data) {
    const previous = state.editor[kind];
    if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
    state.editor[kind] = data;
    renderEditorSlot(kind);
    updateEditorState();
  }

  function clearEditorSlot(kind) {
    const previous = state.editor[kind];
    if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
    state.editor[kind] = null;
    renderEditorSlot(kind);
  }

  function resetEditor({ silent = false } = {}) {
    ['large', 'web', 'wallpaper'].forEach((kind) => clearEditorSlot(kind));
    els.photoTitle.value = '';
    els.photoNote.value = '';
    ['largeInput', 'webInput', 'wallpaperInput'].forEach((key) => { if (els[key]) els[key].value = ''; });
    updateEditorState();
    if (!silent) toast('已清空当前照片的三个选择');
  }

  function editorMissing() {
    const missing = [];
    if (!state.editor.large) missing.push('高清版');
    if (!state.editor.web) missing.push('轻巧版');
    return missing;
  }

  function updateEditorState() {
    if (!els.addPhotoButton) return;
    const missing = editorMissing();
    const full = state.queue.length >= QUEUE_MAX;
    const ready = missing.length === 0 && !full && state.connected && !state.busy;
    els.addPhotoButton.disabled = !ready;
    let hint = '';
    if (full) hint = `待发布列表已满（${QUEUE_MAX} 张），请先发布或清空。`;
    else if (missing.length) hint = `还需要选择${missing.join('和')}。`;
    else if (!state.editor.wallpaper) hint = '高清版和轻巧版已准备好；动态壁纸可选。';
    else hint = '三个版本都准备好了，可以添加到待发布。';
    if (els.editorHint) els.editorHint.textContent = hint;
  }

  function setEditorBusy(busy) {
    [els.largeInput, els.webInput, els.wallpaperInput, els.photoTitle, els.photoNote, els.resetEditor].forEach((control) => {
      if (control) control.disabled = busy;
    });
    updateEditorState();
  }

  async function handleSlotFile(kind, file) {
    if (!file || state.busy) return;
    try {
      if (kind === 'wallpaper') {
        if (!isVideoFile(file)) throw new Error('动态壁纸请选择 MP4 或 WebM 视频。');
        const meta = await readVideoMetadata(file);
        setEditorSlot(kind, { ...meta, previewUrl: URL.createObjectURL(file) });
        toast(`已选择动态壁纸「${file.name}」`);
        return;
      }

      if (!isImageFile(file)) throw new Error('请选择 JPG / PNG / WebP / AVIF 图片。');
      const ext = imageExtension(file);
      if (!ext) throw new Error('图片格式请使用 JPG / PNG / WebP / AVIF。');
      if (file.size > IMAGE_MAX) {
        throw new Error(`图片超过 ${Math.round(IMAGE_MAX / 1024 / 1024)} MB，请选择小一些的文件。`);
      }
      const source = await decodeImage(file);
      const size = sourceSize(source);
      if (source.close) source.close();
      if (!size.width || !size.height) throw new Error('无法读取这张图片的尺寸。');
      setEditorSlot(kind, {
        file,
        name: file.name,
        ext,
        type: file.type,
        width: size.width,
        height: size.height,
        bytes: file.size,
        previewUrl: URL.createObjectURL(file),
      });
      if (kind === 'large' && !els.photoTitle.value.trim()) {
        els.photoTitle.value = fileNameBase(file.name);
      }
      toast(`已选择${slotLabel(kind)}「${file.name}」`);
    } catch (error) {
      toast(error.message || '文件读取失败', 'error');
    } finally {
      const input = kind === 'wallpaper' ? els.wallpaperInput : kind === 'large' ? els.largeInput : els.webInput;
      if (input) input.value = '';
      updateEditorState();
    }
  }

  function copyEditorFile(data, kind) {
    if (!data) return null;
    if (kind === 'wallpaper') {
      return {
        file: data.file,
        name: data.name,
        ext: data.ext,
        type: data.type,
        bytes: data.bytes,
        width: data.width,
        height: data.height,
        seconds: data.seconds,
      };
    }
    return {
      file: data.file,
      name: data.name,
      ext: data.ext,
      type: data.type,
      bytes: data.bytes,
      width: data.width,
      height: data.height,
    };
  }

  function addEditorPhoto() {
    if (!state.connected) {
      toast('请先连接仓库', 'error');
      return;
    }
    if (state.busy) return;
    if (state.queue.length >= QUEUE_MAX) {
      toast(`待发布列表已满（最多 ${QUEUE_MAX} 张）`, 'error');
      return;
    }
    const missing = editorMissing();
    if (missing.length) {
      toast(`还需要选择${missing.join('和')}`, 'error');
      return;
    }
    const large = state.editor.large;
    const web = state.editor.web;
    const wallpaper = state.editor.wallpaper;
    const item = {
      key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: els.photoTitle.value.trim() || fileNameBase(large.name),
      note: els.photoNote.value.trim(),
      width: large.width,
      height: large.height,
      files: {
        large: copyEditorFile(large, 'large'),
        web: copyEditorFile(web, 'web'),
        wallpaper: copyEditorFile(wallpaper, 'wallpaper'),
      },
      thumbUrl: URL.createObjectURL(web.file),
      status: 'waiting',
      statusText: '等待发布',
      progress: 0,
    };
    state.queue.push(item);
    resetEditor({ silent: true });
    resetPublishOutput();
    renderQueue();
    toast('已添加到待发布照片');
  }

  function photoId() {
    const now = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    const random = Math.random().toString(36).slice(2, 6);
    return `${stamp}-${random}`;
  }

  /* ---------------- queue UI ---------------- */
  function queueVersionChip(label, detail, extraClass = '') {
    const chip = document.createElement('span');
    chip.className = `queue-version ${extraClass}`.trim();
    const name = document.createElement('strong');
    name.textContent = label;
    const value = document.createElement('small');
    value.textContent = detail;
    chip.append(name, value);
    return chip;
  }

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

    const note = document.createElement('textarea');
    note.className = 'queue-note';
    note.value = item.note || '';
    note.maxLength = 240;
    note.rows = 2;
    note.placeholder = '照片介绍（可选，会显示在下载弹窗里）';
    note.setAttribute('aria-label', '照片介绍');
    note.addEventListener('input', () => { item.note = note.value; });

    const versions = document.createElement('div');
    versions.className = 'queue-versions';
    versions.append(
      queueVersionChip('高清版', `${item.files.large.width} × ${item.files.large.height} · ${formatBytes(item.files.large.bytes)}`),
      queueVersionChip('轻巧版', `${item.files.web.width} × ${item.files.web.height} · ${formatBytes(item.files.web.bytes)}`),
    );
    if (item.files.wallpaper) {
      versions.append(queueVersionChip(
        '动态壁纸',
        [item.files.wallpaper.seconds ? `${item.files.wallpaper.seconds} 秒` : '', formatBytes(item.files.wallpaper.bytes)].filter(Boolean).join(' · '),
        'queue-version--wallpaper',
      ));
    } else {
      versions.append(queueVersionChip('动态壁纸', '未添加', 'queue-version--muted'));
    }

    const status = document.createElement('p');
    status.className = 'queue-status';
    status.textContent = item.statusText || '等待发布';
    const progress = document.createElement('div');
    progress.className = 'queue-progress';
    const bar = document.createElement('span');
    progress.appendChild(bar);
    main.append(row, note, versions, status, progress);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'queue-remove';
    remove.setAttribute('aria-label', `移除 ${item.title || '这张照片'}`);
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
    updateEditorState();
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
    updateEditorState();
  }

  function updatePublishSummary() {
    if (state.lastPublish && !state.queue.length) {
      const count = state.lastPublish.count;
      els.publishSummary.innerHTML = `<strong>已发布 ${count} 张照片。</strong> GitHub Pages 和 Cloudflare Pages 通常会在 1 分钟内完成更新。`;
      return;
    }
    if (!state.queue.length) {
      els.publishSummary.textContent = '还没有添加照片';
      return;
    }
    const total = state.queue.reduce((sum, item) => {
      return sum + item.files.large.bytes + item.files.web.bytes + (item.files.wallpaper?.bytes || 0);
    }, 0);
    const wallpapers = state.queue.filter((item) => item.files.wallpaper).length;
    const group = els.groupSelect.value === '__new__'
      ? (els.newGroupName.value.trim() || '新分组')
      : (state.manifest?.groups || []).find((item) => String(item.id) === els.groupSelect.value)?.name || '分组';
    const videoText = wallpapers ? ` · ${wallpapers} 个动态壁纸` : '';
    els.publishSummary.innerHTML = `<strong>${state.queue.length} 张照片</strong>${videoText} · ${formatBytes(total)} · 将放入「${escapeHtml(group)}」`;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    els.refreshButton.disabled = true;
    els.clearQueue.disabled = true;
    setEditorBusy(true);
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
        const id = photoId();
        const folder = `media/${group.id}/${id}`;
        const large = item.files.large;
        const web = item.files.web;
        const wallpaper = item.files.wallpaper;

        item.status = 'processing';
        item.progress = 4;
        item.statusText = '正在生成 720P 静图预览…';
        updateQueueItem(item);
        setOverallProgress(itemBase + itemSpan * 0.04, `第 ${index + 1} / ${total} 张：正在生成预览`);

        let previewImage = null;
        try {
          const source = await decodeImage(large.file);
          try {
            previewImage = await makePreviewImage(source);
          } finally {
            if (source.close) source.close();
          }
        } catch (_) {
          previewImage = null;
        }

        item.progress = 12;
        item.statusText = '正在上传高清版…';
        updateQueueItem(item);
        setOverallProgress(itemBase + itemSpan * 0.1, `第 ${index + 1} / ${total} 张：正在上传高清版`);

        await uploadBuffer(`${folder}/large.${large.ext}`, large.file, treeEntries);
        item.progress = 42;
        item.statusText = '正在上传轻巧版…';
        updateQueueItem(item);
        setOverallProgress(itemBase + itemSpan * 0.4, `第 ${index + 1} / ${total} 张：正在上传轻巧版`);

        await uploadBuffer(`${folder}/web.${web.ext}`, web.file, treeEntries);
        item.progress = 68;
        updateQueueItem(item);

        let previewMeta = null;
        if (previewImage) {
          item.statusText = '正在上传 720P 静图预览…';
          updateQueueItem(item);
          const previewSrc = `${folder}/preview.jpg`;
          await uploadBuffer(previewSrc, previewImage.blob, treeEntries);
          previewMeta = {
            src: previewSrc,
            width: previewImage.width,
            height: previewImage.height,
            bytes: previewImage.blob.size,
            ext: 'jpg',
          };
        }
        item.progress = 76;
        updateQueueItem(item);

        let videoMeta = null;
        if (wallpaper) {
          item.statusText = '正在上传动态壁纸…';
          updateQueueItem(item);
          setOverallProgress(itemBase + itemSpan * 0.72, `第 ${index + 1} / ${total} 张：正在上传动态壁纸`);
          const videoSrc = `${folder}/wallpaper.${wallpaper.ext}`;
          await uploadBuffer(videoSrc, wallpaper.file, treeEntries);
          videoMeta = {
            src: videoSrc,
            poster: `${folder}/web.${web.ext}`,
            type: wallpaper.type,
            ext: wallpaper.ext,
            seconds: wallpaper.seconds,
            bytes: wallpaper.bytes,
            width: wallpaper.width,
            height: wallpaper.height,
          };
        }

        if (wallpaper && Math.max(wallpaper.width || 0, wallpaper.height || 0) > PREVIEW_EDGE) {
          item.statusText = '正在生成 720P 动态预览…';
          updateQueueItem(item);
          try {
            const generated = await makeVideoPreview(wallpaper.file, wallpaper);
            if (generated) {
              const previewSrc = `${folder}/video-preview.webm`;
              await uploadBuffer(previewSrc, generated.blob, treeEntries);
              videoMeta = {
                ...videoMeta,
                preview: {
                  src: previewSrc,
                  width: generated.width,
                  height: generated.height,
                  seconds: generated.seconds,
                  bytes: generated.blob.size,
                  type: 'video/webm',
                  ext: 'webm',
                },
              };
            }
          } catch (_) {
            // The original video remains the fallback when a preview cannot be encoded.
          }
        }

        item.progress = 94;
        item.statusText = '上传完成';
        updateQueueItem(item);

        createdPhotos.push({
          id,
          group: group.id,
          title: safeTitle(item.title),
          note: String(item.note || '').trim(),
          date: todayISO(),
          original: { width: large.width, height: large.height },
          ...(previewMeta ? { preview: previewMeta } : {}),
          variants: {
            large: {
              src: `${folder}/large.${large.ext}`,
              width: large.width,
              height: large.height,
              bytes: large.bytes,
              ext: large.ext,
            },
            web: {
              src: `${folder}/web.${web.ext}`,
              width: web.width,
              height: web.height,
              bytes: web.bytes,
              ext: web.ext,
            },
          },
          ...(videoMeta ? { video: videoMeta } : {}),
        });
        item.status = 'done';
        item.progress = 100;
        item.statusText = '已上传';
        updateQueueItem(item);
        setOverallProgress(itemBase + itemSpan * 0.98, `第 ${index + 1} / ${total} 张：完成`);
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
      els.progressLabel.textContent = '发布完成 · GitHub Pages 与 Cloudflare Pages 通常会在 1 分钟内更新';
      els.publishSummary.innerHTML = `<strong>已成功发布 ${successCount} 张照片。</strong> 等一下下，两个站点就会更新。`;
      logSuccess('已提交到 GitHub。GitHub Pages 和 Cloudflare Pages 都会自动更新。', [
        { href: `${siteUrl()}?v=${Date.now()}`, text: '打开网站看看 →' },
        { href: `https://github.com/${state.repo}/commit/${commit.sha}`, text: '查看这次提交' },
      ]);
      toast('发布成功，两个站点都在更新中…');
      els.connectButton.disabled = false;
      els.refreshButton.disabled = false;
      els.clearQueue.disabled = false;
      setEditorBusy(false);
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
        processing.statusText = '上传失败';
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
    els.refreshButton.disabled = false;
    els.clearQueue.disabled = false;
    setEditorBusy(false);
    refreshPublishVisibility();
  }

  /* ---------------- manage ---------------- */
  function mediaBytes(photo) {
    return ['large', 'web'].reduce((sum, key) => sum + (Number(photo.variants?.[key]?.bytes) || 0), 0)
      + (Number(photo.preview?.bytes) || 0)
      + (Number(photo.video?.bytes) || 0)
      + (Number(photo.video?.preview?.bytes) || 0);
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
        figure.tabIndex = 0;
        figure.setAttribute('role', 'button');
        figure.setAttribute('aria-label', `编辑照片：${photo.title || '未命名'}`);
        const img = document.createElement('img');
        img.src = photo.preview?.src || photo.variants?.web?.src || '';
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
        figure.addEventListener('click', (event) => {
          if (event.target.closest('[data-delete-photo]')) return;
          openEditDialog(photo.id);
        });
        figure.addEventListener('keydown', (event) => {
          if (event.target !== figure) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          openEditDialog(photo.id);
        });
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
        figure.tabIndex = 0;
        figure.setAttribute('role', 'button');
        figure.setAttribute('aria-label', `编辑照片：${photo.title || '未命名'}`);
        const img = document.createElement('img');
        img.src = photo.preview?.src || photo.variants?.web?.src || '';
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
        figure.addEventListener('click', (event) => {
          if (event.target.closest('[data-delete-photo]')) return;
          openEditDialog(photo.id);
        });
        figure.addEventListener('keydown', (event) => {
          if (event.target !== figure) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          openEditDialog(photo.id);
        });
        wrap.appendChild(figure);
      });
      section.append(head, wrap);
      els.manageGroups.appendChild(section);
    }
  }

  /* ---------------- edit an existing photo ---------------- */
  function editFilePreviewUrl(data) {
    return data?.previewUrl || null;
  }

  function revokeEditObjectUrls() {
    if (!state.edit) return;
    Object.values(state.edit.files || {}).forEach((data) => {
      if (data?.previewUrl) URL.revokeObjectURL(data.previewUrl);
    });
  }

  function setEditStatus(text, type = '') {
    els.editStatus.textContent = text;
    els.editStatus.dataset.type = type;
  }

  function editPhoto() {
    const id = state.edit?.photoId;
    return (state.manifest?.photos || []).find((photo) => String(photo.id) === String(id)) || null;
  }

  function editSlotData(kind) {
    return state.edit?.files?.[kind] || null;
  }

  function renderEditSlots() {
    const photo = editPhoto();
    if (!photo || !state.edit) return;
    const large = photo.variants?.large || {};
    const web = photo.variants?.web || {};
    const replacements = state.edit.files;

    const largeSrc = replacements.large?.previewUrl
      || photo.preview?.src
      || large.src
      || web.src || '';
    if (els.editLargePreview) els.editLargePreview.src = largeSrc;
    if (els.editLargeMeta) {
      const data = replacements.large || large;
      els.editLargeMeta.textContent = data.width && data.height
        ? `${data.width} × ${data.height}${data.bytes ? ` · ${formatBytes(data.bytes)}` : ''}`
        : '尚未设置';
    }
    if (els.editLargeState) els.editLargeState.textContent = replacements.large ? '待替换' : '当前版本';
    $('[data-edit-slot="large"]', els.editDialog)?.classList.toggle('is-replaced', Boolean(replacements.large));

    const webSrc = replacements.web?.previewUrl || web.src || '';
    if (els.editWebPreview) els.editWebPreview.src = webSrc;
    if (els.editWebMeta) {
      const data = replacements.web || web;
      els.editWebMeta.textContent = data.width && data.height
        ? `${data.width} × ${data.height}${data.bytes ? ` · ${formatBytes(data.bytes)}` : ''}`
        : '尚未设置';
    }
    if (els.editWebState) els.editWebState.textContent = replacements.web ? '待替换' : '当前版本';
    $('[data-edit-slot="web"]', els.editDialog)?.classList.toggle('is-replaced', Boolean(replacements.web));

    const currentVideo = photo.video || null;
    const replacementVideo = replacements.wallpaper;
    const removed = state.edit.removeVideo;
    if (els.editWallpaperPreview) {
      els.editWallpaperPreview.pause();
      if (replacementVideo?.previewUrl) {
        els.editWallpaperPreview.src = replacementVideo.previewUrl;
        els.editWallpaperPreview.load();
        els.editWallpaperEmpty.hidden = true;
      } else {
        els.editWallpaperPreview.removeAttribute('src');
        els.editWallpaperPreview.load();
        if (currentVideo?.poster && !removed) {
          els.editWallpaperPreview.poster = photo.preview?.src || currentVideo.poster;
        } else {
          els.editWallpaperPreview.removeAttribute('poster');
        }
        els.editWallpaperEmpty.hidden = Boolean(currentVideo && !removed);
      }
    }
    if (els.editWallpaperMeta) {
      if (replacementVideo) {
        els.editWallpaperMeta.textContent = [
          replacementVideo.width && replacementVideo.height ? `${replacementVideo.width} × ${replacementVideo.height}` : '',
          replacementVideo.seconds ? `${replacementVideo.seconds} 秒` : '',
          replacementVideo.bytes ? formatBytes(replacementVideo.bytes) : '',
        ].filter(Boolean).join(' · ');
      } else if (removed || !currentVideo) {
        els.editWallpaperMeta.textContent = '未设置动态壁纸';
      } else {
        els.editWallpaperMeta.textContent = [
          currentVideo.width && currentVideo.height ? `${currentVideo.width} × ${currentVideo.height}` : '',
          currentVideo.seconds ? `${currentVideo.seconds} 秒` : '',
          currentVideo.bytes ? formatBytes(currentVideo.bytes) : '',
        ].filter(Boolean).join(' · ');
      }
    }
    if (els.editWallpaperState) {
      els.editWallpaperState.textContent = replacementVideo ? '待替换' : removed ? '已移除' : currentVideo ? '当前版本' : '暂无';
    }
    $('[data-edit-slot="wallpaper"]', els.editDialog)?.classList.toggle('is-replaced', Boolean(replacementVideo));
    if (els.editWallpaperRemove) {
      els.editWallpaperRemove.hidden = !currentVideo && !replacementVideo;
      els.editWallpaperRemove.textContent = replacementVideo ? '取消替换' : removed ? '撤销移除' : '移除';
    }
    if ($('#editWallpaperPick')) {
      $('#editWallpaperPick').firstChild.textContent = currentVideo || replacementVideo ? '更换视频 ' : '选择视频 ';
    }
  }

  function populateEditGroups(photo) {
    els.editGroupSelect.textContent = '';
    const groups = state.manifest?.groups || [];
    groups.forEach((group) => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name || '未命名分组';
      els.editGroupSelect.appendChild(option);
    });
    if (!groups.some((group) => String(group.id) === String(photo.group))) {
      const option = document.createElement('option');
      option.value = photo.group;
      option.textContent = '原分组（未找到）';
      els.editGroupSelect.appendChild(option);
    }
    els.editGroupSelect.value = photo.group;
  }

  function openEditDialog(photoId) {
    if (!state.connected || state.editSaving) return;
    const photo = (state.manifest?.photos || []).find((item) => String(item.id) === String(photoId));
    if (!photo) {
      toast('找不到这张照片，请刷新后再试。', 'error');
      return;
    }
    if (state.edit) revokeEditObjectUrls();
    state.edit = {
      photoId: String(photo.id),
      files: { large: null, web: null, wallpaper: null },
      removeVideo: false,
    };
    els.editPhotoTitle.value = photo.title || '';
    els.editPhotoNote.value = photo.note || '';
    populateEditGroups(photo);
    [els.editLargeInput, els.editWebInput, els.editWallpaperInput].forEach((input) => {
      if (input) input.value = '';
    });
    setEditStatus('修改会直接更新这张照片，不会新建一张。');
    renderEditSlots();
    if (!els.editDialog.open) els.editDialog.showModal();
  }

  function closeEditDialog() {
    if (state.editSaving) return;
    revokeEditObjectUrls();
    state.edit = null;
    if (els.editDialog.open) els.editDialog.close();
  }

  async function readEditImage(kind, file) {
    if (!file || !state.edit) return;
    if (!isImageFile(file)) throw new Error('请选择 JPG / PNG / WebP / AVIF 图片。');
    const ext = imageExtension(file);
    if (!ext) throw new Error('图片格式请使用 JPG / PNG / WebP / AVIF。');
    if (file.size > IMAGE_MAX) throw new Error(`图片超过 ${Math.round(IMAGE_MAX / 1024 / 1024)} MB。`);
    const source = await decodeImage(file);
    const size = sourceSize(source);
    if (source.close) source.close();
    if (!size.width || !size.height) throw new Error('无法读取这张图片的尺寸。');
    const previous = state.edit.files[kind];
    if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
    state.edit.files[kind] = {
      file,
      name: file.name,
      ext,
      type: file.type,
      width: size.width,
      height: size.height,
      bytes: file.size,
      previewUrl: URL.createObjectURL(file),
    };
    renderEditSlots();
    setEditStatus(`${kind === 'large' ? '高清版' : '轻巧版'}已选择新文件，保存后替换。`);
  }

  async function readEditVideo(file) {
    if (!file || !state.edit) return;
    if (!isVideoFile(file)) throw new Error('动态壁纸请选择 MP4 / WebM 视频。');
    const meta = await readVideoMetadata(file);
    const previous = state.edit.files.wallpaper;
    if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
    state.edit.files.wallpaper = { ...meta, previewUrl: URL.createObjectURL(file) };
    state.edit.removeVideo = false;
    renderEditSlots();
    setEditStatus('已选择新的动态壁纸，保存后会重新生成 720P 预览。');
  }

  function removeEditVideo() {
    if (!state.edit) return;
    const replacement = state.edit.files.wallpaper;
    if (replacement?.previewUrl) URL.revokeObjectURL(replacement.previewUrl);
    state.edit.files.wallpaper = null;
    if (state.edit.removeVideo) {
      state.edit.removeVideo = false;
      setEditStatus('已取消移除动态壁纸。');
    } else if (editPhoto()?.video) {
      state.edit.removeVideo = true;
      setEditStatus('动态壁纸会在保存后移除。', 'error');
    }
    renderEditSlots();
  }

  function uniqueEditPath(folder, base, ext, stamp) {
    return `${folder}/${base}-${stamp}.${ext}`;
  }

  async function saveEditPhoto() {
    if (!state.edit || !state.edit.photoId || state.editSaving) return;
    if (!state.connected) {
      toast('请先连接仓库', 'error');
      return;
    }
    state.editSaving = true;
    els.editSave.disabled = true;
    els.editCancel.disabled = true;
    els.editClose.disabled = true;
    setEditStatus('正在读取仓库最新状态…');
    try {
      await fetchRepositoryState();
      const photo = editPhoto();
      if (!photo) throw new Error('这张照片已经不存在了，请刷新后再试。');
      const folderSource = photo.variants?.large?.src || photo.variants?.web?.src || '';
      const folder = folderSource.split('/').slice(0, -1).join('/');
      if (!folder) throw new Error('无法确定这张照片的存储位置。');
      const updatedPhoto = JSON.parse(JSON.stringify(photo));
      const treeEntries = [];
      const deletePaths = new Set();
      const stamp = Date.now().toString(36);
      updatedPhoto.title = safeTitle(els.editPhotoTitle.value.trim() || photo.title);
      updatedPhoto.note = els.editPhotoNote.value.trim();
      const nextGroup = els.editGroupSelect.value;
      if ((state.manifest.groups || []).some((group) => String(group.id) === String(nextGroup))) {
        updatedPhoto.group = nextGroup;
      }

      const largeReplacement = state.edit.files.large;
      const webReplacement = state.edit.files.web;
      const wallpaperReplacement = state.edit.files.wallpaper;

      if (largeReplacement) {
        setEditStatus('正在上传新的高清版…');
        const src = uniqueEditPath(folder, 'large', largeReplacement.ext, stamp);
        await uploadBuffer(src, largeReplacement.file, treeEntries);
        if (photo.variants?.large?.src) deletePaths.add(photo.variants.large.src);
        updatedPhoto.variants = updatedPhoto.variants || {};
        updatedPhoto.variants.large = {
          src,
          width: largeReplacement.width,
          height: largeReplacement.height,
          bytes: largeReplacement.bytes,
          ext: largeReplacement.ext,
        };
        updatedPhoto.original = { width: largeReplacement.width, height: largeReplacement.height };
        setEditStatus('正在生成新的 720P 预览图…');
        try {
          const source = await decodeImage(largeReplacement.file);
          try {
            const preview = await makePreviewImage(source);
            const previewSrc = uniqueEditPath(folder, 'preview', 'jpg', stamp);
            await uploadBuffer(previewSrc, preview.blob, treeEntries);
            if (photo.preview?.src) deletePaths.add(photo.preview.src);
            updatedPhoto.preview = {
              src: previewSrc,
              width: preview.width,
              height: preview.height,
              bytes: preview.blob.size,
              ext: 'jpg',
            };
          } finally {
            if (source.close) source.close();
          }
        } catch (_) {
          if (photo.preview?.src) deletePaths.add(photo.preview.src);
          delete updatedPhoto.preview;
        }
      }

      if (webReplacement) {
        setEditStatus('正在上传新的轻巧版…');
        const src = uniqueEditPath(folder, 'web', webReplacement.ext, stamp);
        await uploadBuffer(src, webReplacement.file, treeEntries);
        const oldWeb = photo.variants?.web?.src;
        if (oldWeb) deletePaths.add(oldWeb);
        updatedPhoto.variants = updatedPhoto.variants || {};
        updatedPhoto.variants.web = {
          src,
          width: webReplacement.width,
          height: webReplacement.height,
          bytes: webReplacement.bytes,
          ext: webReplacement.ext,
        };
        if (updatedPhoto.video && (!updatedPhoto.video.poster || updatedPhoto.video.poster === oldWeb)) {
          updatedPhoto.video.poster = src;
        }
      }

      if (state.edit.removeVideo) {
        if (photo.video?.src) deletePaths.add(photo.video.src);
        if (photo.video?.preview?.src) deletePaths.add(photo.video.preview.src);
        delete updatedPhoto.video;
      } else if (wallpaperReplacement) {
        setEditStatus('正在上传新的动态壁纸…');
        const src = uniqueEditPath(folder, 'wallpaper', wallpaperReplacement.ext, stamp);
        await uploadBuffer(src, wallpaperReplacement.file, treeEntries);
        if (photo.video?.src) deletePaths.add(photo.video.src);
        if (photo.video?.preview?.src) deletePaths.add(photo.video.preview.src);
        let videoPreview = null;
        if (Math.max(wallpaperReplacement.width || 0, wallpaperReplacement.height || 0) > PREVIEW_EDGE) {
          setEditStatus('正在生成新的 720P 动态预览…');
          try {
            const generated = await makeVideoPreview(wallpaperReplacement.file, wallpaperReplacement);
            if (generated) {
              const previewSrc = uniqueEditPath(folder, 'video-preview', 'webm', stamp);
              await uploadBuffer(previewSrc, generated.blob, treeEntries);
              videoPreview = {
                src: previewSrc,
                width: generated.width,
                height: generated.height,
                seconds: generated.seconds,
                bytes: generated.blob.size,
                type: 'video/webm',
                ext: 'webm',
              };
            }
          } catch (_) {
            videoPreview = null;
          }
        }
        updatedPhoto.video = {
          src,
          poster: updatedPhoto.variants?.web?.src || photo.video?.poster || '',
          type: wallpaperReplacement.type,
          ext: wallpaperReplacement.ext,
          seconds: wallpaperReplacement.seconds,
          bytes: wallpaperReplacement.bytes,
          width: wallpaperReplacement.width,
          height: wallpaperReplacement.height,
          ...(videoPreview ? { preview: videoPreview } : {}),
        };
      }

      setEditStatus('正在写入照片清单…');
      const manifest = JSON.parse(JSON.stringify(state.manifest));
      const index = manifest.photos.findIndex((item) => String(item.id) === String(state.edit.photoId));
      if (index < 0) throw new Error('照片清单已变化，请刷新后再试。');
      manifest.photos[index] = updatedPhoto;
      manifest.updatedAt = todayISO();
      const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
      await uploadBuffer('data/gallery.json', manifestBlob, treeEntries);

      const newPaths = new Set(treeEntries.map((entry) => entry.path));
      [...deletePaths].forEach((path) => {
        if (!newPaths.has(path)) treeEntries.push({ path, mode: '100644', type: 'blob', sha: null });
      });

      setEditStatus('正在创建提交…');
      const tree = await api(`${repoApiPath()}/git/trees`, {
        method: 'POST',
        body: { base_tree: state.treeSha, tree: treeEntries },
      });
      const commit = await api(`${repoApiPath()}/git/commits`, {
        method: 'POST',
        body: {
          message: `Edit photo · ${updatedPhoto.title || 'Untitled'} · Tree Book House`,
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
      state.editSaving = false;
      revokeEditObjectUrls();
      state.edit = null;
      if (els.editDialog.open) els.editDialog.close();
      renderGroupOptions();
      renderManage();
      toast('照片已更新，两个站点都在重新生成中');
    } catch (error) {
      const message = humanError(error);
      setEditStatus(message, 'error');
      toast(message, 'error');
    } finally {
      state.editSaving = false;
      els.editSave.disabled = false;
      els.editCancel.disabled = false;
      els.editClose.disabled = false;
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
      const ids = new Set(photoIds.map(String));
      let committed = false;
      let lastError = null;
      for (let attempt = 0; attempt < 3 && !committed; attempt += 1) {
        await fetchRepositoryState();
        const removing = (state.manifest.photos || []).filter((photo) => ids.has(String(photo.id)));
        if (!removing.length) {
          // A previous attempt may have committed successfully just before a
          // transient network/ref error; treat the desired end state as success.
          committed = true;
          break;
        }
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
          if (photo.preview?.src) deletePaths.add(photo.preview.src);
          if (photo.video?.src) deletePaths.add(photo.video.src);
          if (photo.video?.preview?.src && photo.video.preview.src !== photo.video.src) {
            deletePaths.add(photo.video.preview.src);
          }
          if (photo.video?.poster && !deletePaths.has(photo.video.poster)) {
            // Only delete a poster if it is unique to this photo.
            const usedElsewhere = remainingPhotos.some((other) => other.video?.poster === photo.video.poster);
            if (!usedElsewhere) deletePaths.add(photo.video.poster);
          }
        });

        try {
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
          committed = true;
        } catch (error) {
          lastError = error;
          const retryable = error?.status === 409 || error?.status === 422;
          if (!retryable || attempt >= 2) throw error;
          // GitHub can return a transient conflict if the branch moved between
          // our ref read and the update. Refresh the latest head and try again.
          await sleep(800 + attempt * 700);
        }
      }
      if (!committed) throw lastError || new Error('移除失败，请刷新后再试。');
      state.lastPublish = null;
      renderGroupOptions();
      renderManage();
      refreshPublishVisibility();
      resetPublishOutput();
      toast('照片已从网站移除');
    } catch (error) {
      console.error('[Tree Book House] delete failed:', error);
      const detail = error?.data?.message ? `（${error.data.message}）` : '';
      toast(`${humanError(error)}${detail}`, 'error');
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

    [
      ['large', els.largeInput],
      ['web', els.webInput],
      ['wallpaper', els.wallpaperInput],
    ].forEach(([kind, input]) => {
      input.addEventListener('change', () => handleSlotFile(kind, input.files?.[0]));
    });
    $$('.version-slot', els.versionSlots).forEach((slot) => {
      slot.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        slot.querySelector('input')?.click();
      });
    });
    els.resetEditor.addEventListener('click', () => resetEditor());
    els.addPhotoButton.addEventListener('click', addEditorPhoto);

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

    els.editClose.addEventListener('click', closeEditDialog);
    els.editCancel.addEventListener('click', closeEditDialog);
    els.editSave.addEventListener('click', saveEditPhoto);
    els.editDialog.addEventListener('cancel', (event) => {
      if (state.editSaving) {
        event.preventDefault();
        return;
      }
      revokeEditObjectUrls();
      state.edit = null;
    });
    els.editDialog.addEventListener('click', (event) => {
      if (event.target === els.editDialog) closeEditDialog();
    });
    [
      ['large', els.editLargeInput, readEditImage],
      ['web', els.editWebInput, readEditImage],
    ].forEach(([kind, input, handler]) => {
      input.addEventListener('change', async () => {
        try {
          await handler(kind, input.files?.[0]);
        } catch (error) {
          setEditStatus(error.message || '图片读取失败', 'error');
          toast(error.message || '图片读取失败', 'error');
        } finally {
          input.value = '';
        }
      });
    });
    els.editWallpaperInput.addEventListener('change', async () => {
      try {
        await readEditVideo(els.editWallpaperInput.files?.[0]);
      } catch (error) {
        setEditStatus(error.message || '视频读取失败', 'error');
        toast(error.message || '视频读取失败', 'error');
      } finally {
        els.editWallpaperInput.value = '';
      }
    });
    els.editWallpaperRemove.addEventListener('click', removeEditVideo);

    window.addEventListener('beforeunload', (event) => {
      if (state.busy) {
        event.preventDefault();
        event.returnValue = '';
        return '';
      }
      state.queue.forEach((item) => URL.revokeObjectURL(item.thumbUrl));
      ['large', 'web', 'wallpaper'].forEach((kind) => {
        const previewUrl = state.editor[kind]?.previewUrl;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      });
      if (state.edit) {
        Object.values(state.edit.files || {}).forEach((data) => {
          if (data?.previewUrl) URL.revokeObjectURL(data.previewUrl);
        });
      }
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
