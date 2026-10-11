Current readiness (iui.46): smoke:fence **192** green; pack:dry OK (`losebird-iui-0.12.0-iui.46.tgz`, 3.63 / 12.32 MB); smoke:fence-empty PASS; e2e:frame-store PASS; 12/12 live HD shots; synced + dsh restarted. Real npm publish still waiting Ace go-ahead + npm token. No logits claims.

# IUI npm 发布清单（`@losebird/iui`）

**产品路径：仅 dsh 插件。没有 MCP。**

当前版本目标：`0.12.0-iui.45`

验收清单见 [ACCEPTANCE.md](./ACCEPTANCE.md)（A–G 硬门槛通过后再 publish）。硬墙见 [HARD-WALLS.md](./HARD-WALLS.md)。

## 发布前检查

1. **版本**  
   - `package.json` → `version`（现为 `0.12.0-iui.45`）  
   - 与 CHANGELOG / ACCEPTANCE / PUBLISH 目标行一致

2. **包元数据**  
   - `name`: `@losebird/iui`  
   - `publishConfig.access`: `public`  
   - `files`: `lib/`、`src/`、`SKILL.md`、`cordis.patch.yml`、README、LICENSE、`docs/INSTALL.md`、`docs/UPGRADE.md`、`docs/PUBLISH.md`、`docs/ACCEPTANCE.md`、`docs/HARD-WALLS.md`、`docs/DIL-SCHEMA.md`、`docs/SETTINGS.md`  
   - `repository`：在公开独立仓就绪前可暂指向上游 GenUI（MIT fork）；独立仓就绪后改成你们的 `losebird/iui`

3. **构建与自动化**  
   ```bash
   pnpm install
   pnpm run build
   pnpm run smoke:fence
   pnpm run pack:dry
   bash scripts/sync-to-dsh-profile.sh
   # frame/store API（无需额度）：
   pnpm run e2e:frame-store -- --url "$DSH_URL"
   # 有 FreeLLMAPI / 额度且 dsh 已起：
   # pnpm run e2e:session -- --url 'http://127.0.0.1:3080/?token=…'
   # pnpm run shots:dil-hd -- --url 'http://127.0.0.1:3080/?token=…'
   # dsh web 起来后：
   pnpm run smoke:fence-empty -- --url 'http://127.0.0.1:3080/?token=…'
   ```
   CI：`.github/workflows/ci.yml` 的 `check`（current/node24）会跑 Playwright `smoke:fence-empty`。

4. **内容抽检**  
   - `lib/index.js`、`lib/client.js` 存在  
   - `lib/assets/pack-mui.js` / `pack-antd.js` / `pack-chakra.js` 存在（官方库懒加载）  
   - 无 MCP Host 依赖写入产品路径  
   - `cordis.patch.yml` 含 settings `insert`  
   - 三库密度走 `themeFromPackBrand` + `IUI_TOKEN_CATALOG`（非各 pack 硬编码 gap）  
   - `iui-html` 含 form-bridge / compare-cards / tabs-panel / echarts-mini starters

5. **本地冒烟（硬门槛）**  
   - 按 [ACCEPTANCE.md](./ACCEPTANCE.md) A–E  
   - dsh web 只装 `@losebird/iui` 作为 Intelligent UI 主路径  
   - 控制台：`[iui] client active`  
   - 设置 → IUI 可见；默认包 shadcn；Gateway / fence-ops 可见  
   - 自然句「资源」出 ` ```iui `（非纯 Markdown）；若模型仍出 Markdown，客户端应出现「IUI 自动补救」  
   - 地图问句出原生 OSM/Leaflet（非仅外链卡）  
   - ` ```iui-html ` 沙箱可渲染

## 干跑 pack（必做，不上传）

```bash
pnpm run pack:dry
# 等价：
node scripts/verify-pack.mjs

# 保留 tarball 人工抽看：
node scripts/verify-pack.mjs --keep

# npm 自带干跑（只列将上传的文件，不校验体积门槛）：
npm pack --dry-run
```

**干跑通过标准**

- `verify-pack: OK`（或脚本打印的成功摘要）  
- tarball 含 `package.json`、`lib/index.js`、`lib/client.js`、`SKILL.md`、`cordis.patch.yml`、`docs/ACCEPTANCE.md`、`docs/HARD-WALLS.md`  
- 无 `.map` / `.tsbuildinfo`  
- 体积低于脚本默认上限（默认约 **3.75 MB** tarball / **12.5 MB** unpacked；`.43` 因 sandbox base CSS + density 抬过 unpack 门闸。可用 `GENUI_PACK_MAX_TARBALL` / `GENUI_PACK_MAX_UNPACKED` 覆盖）

**不要在干跑阶段执行 `npm publish`。没有 Ace npm token 就不要 publish。**

## 正式发布步骤

```bash
# 登录（scoped 包需要 npm 有 @losebird 权限）
npm login

# 正式发布
npm publish --access public

# 若用 tag 预发：
# npm publish --access public --tag next
```

## 发布后

1. 在干净 profile 用 registry 安装：`pnpm add @losebird/iui@0.12.0-iui.45`  
2. 重复 ACCEPTANCE A–E  
3. 打 git tag：`v0.12.0-iui.45`  
4. 更新 `docs/INSTALL.md` 版本说明

## 诚实未完成（不要写进「已生产就绪」）

见 ACCEPTANCE §H 与 [HARD-WALLS.md](./HARD-WALLS.md)：

- 非 logits constrained decoding（prefill ≠ 采样约束）  
- 非 ChatGPT DIL 字节码 / 多副本 store / 二进制 UI frame  
- 三库密度对齐 ≠ 完整官方设计系统  
- 沙箱仍是加固 MVP  
- `npm publish` 待 Ace token
