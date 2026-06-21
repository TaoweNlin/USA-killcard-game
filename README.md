# USA-killcard-game / 美国杀

[中文](#中文) | [English](#english)

## 中文

《美国杀》是一个 Vite + TypeScript + 原生 DOM/CSS 实现的单机网页卡牌游戏原型。它以经典身份卡牌局的流程为骨架，换成美国政治讽刺包装：角色、身份、牌名、技能和日志都使用中文表达。

> 免责声明：本项目是虚构游戏与政治讽刺原型，不代表、隶属于或获得任何现实人物、组织、公司、游戏发行方或公共机构背书。

### 在线试玩

GitHub Pages 目标地址：

```text
https://<your-github-user>.github.io/USA-killcard-game/
```

上传仓库并启用 GitHub Actions Pages 后，页面会由 `.github/workflows/pages.yml` 自动构建发布。

### 功能

- 5 人身份局：总统、幕僚、反对、反对、资本。
- 标准 + EX 牌堆：共 108 张游戏牌。
- 开局选择：玩家可选择自己的角色和身份，其余 AI 自动补齐。
- 五人牌桌 UI：围桌角色牌、底部手牌、行动按钮、日志、技能入口、视觉事件层。
- 基础响应节奏：出牌、响应、判定、摸牌、弃牌、装备、濒死救援和胜负结算。
- 图片资源接口：运行资源放在 `public/assets`，后续替换 WebP 不需要改规则代码。

### 技术栈

- Vite 8
- TypeScript
- 原生 DOM + CSS
- 基于 tsx 的数据/规则测试
- 通过 `window.render_game_to_text()` 和 `window.advanceTime(ms)` 支持浏览器 smoke 测试

### 本地运行

```bash
npm ci
npm run dev
```

本地开发服务：

```text
http://127.0.0.1:5173/
```

### 常用脚本

```bash
npm test          # 数据校验 + 规则 smoke 测试
npm run build    # TypeScript 检查 + Vite 生产构建
npm run preview  # 本地预览生产构建
```

生产构建使用 GitHub Pages 项目页 base path：`/USA-killcard-game/`。本地预览时打开：

```text
http://127.0.0.1:4173/USA-killcard-game/
```

### 项目结构

```text
public/assets/          运行图片和牌桌背景
src/data/               牌、角色、身份、共享类型、资源 helper
src/game/               AmericaKillGame 规则引擎
src/tests/              数据校验和规则 smoke 测试
src/main.ts             DOM 渲染和 UI 事件委托
src/styles.css          牌桌布局、卡面、动画和弹窗
docs/                   架构和实现文档
```

### 资源政策

本仓库当前将随项目发布的运行美术资源与代码一起按 MIT 许可证发布。生成草稿、QA 截图、备份和本地实验输出通过 `.gitignore` 排除。

图片替换契约：

- 游戏牌：`public/assets/cards/game/{cardId}.webp`
- 角色：`public/assets/cards/characters/{characterId}.webp`
- 身份：`public/assets/cards/identity/{roleId}.webp`
- 牌桌背景：`public/assets/table/america-arena-table.png`

卡牌和角色图推荐源尺寸为 `750x1050`，比例 `5:7`。

### 参考边界

本项目参考经典身份卡牌局的桌面流程和交互节奏，但不复制无名杀源码、GPL 素材、音频、皮肤或 UI 文件。

### 许可证

MIT。见 [LICENSE](./LICENSE) 和 [NOTICE.md](./NOTICE.md)。

---

## English

USA-killcard-game is a single-player browser card-game prototype built with Vite, TypeScript, and native DOM/CSS. It follows the flow of a classic hidden-role tabletop card game, then repackages the experience as Chinese-language American political satire.

> Disclaimer: This is a fictional game and political satire prototype. It is not affiliated with, endorsed by, or sponsored by any real person, organization, company, game publisher, or public institution.

### Online Demo

Target GitHub Pages URL:

```text
https://<your-github-user>.github.io/USA-killcard-game/
```

After the repository is uploaded and GitHub Pages via Actions is enabled, `.github/workflows/pages.yml` will build and deploy the site automatically.

### Features

- 5-player identity mode: President, Staffer, Opposition, Opposition, Capital.
- Standard + EX deck: 108 game cards.
- Pre-game selection: the human player chooses their character and role; AI seats are filled automatically.
- Five-seat table UI: character panels, bottom hand cards, action controls, logs, skill chips, and visual event layer.
- Core card-play rhythm: play, respond, judge, draw, discard, equip, dying rescue, and win/loss resolution.
- Replaceable art interface: runtime assets live in `public/assets`, so WebP art can be swapped without changing rule code.

### Tech Stack

- Vite 8
- TypeScript
- Native DOM + CSS
- tsx-based data and rules tests
- Browser smoke-test hooks through `window.render_game_to_text()` and `window.advanceTime(ms)`

### Getting Started

```bash
npm ci
npm run dev
```

Local development server:

```text
http://127.0.0.1:5173/
```

### Scripts

```bash
npm test          # data validation + rule smoke tests
npm run build    # TypeScript check + Vite production build
npm run preview  # preview the production build locally
```

The production build uses the GitHub Pages project base path `/USA-killcard-game/`. For local production preview, open:

```text
http://127.0.0.1:4173/USA-killcard-game/
```

### Project Structure

```text
public/assets/          Runtime images and table background
src/data/               Cards, characters, roles, shared types, asset helpers
src/game/               AmericaKillGame rules engine
src/tests/              Data validation and rules smoke tests
src/main.ts             DOM rendering and UI event delegation
src/styles.css          Table layout, card faces, animation, modals
docs/                   Architecture and implementation notes
```

### Asset Policy

The bundled runtime artwork is currently published under the MIT license together with the code. Source-generation drafts, QA screenshots, backups, and local experiment outputs are intentionally excluded through `.gitignore`.

Image replacement contract:

- Game cards: `public/assets/cards/game/{cardId}.webp`
- Characters: `public/assets/cards/characters/{characterId}.webp`
- Identities: `public/assets/cards/identity/{roleId}.webp`
- Table background: `public/assets/table/america-arena-table.png`

Recommended source size for card and character art is `750x1050` with a `5:7` ratio.

### Reference Boundary

The project references the tabletop flow and interaction rhythm of classic hidden-role card games. It does not copy Noname Kill source code, GPL assets, audio, skins, or UI files.

### License

MIT. See [LICENSE](./LICENSE) and [NOTICE.md](./NOTICE.md).
