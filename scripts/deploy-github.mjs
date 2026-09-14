#!/usr/bin/env node
/**
 * 自动发布：把 demo/ 的内容推成 GitHub 仓库的根
 * ==================================================================
 *
 * 远端仓库：https://github.com/Baebear0903/sanyi-data-demand-demo
 * 发布范围：**只有本目录（demo/）的内容**。仓库根目录下的迭代文档
 *          （需求文档 / 分析笔记 / 参考规格 / 参考资料 等）永远不上传。
 *
 * 为什么不是直接 `git push`：
 *   本地是「文档 + demo」的单仓库，而远端只需要「纯 demo 代码」。Git 无法把
 *   子目录推成远端根（`git subtree push` 也要依赖本地完整历史，且会污染
 *   本地 ref、失败时留下 split 残留）。本脚本用 git 底层对象完成：
 *     1) 取 HEAD 里 demo/ 的目录树 `git rev-parse HEAD:demo`
 *        —— 只会带上「已提交、且已被 git 跟踪」的文件，dist/offline/node_modules
 *           等 .gitignore 产物天然进不去；
 *     2) `git commit-tree` 造一个临时提交，父提交指向远端 main 当前的提交；
 *     3) 只把这个临时提交推到远端 main。
 *   结果：远端 main 永远只增加“demo 内容快照”提交，既不会出现文档，也不会
 *   出现 dist/ 之类产物；本地工作区与本地历史不被改写。
 *
 * 用法：
 *   node scripts/deploy-github.mjs                   # 本地校验 + 构建 + 增量发布
 *   node scripts/deploy-github.mjs --yes             # 跳过构建前的人工确认（仍会构建）
 *   node scripts/deploy-github.mjs --dry-run         # 只打印将要发布的内容，不推送
 *   node scripts/deploy-github.mjs --skip-build      # 跳过本地构建校验（不推荐）
 *   node scripts/deploy-github.mjs --fresh-history   # 一次性：把远端换成一个干净的初始提交（只含 demo 代码）
 *
 * 首建（--fresh-history）说明：
 *   远端仓库早期提交里混进了根目录迭代文档与早期 vanilla 原型（即使现在删掉，
 *   历史提交里仍然翻得到）。该模式把远端 main 直接换成一个**干净的初始提交**，
 *   内容 = 当前 demo 目录树，不带任何旧历史，然后强制推送。
 *   只需要在“收敛发布范围”时执行一次；此后用默认模式增量发布即可。
 *   本地仓库的完整历史不受影响（旧提交都留在本地，只是不再推送）。
 *   可选 --graft：把新提交的父提交设为远端当前提交（保留那一段历史，但那段历史的
 *   树里仍含旧文档），默认不带父提交。
 *
 * 常见故障：本机若出现 `Failed to connect to github.com port 443`，多为 github.com
 *   被解析到不可达 IP（例如 20.205.243.166）。可改 /etc/hosts 指到可用 IP
 *   （140.82.112.3 / 140.82.113.3 / 140.82.114.3 实测可用），或改用
 *   `ssh.github.com:443` 的 SSH 远端。这需要 sudo，脚本不擅自改系统配置。
 */

import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DEMO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(DEMO_DIR, '..')
const PREFIX = 'demo'
const REMOTE = 'origin'
const BRANCH = 'main'

/** 远端根目录允许出现的“非代码”文件（本目录自带的说明文档） */
const ALLOWED_ROOT_DOCS = new Set(['README.md', 'PAGE-SPEC.md'])
/** 重建历史时，命中这些名字即视为“迭代文档混进了远端”，硬失败 */
const FORBIDDEN_NAMES = [
  '需求文档-数据需求管理模块静态演示系统.md',
  '分析笔记-建设背景与上下文.md',
  '设计参考规格.md',
  '调整方案评估.md',
  '数据需求管理-功能清单.md',
  '最小化核验路径.md',
  '验收问题诊断与解决方案.md',
  '参考资料',
]

