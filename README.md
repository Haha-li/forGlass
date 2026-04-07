# 玻璃切割优化桌面端

这个项目用于根据客户给出的玻璃尺寸清单，计算原片玻璃的切割方案。

当前版本的目标顺序是：

1. 最少使用原片数量。
2. 在原片数量相同的前提下，最小化总废料面积。
3. 在总废料相同的前提下，尽量保留更大的连续余料矩形，方便后续复用。

## 技术方案

- 桌面端：Electron + Vue 3 + TypeScript
- 核心求解：独立 `packages/core`，后续移动端可以直接复用
- 示例数据：`data/examples`

## 当前实现范围

- 支持单一原片尺寸
- 支持多个成品尺寸和数量
- 支持旋转
- 支持刀缝 `kerf`
- 支持四边预留边距 `edgeMargin`
- 当一块原片放不下时，自动追加第 2 块、第 3 块，直到放完或发现某些尺寸根本无法切

当前求解器是一个可扩展的启发式二维排样版本，先把项目从零搭起来并保证可运行。后续可以在这个基础上继续加：

- 更强的分支限界搜索
- 切割顺序输出
- 余料入库
- 报价与订单管理
- 移动端复用

## 目录

```text
apps/desktop       Electron + Vue 3 桌面端
packages/core      切割求解核心
data/examples      示例订单
```

## 本地启动

先安装依赖：

```bash
npm install
```

运行核心示例：

```bash
npm run solve:example
```

运行核心测试：

```bash
npm run test:core
```

启动桌面端开发环境：

```bash
npm run dev:desktop
```

## 输入模型

```json
{
  "stock": { "width": 3660, "height": 2440 },
  "options": { "kerf": 5, "edgeMargin": 10 },
  "pieces": [
    { "id": "A", "width": 1200, "height": 800, "quantity": 3, "canRotate": true },
    { "id": "B", "width": 900, "height": 600, "quantity": 4 }
  ]
}
```

核心求解器本身不强制单位，只要求输入保持一致即可；当前桌面端界面默认按 cm 展示和录入。
