# 架构说明

《美国杀》是一个单机网页卡牌游戏原型，使用经典身份卡牌局流程和中文政治讽刺包装。项目不复制无名杀源码、素材、音频或皮肤。

## 技术栈

- Vite 8
- TypeScript
- 原生 DOM + CSS
- tsx 脚本测试
- Playwright 兼容的浏览器 smoke hooks

## 目录结构

```text
public/assets/          运行时图片资源
src/data/               牌、角色、身份、资源 helper、共享类型
src/game/               AmericaKillGame 规则引擎
src/tests/              数据校验和规则 smoke 测试
src/main.ts             DOM 渲染、事件委托、调试入口
src/styles.css          牌桌、卡面、动画和弹窗样式
docs/                   公开工程文档
```

## 分层

- 数据层：`src/data/*` 定义静态牌、角色、身份、资源路径和类型。
- 规则层：`src/game/engine.ts` 维护 `GameState`，处理阶段、AI、出牌、响应、判定、伤害、死亡和胜负。
- 表现层：`src/main.ts` 订阅引擎状态并更新稳定 DOM 区域；`src/styles.css` 负责视觉布局和动画。
- 验证层：`src/tests/*` 校验牌堆、资源契约和关键规则路径。

依赖方向保持单向：

```text
data -> game -> main -> styles
tests -> data + game
```

## 当前对局模型

- 5 人身份局：总统、幕僚、反对、反对、资本。
- 标准 + EX 牌堆：共 108 张。
- 当前有效角色池：22 名中文角色。
- 玩家在开局界面选择本人角色和身份；AI 自动补齐其余座位。
- 总统明置并从总统座位开始第一回合。

## 状态与交互

`GameState` 包含玩家、牌堆、弃牌堆、阶段、选择、响应、视觉队列、日志和胜负状态。

核心交互窗口：

- `pending`：等待玩家打出响应牌，例如【洗】、【票】、【事实核查】。
- `pendingDiscard`：弃牌阶段手动弃牌。
- `pendingChoice`：区域牌选择、公开募资选牌、武器技能确认、临场拼稿等通用选择。
- `currentVisual` / `visualQueue`：出牌、响应、连线、判定、伤害、回血和死亡表现。

## 资源路径

资源通过 `src/data/assets.ts` 生成，使用 Vite `BASE_URL` 兼容本地开发和 GitHub Pages 项目页。

- 游戏牌：`assets/cards/game/{cardId}.webp`
- 角色牌：`assets/cards/characters/{characterId}.webp`
- 身份牌：`assets/cards/identity/{roleId}.webp`
- 占位牌：`assets/cards/placeholders/{type}.webp`
- 牌桌背景：`assets/table/america-arena-table.png`

生产构建默认 base path 为 `/USA-killcard-game/`。

## 测试

```bash
npm test
npm run build
```

浏览器验证依赖全局调试入口：

- `window.americaKillGame`
- `window.render_game_to_text()`
- `window.advanceTime(ms)`

这些入口用于 QA 和自动化，不是正式玩家 API。

## 已知边界

- 当前是单机本地对局，没有后端、联机、账号、存档或匹配。
- AI 是可跑完整局的策略型自动玩家，不是强 AI。
- 部分角色技能仍是简化实现，不等同完整桌游事件树。
- GitHub Pages 发布需要仓库名保持 `USA-killcard-game`，否则要同步改 Vite base。