// ------------------------------------------------------------------ 工具

const argv = process.argv.slice(2)
const hasFlag = f => argv.includes(f)
const DRY_RUN = hasFlag('--dry-run')
const SKIP_BUILD = hasFlag('--skip-build')
const FRESH = hasFlag('--fresh-history') || hasFlag('--fresh')
const GRAFT_ON_REMOTE = hasFlag('--graft')
const ASSUME_YES = hasFlag('--yes') || hasFlag('-y')

const step = msg => console.log(`\n▶ ${msg}`)
const info = msg => console.log(`  ${msg}`)
const fail = msg => {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}

/** 执行 git 并返回去空白后的 stdout（失败即中断，避免带病推送） */
function git(args, { inherit = false, input = null, cwd = REPO_ROOT, env: extraEnv = null } = {}) {
  return execFileSync('git', args, {
    cwd,
    input,
    encoding: 'utf8',
    stdio: inherit ? ['pipe', 'inherit', 'inherit'] : ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_PAGER: 'cat', ...(extraEnv || {}) }
  }).trim()
}

/** 执行 git 但允许失败，返回 { ok, out, err }（超时等进程级失败也会落进 err） */
function gitTry(args, opts = {}) {
  const r = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...opts
  })
  const err =
    (r.stderr || '').trim() ||
    (r.error ? `执行 git 失败：${r.error.message}` : '') ||
    (r.signal ? `git 被信号中断：${r.signal}` : '') ||
    (r.status !== 0 ? `git 退出码 ${r.status}（无 stderr 输出）` : '')
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err }
}

/**
 * 网络兜底用的 github.com 可用 IP（GitHub 官方网段）。
 * 本机若把 github.com 解析到不可达 IP（如 20.205.243.166），普通连接会超时；
 * 用 `-c http.curloptResolve=github.com:443:<ip>` 可强制走指定 IP，
 * 无需修改 /etc/hosts（改 hosts 需要 sudo，脚本不擅自改系统配置）。
 * 注意：这些 IP 的可用性因网络而异，脚本会先用 TCP 探测过滤。
 */
const GITHUB_FALLBACK_IPS = ['140.82.113.3', '140.82.114.3', '140.82.112.3', '20.27.177.113']

const isNetworkError = msg =>
  /Failed to connect|could not resolve host|Connection (timed out|refused)|Operation timed out|Couldn't connect|执行 git 失败/i.test(
    msg || ''
  )

/** 快速探测某个 IP 的 443 是否可达（3s 内没有结果就当不可达） */
function tcpReachable(ip, port = 443, timeout = 3000) {
  return new Promise(resolve => {
    let done = false
    const finish = ok => {
      if (done) return
      done = true
      sock.destroy()
      resolve(ok)
    }
    const sock = net.connect({ host: ip, port, timeout })
    sock.on('connect', () => finish(true))
    sock.on('timeout', () => finish(false))
    sock.on('error', () => finish(false))
  })
}

/** 把候选 IP 按可达性排序（可达的排前面，探测只花几秒） */
async function orderGithubIps() {
  const live = []
  const dead = []
  for (const ip of GITHUB_FALLBACK_IPS) {
    ;((await tcpReachable(ip)) ? live : dead).push(ip)
  }
  const ordered = [...live, ...dead]
  console.log(`  · IP 探测（443）：可用 ${live.join(', ') || '无'}${dead.length ? ` / 不可达 ${dead.join(', ')}` : ''}`)
  return ordered
}

/**
 * 普通 git 命令，遇网络错误时自动换 IP 重试（只对远端操作调用）：
 * 直连给较短超时（本机 github.com 常被解析到不可达 IP，直连会干等 75s），
 * 失败后立刻改用可达 IP 走 http.curloptResolve。
 */
