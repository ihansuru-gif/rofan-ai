(() => {
  if (window.__DGV__) return;

  const state = {
    focus: false,
    observer: null,
    refreshTimer: null,
    callRoot: null,
    pipWindow: null,
    pipTimer: null,
    pipEntries: new Map(),
    pipExpandedSource: null
  };

  const PIP_CSS = `
    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: #000;
      color: #fff;
      font-family: "Segoe UI", system-ui, sans-serif;
    }
    #dgv-pip-grid {
      width: 100%;
      height: 100%;
      display: grid;
      grid-template-columns: repeat(var(--dgv-cols, 2), minmax(0, 1fr));
      grid-template-rows: repeat(var(--dgv-rows, 2), minmax(0, 1fr));
      gap: 2px;
      background: #090a0c;
    }
    .dgv-pip-tile {
      min-width: 0;
      min-height: 0;
      position: relative;
      overflow: hidden;
      background: #000;
      cursor: pointer;
    }
    .dgv-pip-tile video {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
    }
    #dgv-pip-grid[data-expanded="true"] .dgv-pip-tile { display: none; }
    #dgv-pip-grid[data-expanded="true"] .dgv-pip-tile[data-expanded="true"] {
      display: block;
      grid-column: 1 / -1;
      grid-row: 1 / -1;
    }
    #dgv-pip-empty {
      display: none;
      position: absolute;
      inset: 0;
      place-items: center;
      padding: 20px;
      text-align: center;
      color: #aeb4bd;
      font-size: 13px;
      background: #0b0d10;
    }
    body.dgv-pip-no-stream #dgv-pip-empty { display: grid; }
  `;

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 160 && rect.height > 90 && style.display !== 'none' && style.visibility !== 'hidden';
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

  function findKnownCallContainer() {
    const candidates = [
      ...document.querySelectorAll('[class*="callContainer_"], [class*="videoGrid_"], [class*="callContainer"], [class*="videoGrid"]')
    ].filter(isVisible);

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
      if (area > viewportArea * 0.97) break;
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
    for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
      for (const name of ['aria-label', 'title', 'data-list-item-id', 'data-testid']) {
        const value = node.getAttribute?.(name);
        if (value) values.push(value);
      }
      if (typeof node.className === 'string') values.push(node.className);
    }
    return values.join(' ').toLowerCase();
  }

  function isLikelyScreenShare(video) {
    const meta = elementMetadata(video);
    return /(screen|stream|screenshare|screen-share|go live|공유|화면|스트림|방송)/i.test(meta);
  }

  function getPiPSourceVideos() {
    const root = findCallRoot() || document;
    const videos = getVisibleVideos(root).filter((video) => video.readyState >= 2 || video.videoWidth > 0);
    if (!videos.length) return [];

    const screenShares = videos.filter(isLikelyScreenShare);
    return screenShares.length ? screenShares : videos;
  }

  function tryEnableGridView() {
    const patterns = [/grid/i, /gallery/i, /격자/i, /그리드/i, /갤러리/i];
    const buttons = [...document.querySelectorAll('button,[role="button"]')];
    const target = buttons.find((button) => {
      const text = [
        button.getAttribute('aria-label'),
        button.getAttribute('title'),
        button.textContent
      ].filter(Boolean).join(' ');
      return patterns.some((p) => p.test(text));
    });

    if (target && isVisible(target)) {
      try { target.click(); } catch (_) {}
    }
  }

  function clearRoot() {
    if (state.callRoot && state.callRoot.isConnected) {
      state.callRoot.removeAttribute('data-dgv-call-root');
    }
    document.querySelectorAll('[data-dgv-call-root="true"]').forEach((el) => {
      el.removeAttribute('data-dgv-call-root');
    });
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
    if (state.pipWindow && !state.pipWindow.closed) schedulePiPRefresh();
  }

  function gridShape(count) {
    if (count <= 1) return [1, 1];
    if (count === 2) return [2, 1];
    if (count <= 4) return [2, 2];
    if (count <= 6) return [3, 2];
    if (count <= 9) return [3, 3];
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    return [cols, rows];
  }

  function sourceForMirror(source) {
    if (source.srcObject instanceof MediaStream) {
      return { type: 'stream', value: source.srcObject };
    }

    if (typeof source.captureStream === 'function') {
      try {
        const captured = source.captureStream();
        if (captured && captured.getVideoTracks().length) {
          return { type: 'stream', value: captured };
        }
      } catch (_) {}
    }

    const src = source.currentSrc || source.src;
    if (src) return { type: 'src', value: src };
    return null;
  }

  function createPiPTile(source) {
    const doc = state.pipWindow.document;
    const tile = doc.createElement('div');
    tile.className = 'dgv-pip-tile';
    tile.tabIndex = 0;
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-label', '공유화면 확대/분할 전환');

    const mirror = doc.createElement('video');
    mirror.autoplay = true;
    mirror.muted = true;
    mirror.playsInline = true;
    mirror.disablePictureInPicture = true;
    mirror.setAttribute('aria-hidden', 'true');

    const media = sourceForMirror(source);
    if (media?.type === 'stream') mirror.srcObject = media.value;
    if (media?.type === 'src') mirror.src = media.value;

    tile.appendChild(mirror);
    tile.addEventListener('click', () => toggleExpandedTile(source));
    tile.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleExpandedTile(source);
      }
    });

    mirror.play().catch(() => {});
    return { tile, mirror, media };
  }

  function toggleExpandedTile(source) {
    state.pipExpandedSource = state.pipExpandedSource === source ? null : source;
    applyPiPExpandedState();
  }

  function applyPiPExpandedState() {
    if (!state.pipWindow || state.pipWindow.closed) return;
    const grid = state.pipWindow.document.getElementById('dgv-pip-grid');
    if (!grid) return;

    const expanded = state.pipExpandedSource && state.pipEntries.has(state.pipExpandedSource)
      ? state.pipExpandedSource
      : null;

    if (!expanded) state.pipExpandedSource = null;
    grid.dataset.expanded = expanded ? 'true' : 'false';
    for (const [source, entry] of state.pipEntries) {
      entry.tile.dataset.expanded = source === expanded ? 'true' : 'false';
    }
  }

  function refreshPiP() {
    if (!state.pipWindow || state.pipWindow.closed) {
      stopPiP();
      return;
    }

    const doc = state.pipWindow.document;
    const grid = doc.getElementById('dgv-pip-grid');
    if (!grid) return;

    const sources = getPiPSourceVideos();
    const active = new Set(sources);

    for (const [source, entry] of state.pipEntries) {
      if (!active.has(source) || !source.isConnected) {
        try { entry.mirror.pause(); } catch (_) {}
        try { entry.mirror.srcObject = null; } catch (_) {}
        entry.tile.remove();
        state.pipEntries.delete(source);
      }
    }

    for (const source of sources) {
      if (!state.pipEntries.has(source)) {
        const entry = createPiPTile(source);
        state.pipEntries.set(source, entry);
        grid.appendChild(entry.tile);
      } else {
        grid.appendChild(state.pipEntries.get(source).tile);
      }
    }

    const count = state.pipEntries.size;
    const [cols, rows] = gridShape(count);
    grid.style.setProperty('--dgv-cols', String(cols));
    grid.style.setProperty('--dgv-rows', String(rows));
    doc.body.classList.toggle('dgv-pip-no-stream', count === 0);
    applyPiPExpandedState();
  }

  function schedulePiPRefresh() {
    clearTimeout(state.pipTimer);
    state.pipTimer = setTimeout(refreshPiP, 140);
  }

  function stopPiP() {
    clearTimeout(state.pipTimer);
    state.pipTimer = null;
    for (const entry of state.pipEntries.values()) {
      try { entry.mirror.pause(); } catch (_) {}
      try { entry.mirror.srcObject = null; } catch (_) {}
    }
    state.pipEntries.clear();
    state.pipExpandedSource = null;
    state.pipWindow = null;
    updatePiPButton();
  }

  function buildPiPDocument(pipWindow) {
    const doc = pipWindow.document;
    doc.title = 'Discord Gallery Viewer - PiP';
    doc.documentElement.lang = 'ko';

    const style = doc.createElement('style');
    style.textContent = PIP_CSS;
    doc.head.appendChild(style);

    const grid = doc.createElement('main');
    grid.id = 'dgv-pip-grid';
    grid.dataset.expanded = 'false';

    const empty = doc.createElement('div');
    empty.id = 'dgv-pip-empty';
    empty.textContent = '공유화면을 찾는 중';

    doc.body.append(grid, empty);
  }

  async function openPiP() {
    if (state.pipWindow && !state.pipWindow.closed) {
      state.pipWindow.focus();
      return true;
    }

    if (!('documentPictureInPicture' in window)) {
      alert('이 실행 환경에서는 분할 PiP를 지원하지 않습니다.');
      return false;
    }

    tryEnableGridView();

    try {
      const pipWindow = await documentPictureInPicture.requestWindow({
        width: 720,
        height: 405,
        disallowReturnToOpener: true
      });

      state.pipWindow = pipWindow;
      buildPiPDocument(pipWindow);
      pipWindow.addEventListener('pagehide', stopPiP, { once: true });
      pipWindow.addEventListener('resize', schedulePiPRefresh, { passive: true });
      updatePiPButton();
      refreshPiP();
      return true;
    } catch (error) {
      console.error('[DGV] PiP open failed:', error);
      updatePiPButton('PiP 열기 실패');
      setTimeout(updatePiPButton, 1800);
      return false;
    }
  }

  function closePiP() {
    if (state.pipWindow && !state.pipWindow.closed) {
      state.pipWindow.close();
    } else {
      stopPiP();
    }
  }

  async function togglePiP() {
    if (state.pipWindow && !state.pipWindow.closed) {
      closePiP();
      return false;
    }
    return openPiP();
  }

  function updatePiPButton(temporaryText = null) {
    const button = document.getElementById('dgv-pip-launcher');
    if (!button) return;
    const open = Boolean(state.pipWindow && !state.pipWindow.closed);
    button.textContent = temporaryText || (open ? '▣ PiP 닫기' : '▣ PiP 분할');
    button.setAttribute('aria-pressed', open ? 'true' : 'false');
  }

  function ensureControls() {
    if (!document.body) return;

    if (!document.getElementById('dgv-launcher')) {
      const launcher = document.createElement('button');
      launcher.id = 'dgv-launcher';
      launcher.type = 'button';
      launcher.textContent = '▦ 화면만 보기';
      launcher.title = '공유화면만 전체창으로 보기 (F10)';
      launcher.addEventListener('click', () => window.discordGallery?.setFocus(true));
      document.body.appendChild(launcher);
    }

    if (!document.getElementById('dgv-pip-launcher')) {
      const pip = document.createElement('button');
      pip.id = 'dgv-pip-launcher';
      pip.type = 'button';
      pip.title = '분할된 공유화면만 항상 위 PiP 창으로 분리';
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
      exit.addEventListener('click', () => window.discordGallery?.setFocus(false));
      hotspot.appendChild(exit);
      document.body.appendChild(hotspot);
    }

    if (!document.getElementById('dgv-no-stream')) {
      const empty = document.createElement('div');
      empty.id = 'dgv-no-stream';
      empty.innerHTML = '<div><strong>공유화면을 찾는 중</strong><span>Discord 음성채널에서 화면공유를 시청한 뒤 F10을 눌러주세요.</span></div>';
      document.body.appendChild(empty);
    }
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

  state.observer = new MutationObserver(() => {
    ensureControls();
    if (state.focus) scheduleRefresh();
    if (state.pipWindow && !state.pipWindow.closed) schedulePiPRefresh();
  });

  state.observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', scheduleRefresh, { passive: true });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'F9' && !event.repeat) {
      event.preventDefault();
      togglePiP();
    }
  }, true);

  window.__DGV__ = {
    setFocusMode,
    refreshRoot,
    openPiP,
    closePiP,
    togglePiP,
    refreshPiP
  };

  ensureControls();
  window.discordGallery?.getFocus().then(setFocusMode).catch(() => {});
})();
