import assert from 'node:assert/strict';

globalThis.location = { pathname: '/kp', origin: 'https://n.viksstroy.online' };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'ru', platform: 'test' }, configurable: true });
Object.defineProperty(globalThis, 'screen', { value: { width: 390, height: 844 }, configurable: true });
globalThis.innerWidth = 390; globalThis.innerHeight = 700; globalThis.devicePixelRatio = 3;
globalThis.matchMedia = () => ({ matches: true });
globalThis.localStorage = { getItem: () => 'install', setItem: () => {} };
globalThis.document = { documentElement: { dataset: {} } };

const { sanitizeAuditMetadata, cleanAuditPath } = await import('../frontend/src/utils/productAudit.js');
assert.deepEqual(
  sanitizeAuditMetadata({ field_name: 'hours', changed: true, password: '123', access_token: 'secret' }),
  { field_name: 'hours', changed: true, password: '[скрыто]', access_token: '[скрыто]' },
);
assert.equal(sanitizeAuditMetadata('Bearer abc.def'), 'Bearer [скрыто]');
assert.equal(cleanAuditPath('/driver-invite/VERY-SECRET-CODE'), '/driver-invite/[код]');
console.log('product audit client privacy checks passed');