async function gitNet(args, { firstTimeout = 20000, retryTimeout = 180000, maxTries = 3 } = {}) {
  const first = gitTry(args, { timeout: firstTimeout })
  if (first.ok) return first
  if (!isNetworkError(first.err)) return first
  console.warn(`  ! 直连 github.com 失败，改用固定可用 IP 重试：\n      ${first.err.split('\n')[0]}`)
  for (const ip of (await orderGithubIps()).slice(0, maxTries)) {
    console.log(`  · 经 ${ip} 重试 …`)
    const r = gitTry(['-c', `http.curloptResolve=github.com:443:${ip}`, ...args], {
      timeout: retryTimeout
    })
    if (r.ok) {
      console.log(`  ✓ 经 ${ip} 成功`)
      return r
    }
    console.warn(`    × ${r.err.split('\n')[0] || '失败'}`)
  }
  return first
}

/** pnpm 入口：本机没装 pnpm 时退回 corepack（与 README 的备忘一致） */
function pnpmCmd() {
  const probe = spawnSync('sh', ['-c', 'command -v pnpm'], { encoding: 'utf8' })
  if (probe.status === 0) return { cmd: 'pnpm', args: [] }
  const cp = spawnSync('sh', ['-c', 'command -v corepack'], { encoding: 'utf8' })
  if (cp.status === 0) return { cmd: 'corepack', args: ['pnpm'] }
  fail('找不到 pnpm，也没有 corepack：请先安装 Node ≥ 20 并启用 corepack')
}

/** 跑一条 pnpm script（始终带上本机 corepack 缓存目录与可用源） */
function pnpmRun(script) {
  const { cmd, args } = pnpmCmd()
  const env = {
    ...process.env,
    COREPACK_HOME: process.env.COREPACK_HOME || path.join(REPO_ROOT, '.tooling', 'corepack'),
    npm_config_registry: process.env.npm_config_registry || 'https://registry.npmmirror.com'
  }
  const r = spawnSync(cmd, [...args, 'run', script], { cwd: DEMO_DIR, stdio: 'inherit', env })
  if (r.status !== 0) fail(`本地校验失败：${cmd} ${args.join(' ')} run ${script}`)
}

/** 递归列出某个提交树里除“根目录允许文档”外的所有文件（根 = 远端仓库根） */
function filesOutsideRootDocs(treeish) {
  const names = git(['ls-tree', '-r', '--name-only', treeish]).split('\n').filter(Boolean)
  return names.filter(name => !(name.includes('/') === false && ALLOWED_ROOT_DOCS.has(name)))
}

function assertNoDocs(treeish, { hard }) {
  const bad = filesOutsideRootDocs(treeish).filter(
    p => FORBIDDEN_NAMES.some(n => p === `${n}.md` || p.startsWith(`${n}/`) || path.basename(p) === n)
  )
  if (!bad.length) return
  const msg =
    `发布内容里出现了本应只留在本地的迭代文档（${treeish}）：\n` +
    bad.map(p => `      · ${p}`).join('\n') +
    `\n  它们必须留在仓库根目录、不能进入 demo/。`
  if (hard) fail(msg)
  console.warn(`  ! ${msg}`)
}

// ------------------------------------------------------------------ 主流程

console.log('数据需求管理演示系统 · 发布到 GitHub（远端根 = demo/ 内容）')
console.log(`  本地 demo 目录：${DEMO_DIR}`)
console.log(`  远端：${REMOTE} → ${git(['remote', 'get-url', REMOTE])}`)
if (DRY_RUN) console.log('  模式：--dry-run（只预演，不推送）')
if (FRESH) console.log(`  模式：--fresh-history（远端换成干净的初始提交，只含 demo 代码${GRAFT_ON_REMOTE ? '，并 graft 到远端当前提交' : ''}）`)

// 0. 基本前提：必须是 git 仓库，且 demo 自己就是待发布范围
step('检查仓库状态')
if (!fs.existsSync(path.join(REPO_ROOT, '.git'))) fail(`没找到 git 仓库：${REPO_ROOT}`)
if (!fs.existsSync(path.join(DEMO_DIR, 'package.json'))) fail(`${DEMO_DIR} 不是演示系统目录`)

