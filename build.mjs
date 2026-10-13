/**
 * 把 src/client.js 打成浏览器模块：DSH 的客户端模块加载器要的是
 * `window.__ModuleLoader__.load({ id, factory })` 形态，react 走页面单例（不能打进来）。
 * 构建：node build.mjs
 */
// esbuild 不随本仓库分发：从本仓库的 node_modules 解析（devDependency）。
// 解析不到时给出可执行的提示，而不是丢一个 ENOENT。
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let build
try {
  ;({ build } = require('esbuild'))
} catch (error) {
  console.error('[build] 找不到 esbuild。请先在仓库根目录执行：npm install --save-dev esbuild')
  console.error('[build] 原始错误：' + (error && error.message ? error.message : error))
  process.exit(1)
}

const externals = /^(react|react-dom)(\/.*)?$/
const here = (rel) => fileURLToPath(new URL(rel, import.meta.url))

mkdirSync(here('./lib/'), { recursive: true })

await build({
  entryPoints: [here('./src/client.js')],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  jsx: 'transform',
  outfile: here('./lib/client.js'),
  logLevel: 'info',
  plugins: [
    {
      name: 'page-react',
      setup(b) {
        b.onResolve({ filter: externals }, (args) => ({ path: args.path, external: true }))
      },
    },
  ],
  banner: {
    js: [
      'window.__ModuleLoader__.load({',
      '  id: "dsh-peak-scheduler",',
      '  factory: (require) => {',
      '    var module = { exports: {} };',
      '    var exports = module.exports;',
    ].join('\n'),
  },
  footer: {
    js: ['    return module.exports;', '  }', '});'].join('\n'),
  },
})
