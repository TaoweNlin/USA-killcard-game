# 项目文档

这里记录《美国杀》当前公开仓库版本的工程结构、规则边界和资源约定。文档只描述已经在代码中实现的能力，不把后续计划写成已完成能力。

## 文档入口

- [架构说明](./architecture.md)：技术栈、目录结构、数据流、状态流、资源路径和测试方式。
- [功能明细](./code-functionality.md)：当前规则、UI、测试、调试接口和已知边界。
- [角色美术方向](./character-art-direction.md)：角色图替换规范。
- [装备美术方向](./equipment-art-direction.md)：装备牌图替换规范。

## 快速命令

```bash
npm ci
npm run dev
npm test
npm run build
```

## 维护原则

- 新规则、新 UI 状态、新资源路径或新测试入口落地后，同步更新文档。
- 如果某个规则或技能是简化实现，文档必须明确写成“简化”，不要写成完整桌游级事件树。
- 不把 `output/`、`dist/`、`node_modules/` 或本地截图路径写进公开文档。
