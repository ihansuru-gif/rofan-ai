(() => {
  if (window.__DGV__) return;

  const api = window.screenShareGallery || window.discordGallery;
  const state = {
    provider: 'discord',
    focus: false,
    observer: null,
    refreshTimer: null,
    callRoot: null,
    pipCapture: false,
    pipCaptureTimer: null,
    pipCaptureBusy: false,
    captureCanvases: new Map(),
    pipOpen: false
  };

  const CAPTURE_INTERVAL_MS = 160;
  const MAX_CAPTURE_WIDTH = 480;
  const MAX_CAPTURE_HEIGHT = 270;
  const MAX_CAPTURE_STREAMS = 12;
  const JPEG_QUALITY = 0.72;

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 120 && rect.height > 68 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function getVisibleVideos(root = document) {
    return [...root.querySelectorAll('video')].filter(isVisible);
  }

  function commonAncestor(nodes) {
    if (!nodes.length) return null;
    let current = nodes[0];
    while (current && current !== document.body) {
      if (nodes.every((node) => current.contains(node))) return current;
      current = current.parentElement;
    }
    return null;
  }

  function selectorCandidates() {
    const discordSelectors = [
      '[class*="callContainer_"]', '[class*="videoGrid_"]', '[class*="callContainer"]', '[class*="videoGrid"]'
    ];
    const jitsiSelectors = [
      '#largeVideoContainer', '#filmstripRemoteVideos', '.videocontainer',
      '[class*="tile-view"]', '[class*="tileView"]', '[class*="stage"]', '[class*="filmstrip"]'
    ];
    return state.provider === 'jitsi' ? jitsiSelectors : discordSelectors;
  }

  function findKnownCallContainer() {
    const candidates = selectorCandidates().flatMap((selector) => [...document.querySelectorAll(selector)]).filter(isVisible);
    return candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.width * br.height) - (ar.width * ar.height);
    })[0] || null;
  }

  function expandToUsefulRoot(seed) {
    if (!seed) return null;
    let node = seed;
    let best = seed;
    const viewportArea = Math.max(1, innerWidth * innerHeight);

    while (node && node.parentElement && node.parentElement !== document.body) {
      const parent = node.parentElement;
      const rect = parent.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > viewportArea * 0.985) break;
      if (rect.width >= innerWidth * 0.45 && rect.height >= innerHeight * 0.35) best = parent;
      node = parent;
    }
    return best;
  }

  function findCallRoot() {
    const known = findKnownCallContainer();
    if (known) return expandToUsefulRoot(known);

    const videos = getVisibleVideos();
    if (!videos.length) return null;
    const shared = commonAncestor(videos);
    return expandToUsefulRoot(shared || videos[0].parentElement);
  }

  function elementMetadata(el) {
    const values = [];
    let node = el;
    for (let depth = 0; node && depth < 9; depth += 1, node = node.parentElement) {
      for (const name of ['aria-label', 'title', 'data-list-item-id', 'data-testid', 'data-video-type', 'data-track-type', 'data-source-type']) {
        const value = node.getAttribute?.(name);
        if (value) values.push(value);
      }
      if (typeof node.className === 'string') values.push(node.className);
      if (node.dataset) {
        for (const value of Object.values(node.dataset)) if (typeof value === 'string') values.push(value);
      }
    }
    return values.join(' ').toLowerCase();
  }

  function jitsiDesktopTrackIds() {
    const ids = new Set();
    try {
      const redux = window.APP?.store?.getState?.();
      const tracks = redux?.['features/base/tracks'];
      if (!Array.isArray(tracks)) return ids;

      for (const entry of tracks) {
        const jt = entry?.jitsiTrack;
        const videoType = String(entry?.videoType || jt?.videoType || jt?.getVideoType?.() || '').toLowerCase();
        if (videoType !== 'desktop') continue;

        const mediaTrack = jt?.getTrack?.() || jt?.track;
        if (mediaTrack?.id) ids.add(mediaTrack.id);
        if (jt?.stream?.id) ids.add(jt.stream.id);
        if (entry?.participantId) ids.add(String(entry.participantId));
        if (jt?.getParticipantId?.()) ids.add(String(jt.getParticipantId()));
        if (jt?._sourceName) ids.add(String(jt._sourceName));
        if (jt?.sourceName) ids.add(String(jt.sourceName));
      }
    } catch (_) {}
    return ids;
  }

  function matchesJitsiDesktopTrack(video, desktopIds) {
    if (!desktopIds.size) return false;
    try {
      const stream = video.srcObject;
      if (stream?.id && desktopIds.has(stream.id)) return true;
      for (const track of stream?.getVideoTracks?.() || []) {
        if (desktopIds.has(track.id)) return true;
      }
    } catch (_) {}

    const meta = elementMetadata(video);
    for (const id of desktopIds) {
      if (id && meta.includes(String(id).toLowerCase())) return true;
    }
    return false;
  }

  function isLikelyScreenShare(video, desktopIds = new Set()) {
    if (state.provider === 'jitsi' && matchesJitsiDesktopTrack(video, desktopIds)) return true;
    const meta = elementMetadata(video);
    return /(desktop|screen.?share|screenshare|share.?screen|presentation|presenter|go live|공유|화면|스트림|방송)/i.test(meta);
  }

  function getPiPSourceVideos() {
    const root = findCallRoot() || document;
    const videos = getVisibleVideos(root)
      .filter((video) => video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0)
      .slice(0, MAX_CAPTURE_STREAMS * 2);

    if (!videos.length) return [];
    const desktopIds = state.provider === 'jitsi' ? jitsiDesktopTrackIds() : new Set();
    const screenShares = videos.filter((video) => isLikelyScreenShare(video, desktopIds));

    if (screenShares.length) return screenShares.slice(0, MAX_CAPTURE_STREAMS);
    if (state.provider === 'discord') return videos.slice(0, MAX_CAPTURE_STREAMS);
    return [];
  }

  function tryEnableGridView() {
    const patterns = state.provider === 'jitsi'
      ? [/tile view/i, /tileview/i, /타일/i, /격자/i, /그리드/i]
      : [/grid/i, /gallery/i, /격자/i, /그리드/i, /갤러리/i];
    const buttons = [...document.querySelectorAll('button,[role="button"]')];
    const target = buttons.find((button) => {
      const text = [button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent]
        .filter(Boolean).join(' ');
      return patterns.some((pattern) => pattern.test(text));
    });
    if (target && isVisible(target)) {
      try { target.click(); } catch (_) {}
    }
  }

  function clearRoot() {
    if (state.callRoot?.isConnected) state.callRoot.removeAttribute('data-dgv-call-root');
    document.querySelectorAll('[data-dgv-call-root="true"]').forEach((el) => el.removeAttribute('data-dgv-call-root'));
    state.callRoot = null;
  }

  function refreshRoot() {
    if (!state.focus) return;
    const root = findCallRoot();
    clearRoot();
    if (root) {
      state.callRoot = root;
      root.setAttribute('data-dgv-call-root', 'true');
      document.body.classList.remove('dgv-no-stream');
    } else {
      document.body.classList.add('dgv-no-stream');
    }
  }

  function scheduleRefresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(refreshRoot, 120);
  }

  function canvasForVideo(video, width, height) {
    let canvas = state.captureCanvases.get(video);
    if (!canvas) {
      canvas = document.createElement('canvas');
      state.captureCanvases.set(video, canvas);
    }
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    return canvas;
  }

  function encodeVideoFrame(video) {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) return null;
    const scale = Math.min(1, MAX_CAPTURE_WIDTH / sourceWidth, MAX_CAPTURE_HEIGHT / sourceHeight);
    const width = Math.max(2, Math.round(sourceWidth * scale));
    const height = Math.max(2, Math.round(sourceHeight * scale));
    const canvas = canvasForVideo(video, width, height);
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) return null;
    try {
      context.drawImage(video, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    } catch (_) {
      return null;
    }
  }

  function pruneCaptureCanvases(activeVideos) {
    const active = new Set(activeVideos);
    for (const video of state.captureCanvases.keys()) {
      if (!active.has(video) || !video.isConnected) state.captureCanvases.delete(video);
    }
  }

  function capturePiPFrames() {
    if (!state.pipCapture || state.pipCaptureBusy) return;
    state.pipCaptureBusy = true;
    try {
      const videos = getPiPSourceVideos();
      pruneCaptureCanvases(videos);
      const frames = videos.map(encodeVideoFrame).filter(Boolean);
      api?.sendPiPFrames(frames);
    } finally {
      state.pipCaptureBusy = false;
    }
  }

  function schedulePiPCapture(immediate = false) {
    clearTimeout(state.pipCaptureTimer);
    if (!state.pipCapture) return;
    state.pipCaptureTimer = setTimeout(() => {
      capturePiPFrames();
      schedulePiPCapture(false);
    }, immediate ? 0 : CAPTURE_INTERVAL_MS);
  }

  function setPiPCapture(enabled) {
    state.pipCapture = Boolean(enabled);
    state.pipOpen = state.pipCapture;
    updatePiPButton();
    if (state.pipCapture) {
      tryEnableGridView();
      schedulePiPCapture(true);
    } else {
      clearTimeout(state.pipCaptureTimer);
      state.pipCaptureTimer = null;
      state.pipCaptureBusy = false;
      state.captureCanvases.clear();
    }
    return state.pipCapture;
  }

  async function togglePiP() {
    const open = await api?.togglePiP();
    state.pipOpen = Boolean(open);
    updatePiPButton();
    return state.pipOpen;
  }

  function updatePiPButton() {
    const button = document.getElementById('dgv-pip-launcher');
    if (!button) return;
    button.textContent = state.pipOpen ? '▣ PiP 닫기' : '▣ PiP 분할';
    button.setAttribute('aria-pressed', state.pipOpen ? 'true' : 'false');
  }

  function updateProviderUI() {
    const empty = document.getElementById('dgv-no-stream');
    if (empty) {
      const label = state.provider === 'jitsi' ? 'Jitsi' : 'Discord';
      empty.innerHTML = `<div><strong>공유화면을 찾는 중</strong><span>${label}에서 화면공유를 시청한 뒤 다시 확인해주세요.</span></div>`;
    }
    const badge = document.getElementById('dgv-provider-badge');
    if (badge) badge.textContent = state.provider === 'jitsi' ? 'Jitsi' : 'Discord';
  }

  function ensureControls() {
    if (!document.body) return;

    if (!document.getElementById('dgv-home-launcher')) {
      const home = document.createElement('button');
      home.id = 'dgv-home-launcher';
      home.type = 'button';
      home.textContent = '⌂ 서비스 선택';
      home.title = 'Discord / Jitsi 선택 화면으로 돌아가기';
      home.addEventListener('click', () => api?.goHome?.());
      document.body.appendChild(home);
    }

    if (!document.getElementById('dgv-provider-badge')) {
      const badge = document.createElement('div');
      badge.id = 'dgv-provider-badge';
      document.body.appendChild(badge);
    }

    if (!document.getElementById('dgv-launcher')) {
      const launcher = document.createElement('button');
      launcher.id = 'dgv-launcher';
      launcher.type = 'button';
      launcher.textContent = '▦ 화면만 보기';
      launcher.title = '공유화면만 전체창으로 보기 (F10)';
      launcher.addEventListener('click', () => api?.setFocus(true));
      document.body.appendChild(launcher);
    }

    if (!document.getElementById('dgv-pip-launcher')) {
      const pip = document.createElement('button');
      pip.id = 'dgv-pip-launcher';
      pip.type = 'button';
      pip.title = '분할된 공유화면만 항상 위 PiP 창으로 분리 (F9)';
      pip.setAttribute('aria-pressed', 'false');
      pip.addEventListener('click', togglePiP);
      document.body.appendChild(pip);
      updatePiPButton();
    }

    if (!document.getElementById('dgv-focus-hotspot')) {
      const hotspot = document.createElement('div');
      hotspot.id = 'dgv-focus-hotspot';
      const exit = document.createElement('button');
      exit.id = 'dgv-focus-exit';
      exit.type = 'button';
      exit.textContent = '×';
      exit.title = '화면만 보기 종료 (F10 또는 Esc)';
      exit.setAttribute('aria-label', '화면만 보기 종료');
      exit.addEventListener('click', () => api?.setFocus(false));
      hotspot.appendChild(exit);
      document.body.appendChild(hotspot);
    }

    if (!document.getElementById('dgv-no-stream')) {
      const empty = document.createElement('div');
      empty.id = 'dgv-no-stream';
      document.body.appendChild(empty);
    }
    updateProviderUI();
  }

  async function setFocusMode(enabled) {
    state.focus = Boolean(enabled);
    ensureControls();
    if (state.focus) {
      tryEnableGridView();
      document.body.classList.add('dgv-focus-mode');
      scheduleRefresh();
    } else {
      document.body.classList.remove('dgv-focus-mode', 'dgv-no-stream');
      clearRoot();
    }
    return state.focus;
  }

  function setProvider(provider) {
    state.provider = provider === 'jitsi' ? 'jitsi' : 'discord';
    document.body?.setAttribute('data-dgv-provider', state.provider);
    updateProviderUI();
    if (state.focus) scheduleRefresh();
    if (state.pipCapture) schedulePiPCapture(true);
    return state.provider;
  }

  state.observer = new MutationObserver(() => {
    ensureControls();
    if (state.focus) scheduleRefresh();
  });
  state.observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', scheduleRefresh, { passive: true });

  window.__DGV__ = { setProvider, setFocusMode, refreshRoot, setPiPCapture, capturePiPFrames };

  ensureControls();
  api?.onPiPState((open) => {
    state.pipOpen = Boolean(open);
    updatePiPButton();
  });

  Promise.all([api?.getProvider?.(), api?.getFocus(), api?.getPiP()]).then(([provider, focus, pip]) => {
    setProvider(provider);
    setFocusMode(Boolean(focus));
    state.pipOpen = Boolean(pip);
    updatePiPButton();
  }).catch(() => {});
})();
