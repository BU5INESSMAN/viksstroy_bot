import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from '../frontend/node_modules/esbuild/lib/main.js';

test('wizard passes draft participant state to the actual hours component', async () => {
    const result = await build({
        stdin: {
            contents: `import React from 'react';
                import { renderToStaticMarkup } from 'react-dom/server';
                import Wizard from './src/features/kp/components/SMRWizard.jsx';
                export const html = renderToStaticMarkup(React.createElement(Wizard,
                    {appId:1, app:{}, userRole:'foreman', tgId:100}));`,
            resolveDir: fileURLToPath(new URL('../frontend/', import.meta.url)),
        },
        bundle: true, packages: 'external', platform: 'node', format: 'cjs',
        jsx: 'automatic', write: false,
        plugins: [{ name: 'render-portal-inline', setup(builder) {
            // Portals have no server renderer; preserve their children so the
            // real StepHours executes, including its draft-roster calculation.
            builder.onLoad({filter:/ModalPortal\.jsx$/}, () => ({
                contents:'export default function Portal({children}) { return children; }', loader:'jsx',
            }));
        }}],
    });
    const module = {exports:{}};
    const require = createRequire(new URL('../frontend/package.json', import.meta.url));
    new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);
    assert.match(module.exports.html, /Загрузка/);
});
