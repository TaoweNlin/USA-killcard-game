# USA-killcard-game / 美国杀

[在线试玩](https://taowenlin.github.io/USA-killcard-game/) | [GitHub 仓库](https://github.com/TaoweNlin/USA-killcard-game) | [中文](#中文) | [English](#english)

## 中文

《美国杀》是一款单机网页身份卡牌游戏原型，用经典身份局的回合、响应、装备、判定、濒死救援和胜负结算作为规则骨架，再把角色、身份、牌名、技能、日志和牌桌视觉重新包装成中文美国政治讽刺题材。

项目的第一目标不是做一个静态卡牌展示页，而是做一局能真实推进的浏览器牌局：玩家可以在开局前选择角色和身份，和 4 名 AI 组成 5 人身份局，在牌桌上完成摸牌、出牌、响应、装备、锦囊结算、技能查看和胜负判定。当前版本仍是单机原型，但工程结构已经按可继续扩展的规则层、数据层、资源层和 UI 层拆分。

**在线试玩：** [https://taowenlin.github.io/USA-killcard-game/](https://taowenlin.github.io/USA-killcard-game/)

> 免责声明：本项目是虚构游戏与政治讽刺原型，不代表、隶属于或获得任何现实人物、组织、公司、游戏发行方或公共机构背书。

### 当前体验

- 5 人身份局：总统 1、幕僚 1、反对 2、资本 1。
- 标准 + EX 牌堆：共 108 张游戏牌，使用《美国杀》牌名与中文效果文案。
- 开局选择：玩家选择自己的角色和身份，其余 AI 自动补齐角色和身份池。
- 牌桌交互：围桌角色牌、底部手牌、行动按钮、目标选择、响应窗口、日志、技能入口和视觉事件层。
- 核心流程：准备、判定、摸牌、出牌、弃牌、结束六阶段，以及出牌、打出、锦囊抵消、判定牌、装备区、濒死救援、死亡奖惩和胜负结算。
- 视觉表现：美国政治竞技场牌桌、红白蓝出牌连线、飞牌、判定、伤害/回血弹字和角色技能浮层。
- 资源替换：运行图片放在 `public/assets`，游戏牌、角色牌、身份牌和牌桌背景都保留稳定路径，后续替换 WebP/PNG 不需要改规则代码。

### 项目定位

这个仓库更接近“可玩的规则原型 + 前端牌桌实验”，而不是完整商业游戏。它适合作为以下方向的基础：

- 继续打磨标准身份牌局的规则一致性和 AI 行为。
- 替换正式角色图、游戏牌图和身份牌图。
- 扩展更多角色技能、动画表现和单机剧情包装。
- 后续接入存档、联机、更多模式或移动端适配。

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

USA-killcard-game is a single-player browser hidden-role card-game prototype built with Vite, TypeScript, and native DOM/CSS. It uses the turn flow, responses, equipment, delayed tricks, dying rescue, and win/loss structure of a classic identity card-game table, then repackages the full experience as Chinese-language American political satire.

The goal is not a static card gallery. The current build is a playable browser table: the human player chooses a character and role before the match, joins four AI seats in a five-player identity game, then plays through drawing, using cards, responding, equipping, resolving tricks, checking skills, and reaching a win/loss result. It is still a single-player prototype, but the codebase is already organized into data, rules, assets, UI, and tests so the project can keep growing.

**Online demo:** [https://taowenlin.github.io/USA-killcard-game/](https://taowenlin.github.io/USA-killcard-game/)

> Disclaimer: This is a fictional game and political satire prototype. It is not affiliated with, endorsed by, or sponsored by any real person, organization, company, game publisher, or public institution.

### Current Experience

- 5-player identity mode: President, Staffer, Opposition, Opposition, Capital.
- Standard + EX deck: 108 game cards with America Kill names and Chinese effect text.
- Pre-game selection: the human player chooses their character and role; AI seats are filled automatically.
- Table interaction: five-seat character layout, bottom hand cards, action controls, target selection, response windows, logs, skill chips, and a visual event layer.
- Core flow: prepare, judge, draw, play, discard, and finish phases, plus use/respond timing, nullification, delayed tricks, equipment zones, dying rescue, death rewards/penalties, and victory checks.
- Visual style: American political arena table, red-white-blue target lines, flying cards, judgment flips, damage/heal popups, and character skill popovers.
- Replaceable assets: game cards, character cards, identity cards, and table backgrounds use stable paths under `public/assets`, so artwork can be swapped without changing rule code.

### Project Direction

This repository is best understood as a playable rules prototype and front-end card-table experiment, not a finished commercial game. It is designed to support:

- Iterating on rule accuracy and AI behavior.
- Replacing placeholder/generated art with final game assets.
- Adding more character skills, visual feedback, and single-player flavor.
- Future work such as saves, networking, additional modes, or mobile layout.

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