const head = git(['rev-parse', 'HEAD'])
const headShort = head.slice(0, 8)
const headSubject = git(['log', '-1', '--format=%s', 'HEAD'])
info(`当前提交：${headShort} ${headSubject}`)

// 未提交内容一律拒绝：发布只推“已提交”的内容，避免发出半成品
const dirty = git(['status', '--porcelain', '--', PREFIX])
if (dirty) {
  fail(
    `demo/ 下还有未提交的改动，先提交再发布（发布只推已提交内容）：\n` +
      dirty
        .split('\n')
        .slice(0, 20)
        .map(l => `      ${l}`)
        .join('\n')
  )
}
info('工作区干净（demo/ 无未提交改动）')

// 1. 拉取远端引用，确定基线
step(`获取远端 ${REMOTE}/${BRANCH}`)
const fetch = await gitNet(['fetch', '--prune', REMOTE, BRANCH])
if (!fetch.ok) {
  fail(
    `拉取远端失败：\n${fetch.err}\n\n` +
      `  若是 "Failed to connect to github.com port 443"，见本文件顶部「常见故障」。`
  )
}
const remoteRef = gitTry(['rev-parse', `refs/remotes/${REMOTE}/${BRANCH}`])
const remoteSha = remoteRef.ok ? remoteRef.out : ''
info(remoteSha ? `远端 ${REMOTE}/${BRANCH} = ${remoteSha.slice(0, 8)}` : `远端还没有 ${BRANCH} 分支`)

const demoTree = git(['rev-parse', `${head}:${PREFIX}`])
info(`待发布的 demo 目录树：${demoTree.slice(0, 8)}`)

// 发布内容预检（每次模式都跑一遍）
const allFiles = git(['ls-tree', '-r', '--name-only', demoTree]).split('\n').filter(Boolean)
console.log(`\n  将发布的文件（${allFiles.length} 个，来自 git 跟踪内容）：`)
console.log(
  allFiles
    .map(f => `      ${f}`)
    .slice(0, 200)
    .join('\n')
)
if (allFiles.length > 200) console.log(`      … 其余 ${allFiles.length - 200} 个略`)
assertNoDocs(demoTree, { hard: true })

if (FRESH) {
  await freshHistory()
} else {
  await publishIncremental()
}

// ------------------------------------------------------------------ 增量发布

