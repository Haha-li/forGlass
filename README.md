# 玻璃切割优化工具

这是一个用于玻璃排样和切割规划的工具。输入原片规格和成品清单后，系统会自动生成尽量省料的切割方案。

## 当前求解目标

1. 最少使用原片数量。
2. 在原片数量相同的前提下，尽量减小总废料面积。
3. 在总废料接近时，尽量保留更大的连续矩形余料，方便后续复用。

## 当前功能

- 支持多种原片尺寸，每种原片可分别设置宽、高、数量。
- 支持成品清单按每行一个规格录入，例如 `300*200*3`。
- 默认单位为 `mm`。
- 默认刀缝 `kerf` 和边距 `edgeMargin` 都是 `0`，可手动修改。
- 只考虑直角矩形切割，不做圆角。
- 当一块原片放不下时，会自动继续尝试第 2 块、第 3 块，直到放完或确认有些成品无法排入。
- 切割结果中，每一块原片都可以单独切换“是否允许旋转”。
- 不同成品尺寸会自动显示为不同颜色。
- 切割图中会标记每块成品和每块未使用余料的尺寸。
- 解析后的成品清单会显示数量、已切割数、未切割数，以及切自哪块原片。
- 原片清单会标记哪些原片库存没有被使用。
- 支持 Electron 桌面端，也支持纯 Web 访问。

## 技术方案

- 前端：Electron + Vue 3 + TypeScript
- Web：与桌面端共用同一套 Vue 界面
- 核心求解：`packages/core`
- 示例数据：`data/examples`

## 目录结构

```text
apps/desktop       Electron + Vue 3 桌面端 / Web 共用前端
packages/core      切割求解核心
data/examples      示例订单
.github/workflows  GitHub Actions（Web 部署 / Windows 发布）
```

## 本地开发

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

启动纯 Web 开发环境：

```bash
npm run dev:web
```

默认本地访问地址：

- Web 开发环境：[http://localhost:5173](http://localhost:5173)
- Web 预览环境：[http://localhost:4173](http://localhost:4173)

构建纯 Web 静态文件：

```bash
npm run build:web
```

本地预览 Web 构建结果：

```bash
npm run preview:web
```

## 输入说明

### Web / 桌面端界面

- 原片清单：录入宽、高、个数，可添加多条不同规格。
- 成品清单：每行一个规格，格式为 `长*宽*数量`，例如：

```text
300*200*3
450*350*2
1200*800*1
```

### 核心求解器 JSON 示例

```json
{
  "stock": [
    { "id": "stock-1", "width": 2500, "height": 2000, "quantity": 2 },
    { "id": "stock-2", "width": 1800, "height": 1200, "quantity": 3 }
  ],
  "options": {
    "kerf": 0,
    "edgeMargin": 0,
    "maxSheets": 5,
    "sheetRotation": [true, false, true]
  },
  "pieces": [
    { "id": "A", "width": 1200, "height": 800, "quantity": 3, "canRotate": true },
    { "id": "B", "width": 900, "height": 600, "quantity": 4 }
  ]
}
```

说明：

- `stock` 既可以是单个对象，也可以是对象数组。界面当前使用的是数组模式。
- 核心求解器本身不强制单位，只要求输入保持一致即可；当前界面默认按 `mm` 展示和录入。
- `sheetRotation` 是按生成出的原片顺序控制是否允许旋转。

## Web 登录说明

当前 Web 版本带了一个简单登录门槛：

- 固定密码：`2580`
- 登录状态保存在浏览器 `localStorage`
- 同一个浏览器再次访问同一个站点时，不需要重新登录
- 点击页面中的“退出登录”或清除站点数据后，需要重新输入密码

注意：这只是前端登录门槛，主要用于阻挡普通直接访问，不属于真正的服务端安全认证。

## Windows 打包与发布

本地生成 Windows 可执行文件：

```bash
npm run dist:desktop:win
```

生成结果位于 `apps/desktop/release`，通常会包含：

- `for-glass-<版本>-x64-setup.exe`
- `for-glass-<版本>-x64-portable.exe`

GitHub 自动发布规则：

- 工作流文件：`.github/workflows/release-desktop.yml`
- 推送形如 `v0.1.0` 的 Git 标签后会自动触发
- 自动构建 Windows `.exe` 并上传到 GitHub Releases

注意：标签必须带 `v` 前缀，例如 `v0.1.0`，不是 `0.1.0`。

## Web 部署

GitHub 自动部署规则：

- 工作流文件：`.github/workflows/deploy-web.yml`
- 推送到 `master` 后会自动执行测试并构建 Web 站点
- 构建产物来自 `apps/desktop/dist`
- 部署目标是 GitHub Pages

第一次启用时，需要在 GitHub 仓库设置中打开 Pages，并把来源设置为 GitHub Actions。

如果已经绑定自定义域名，也可以通过 Cloudflare 做 DNS、HTTPS 和代理。

## 后续可继续扩展

- 更强的搜索和优化策略
- 切割顺序输出
- 余料入库
- 报价与订单管理
- Android 或其他移动端封装
