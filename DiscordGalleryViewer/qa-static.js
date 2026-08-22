const fs = require('fs');
const path = require('path');

const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const main = read('main.js');
const inject = read('inject.js');
const preload = read('preload.js');
const ciSmoke = read('ci-smoke.js');
const homeSmoke = read('ci-home-smoke.js');
const pkg = JSON.parse(read('package.json'));
const failures = [];

const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(pkg.version === '1.0.0', 'version must be 1.0.0');
expect(/^\d+\.\d+\.\d+$/.test(pkg.devDependencies?.electron || ''), 'Electron must be exactly pinned');
expect(/^\d+\.\d+\.\d+$/.test(pkg.devDependencies?.['electron-builder'] || ''), 'electron-builder must be exactly pinned');
expect(Boolean(pkg.scripts?.['smoke:home']), 'smoke:home script missing');
expect(Boolean(pkg.scripts?.['smoke:ci']), 'smoke:ci script missing');
expect(main.includes("'display-capture'"), 'display-capture permission missing');
expect(main.includes('setDisplayMediaRequestHandler'), 'display media handler missing');
expect(main.includes('isProviderSender(event)'), 'provider IPC sender validation missing');
expect(inject.includes("videoType !== 'desktop'"), 'Jitsi desktop-track detection missing');
expect(!inject.includes("if (state.provider === 'discord') return videos"), 'unsafe Discord camera fallback present');
expect(preload.includes('MAX_BATCH_LENGTH'), 'renderer frame batch guard missing');
expect(ciSmoke.includes('SSG_CI_SMOKE_OK'), 'functional smoke sentinel missing');
expect(homeSmoke.includes('SSG_HOME_SMOKE_OK'), 'home smoke sentinel missing');

if (failures.length) {
  console.error('QA_STATIC_FAIL');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('QA_STATIC_OK');
