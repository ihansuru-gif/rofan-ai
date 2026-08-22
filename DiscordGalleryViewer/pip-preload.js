const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const close = document.getElementById('close');
  let expandedIndex = -1;

  function gridShape(count) {
    if (count <= 1) return [1, 1];
    if (count === 2) return [2, 1];
    if (count <= 4) return [2, 2];
    if (count <= 6) return [3, 2];
    if (count <= 9) return [3, 3];
    const cols = Math.ceil(Math.sqrt(count));
    return [cols, Math.ceil(count / cols)];
  }

  function applyExpandedState() {
    const tiles = [...grid.querySelectorAll('.tile')];
    if (expandedIndex >= tiles.length) expandedIndex = -1;
    grid.dataset.expanded = expandedIndex >= 0 ? 'true' : 'false';
    tiles.forEach((tile, index) => {
      tile.dataset.expanded = index === expandedIndex ? 'true' : 'false';
    });
  }

  function ensureTiles(count) {
    while (grid.children.length > count) grid.lastElementChild.remove();
    while (grid.children.length < count) {
      const index = grid.children.length;
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile';
      tile.title = '클릭: 한 화면 확대 / 다시 클릭: 분할 복귀';
      tile.setAttribute('aria-label', '공유화면 확대 또는 분할 복귀');

      const image = document.createElement('img');
      image.alt = '';
      image.draggable = false;
      image.decoding = 'async';
      tile.appendChild(image);

      tile.addEventListener('click', () => {
        const currentIndex = [...grid.children].indexOf(tile);
        expandedIndex = expandedIndex === currentIndex ? -1 : currentIndex;
        applyExpandedState();
      });

      grid.appendChild(tile);
      if (index === expandedIndex) tile.dataset.expanded = 'true';
    }
  }

  function render(frames) {
    const safeFrames = Array.isArray(frames) ? frames : [];
    ensureTiles(safeFrames.length);
    const tiles = [...grid.querySelectorAll('.tile')];

    safeFrames.forEach((src, index) => {
      const image = tiles[index]?.querySelector('img');
      if (image && image.src !== src) image.src = src;
    });

    const [cols, rows] = gridShape(safeFrames.length);
    grid.style.setProperty('--cols', String(cols));
    grid.style.setProperty('--rows', String(rows));
    empty.hidden = safeFrames.length > 0;
    applyExpandedState();
  }

  close.addEventListener('click', () => ipcRenderer.send('dgv:pip-close'));
  ipcRenderer.on('dgv:pip-frames', (_event, frames) => render(frames));
});
