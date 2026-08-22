(() => {
  if (window.__DGV__) return;

  const state = {
    focus: false,
    observer: null,
    refreshTimer: null,
    callRoot: null
  };

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 160 && rect.height > 90 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function getVisibleVideos() {
    return [...document.querySelectorAll('video')].filter(isVisible);
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
  });

  state.observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', scheduleRefresh, { passive: true });

  window.__DGV__ = { setFocusMode, refreshRoot };
  ensureControls();
  window.discordGallery?.getFocus().then(setFocusMode).catch(() => {});
})();