async function publishIncremental() {
  if (!remoteSha) {
    fail('远端 main 还没有提交，请先用 --fresh-history 建立初始发布提交')
  }

  // 远端上的提交都是本脚本用 git commit-tree 生成的“发布快照”，与本地历史不是同一条线，
  // 祖先关系永不成立，所以这里比较**内容**：远端那份内容必须是本地 HEAD:demo 的一部分。
  // 远端内容 ⊆ 本地内容  ⇔  「把远端树与 demo 树相比不会删掉任何文件」。
  const remoteTree = git(['rev-parse', `${remoteSha}^{tree}`])
  const sameContent = remoteTree === demoTree

  if (sameContent) {
    console.log('\n✓ demo 内容与远端完全一致，无需发布。')
    return
  }

  const remoteFileCount = git(['ls-tree', '-r', '--name-only', remoteTree]).split('\n').filter(Boolean).length
  if (remoteFileCount === 0) {
    fail(`远端树 ${remoteTree.slice(0, 8)} 是空的，无法增量发布（这种状态只能用 --fresh-history 覆盖）`)
  }

  const onlyRemovals = gitTry(['diff', '--diff-filter=D', '--name-only', remoteTree, demoTree])
  if (!onlyRemovals.ok) {
    fail(`无法比较远端内容与本地 demo 树：${onlyRemovals.err}`)
  }
  const removed = onlyRemovals.out.split('\n').filter(Boolean)
  if (removed.length) {
    fail(
      `远端有 ${removed.length} 个文件在本地 HEAD 的 demo/ 里已经不存在（远端内容不是本地内容的一部分）：\n` +
        removed
          .slice(0, 15)
          .map(f => `      · ${f}`)
          .join('\n') +
        `\n      通常是远端被别处改过，或本地缺少远端那份内容。\n` +
        `      先确认：git fetch && gh api repos/Baebear0903/sanyi-data-demand-demo/contents\n` +
        `      若远端内容应当被整体替换，跑 node scripts/deploy-github.mjs --fresh-history。`
    )
  }

  const changed = gitTry(['diff', '--name-status', remoteTree, demoTree])
  if (changed.ok && changed.out) {
    console.log('\n  相对远端将要发生的改动：')
    console.log(
      changed.out
        .split('\n')
        .map(l => `      ${l}`)
        .join('\n')
    )
  }

  if (!SKIP_BUILD) runLocalChecks()
  else console.log('\n  （--skip-build：跳过 recipe 校验 / 类型检查 / 构建）')

  if (DRY_RUN) {
    console.log('\n✓ --dry-run：以上为预演内容，未推送。')
    return
  }

  step('生成发布提交并推送')
  const subject = `deploy: ${headShort} ${headSubject}`.slice(0, 100)
  const body =
    `发布 demo/ 内容快照\n\n` +
    `本地提交：${head}\n` +
    `本地标题：${headSubject}\n` +
    `发布内容：demo/ 目录树 ${demoTree}\n\n` +
    `由 demo/scripts/deploy-github.mjs 自动生成：远端仓库根 = demo/ 内容，\n` +
    `仓库根目录的迭代文档不在发布范围内。`
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drm-deploy-'))
  const msgFile = path.join(tmp, 'msg.txt')
  fs.writeFileSync(msgFile, `${subject}\n\n${body}\n`, 'utf8')

  let commit
  try {
    commit = git(['commit-tree', demoTree, '-p', remoteSha, '-F', msgFile], { inherit: false })
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  info(`发布提交：${commit.slice(0, 8)}（父：${remoteSha.slice(0, 8)}）`)

  await pushWithLease(commit, remoteSha)
  reportDone(commit)
}

// ------------------------------------------------------------------ 首建：干净初始提交

/**
 * --fresh-history：把远端 main 直接换成一个**干净的初始提交**（内容 = 当前 demo 树）。
 *
 * 为什么这样做：远端旧历史里混着仓库根目录的迭代文档、早期 vanilla 原型，
 * 甚至出现过两个不同世代的 demo/ 目录。只靠“逐条提交过滤”既无法得到与本地
 * 当前内容一致的 tip，也会留下一段自相矛盾的历史。发布仓库只需要“当前这份代码”，
 * 所以直接给一个初始提交最干净：远端看不到任何文档、任何旧原型。
 * 本地仓库的历史完全不受影响（旧提交都在本地，只是不再推送）。
 */
async function freshHistory() {
  step('首建：用当前 demo 内容做远端初始提交')
  info(`待发布目录树：${demoTree.slice(0, 8)}（来自本地提交 ${headShort}）`)

  const date = new Date().toISOString()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drm-publish-'))
  const msgFile = path.join(tmp, 'msg.txt')
  fs.writeFileSync(
    msgFile,
    [
      'chore: 初始化演示系统仓库（只含 demo 代码）',
      '',
      '本仓库只发布「数据需求管理演示系统」的代码与配套说明文档，',
      '不含需求文档 / 分析笔记 / 参考规格 / 参考资料等迭代过程材料',
      '（这些只保留在本地开发仓库，不对外发布）。',
      '',
      '· 技术栈：Vue 3.4 + TypeScript + Vite + Element Plus（Hash 路由、相对路径 base）',
      '· 本地开发：pnpm install && pnpm dev',
      '· 构建产物：pnpm build（dist/，走 HTTP 预览）/ pnpm build:offline（离线单文件）',
      '· 自动部署：push 到 main 触发 .github/workflows/deploy-pages.yml 发布 GitHub Pages',
      '',
      '本地开发仓库对应提交：' + head,
      '本地提交标题：' + headSubject,
      ''
    ].join('\n'),
    'utf8'
  )

  let commit
  try {
    const args = ['commit-tree', demoTree, '-F', msgFile]
    if (GRAFT_ON_REMOTE) args.push('-p', remoteSha)
    commit = git(args, {
      env: {
        GIT_AUTHOR_NAME: 'Baebear0903',
        GIT_AUTHOR_EMAIL: '259486546+Baebear0903@users.noreply.github.com',
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_NAME: 'Baebear0903',
        GIT_COMMITTER_EMAIL: '259486546+Baebear0903@users.noreply.github.com',
        GIT_COMMITTER_DATE: date
      }
    })
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }

  assertNoDocs(commit, { hard: true })
  const tipTree = git(['rev-parse', `${commit}^{tree}`])
  if (tipTree !== demoTree) fail(`初始提交的树（${tipTree.slice(0, 8)}）与预期不符`)
  const count = git(['ls-tree', '-r', '--name-only', commit]).split('\n').filter(Boolean).length
  info(`初始提交：${commit.slice(0, 8)}，共 ${count} 个文件${GRAFT_ON_REMOTE ? `（父提交保留为 ${remoteSha.slice(0, 8)}）` : '（无父提交）'}`)

  if (DRY_RUN) {
    console.log('\n✓ --dry-run：以上为首建预演，未推送。')
    return
  }

  await pushWithLease(commit, remoteSha, { force: true })
  reportDone(commit)
}


// ------------------------------------------------------------------ 推送

async function pushWithLease(commit, expectSha, { force = false } = {}) {
  // 先尝试最快路径：普通推送（增量模式下远端是 HEAD 的祖先，必然快进）
  const plain = await gitNet(['push', REMOTE, `${commit}:refs/heads/${BRANCH}`])
  if (plain.ok) return

  // 非快进 / 远端引用过期 → 用 --force-with-lease 安全强推（远端若被他人改动会拒绝）
  const short = `${commit.slice(0, 8)}:refs/heads/${BRANCH}`
  const lease = `--force-with-lease=refs/heads/${BRANCH}:${expectSha}`
  info(`普通推送未成功，改用 ${lease} 重试${force ? '（历史重建所需）' : ''}`)
  const retry = await gitNet(['push', `${lease}`, REMOTE, short])
  if (retry.ok) return

  // 再失败：远端引用在 fetch 之后变过 → 先取新引用并要求重跑
  const refresh = await gitNet(['fetch', '--prune', REMOTE, BRANCH])
  const now = refresh.ok
    ? gitTry(['rev-parse', `refs/remotes/${REMOTE}/${BRANCH}`]).out
    : ''
  fail(
    `推送失败：\n${retry.err}\n` +
      (now && now !== expectSha
        ? `\n  远端 ${BRANCH} 在本次拉取后被更新过（${expectSha.slice(0, 8)} → ${now.slice(0, 8)}）。请重跑本命令。`
        : `\n  请检查网络与 GitHub 凭据（本机用 gh 作为 git credential helper）。`)
  )
}

function reportDone(commit) {
  step('完成')
  info(`远端 ${REMOTE}/${BRANCH} 现在指向：${commit}`)
  info(`仓库：https://github.com/Baebear0903/sanyi-data-demand-demo`)
  info(`Pages：https://baebear0903.github.io/sanyi-data-demand-demo/`)
  info('推送会触发 .github/workflows/deploy-pages.yml 自动重建并发布站点；')
  info('可用 `gh run list --repo Baebear0903/sanyi-data-demand-demo` 查看部署进度。')
}

// ------------------------------------------------------------------ 本地校验

function runLocalChecks() {
  step('本地校验与构建（check:recipes + typecheck + build + build:offline）')
  pnpmRun('check:recipes')
  pnpmRun('typecheck')
  pnpmRun('build:only')
  pnpmRun('build:offline')
  info('本地校验全部通过 ✓')
}
