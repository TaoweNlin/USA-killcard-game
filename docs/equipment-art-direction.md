# 装备牌美术方向

本文记录装备牌运行图的替换规范。图片只负责卡牌插画，牌名、花色点数、类别标签和规则文本由 DOM 渲染。

## 文件契约

- 路径：`public/assets/cards/game/{cardId}.webp`
- 推荐尺寸：`750x1050`
- 比例：`5:7`
- 格式：WebP 优先

## 装备牌列表

| cardId | 牌名 | 类型 |
| --- | --- | --- |
| repeatMic | 白宫发布厅 | 武器 |
| twoTrackMessage | 游行旗帜 | 武器 |
| gotchaQuestion | 丑闻录音带 | 武器 |
| draftScramble | 提词器救场 | 武器 |
| followUpMic | 国会听证会 | 武器 |
| moneyPush | 美军 | 武器 |
| tripleBroadcast | 全频道插播 | 武器 |
| cutTour | 电子脚镣 | 武器 |
| coldTreatment | FBI | 武器 |
| prTeam | 公关部 | 防具 |
| safeState | 防弹衣 | 防具 |
| securityMotorcade | 特勤局车队 | +1 车队 |
| campaignJet | 空军一号 | -1 专机 |

## 画面要求

- 主体应是可识别的政治工具、机构、场景或物件。
- 风格保持高对比、红蓝舞台光、厚墨线、桌游卡牌插画质感。
- 物体或场景占画面约 70%-85%，留出边缘安全区。
- 背景可以夸张和讽刺，但必须服务主体识别。

## 避免内容

- 不要把牌名、规则、花色点数、logo、水印或 UI 画进图片。
- 不要使用真实党徽、官方标志或商业商标。
- 不要做成抽象图标；游戏内卡面需要玩家一眼看懂主体。

## 替换流程

1. 将新图导出为 `750x1050` WebP。
2. 覆盖对应 `public/assets/cards/game/{cardId}.webp`。
3. 运行 `npm test` 和 `npm run build`。
4. 在手牌、卡牌详情和装备文字条场景中检查显示。
