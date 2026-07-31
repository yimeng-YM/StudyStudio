# StudyStudio

<p align="center">
  <img src="public/logo.png" alt="StudyStudio Logo" width="120">
</p>

StudyStudio 是一个功能丰富的智能学习助手 Web 应用，集成了 AI 功能帮助您快速整理和生成思维导图、笔记、任务清单和题库等内容，提升学习效率。

## ✨ 主要功能

### 📚 学科管理

- 创建和管理多个学科分类
- 支持手动排序、按名称/访问时间排序

### 🧠 思维导图

- 可视化思维导图编辑器（基于 ReactFlow）
- 支持节点自定义、连接线编辑
- 自动布局功能（Dagre 算法）
- AI 辅助生成思维导图

### 📝 笔记系统

- Markdown 笔记编辑器
- 支持 GFM（GitHub Flavored Markdown）
- 数学公式渲染（KaTeX）
- 代码高亮显示
- **HTML 内容预览**：
  - 内嵌 HTML 自动渲染（callout boxes、彩色文字、折叠面板等）
  - ` ```html ` 代码块自带**预览/源码切换**，预览模式使用 iframe 可交互
  - 纯 HTML 文档自动以 iframe 渲染，支持脚本交互
- 撤销/重做功能
- AI 辅助内容生成

### ✅ 任务管理

- 看板式任务管理
- 任务状态追踪（待办/进行中/已完成）
- 任务优先级设置
- 任务项添加子任务集

### 📋 题库系统

- 多种题型支持：
  - 单选题
  - 多选题
  - 填空题
  - 判断题
  - 简答题
  - 解答题
- 题目和解析支持内嵌 HTML 渲染（callout boxes、彩色标注等）
- ` ```html ` 代码块自带**预览/源码切换**
- AI 智能出题与解析
- 答题练习模式

### 🤖 AI 功能

- 支持 OpenAI 格式 API 的各类模型
- 悬浮窗 AI 助手
- 对话历史管理
- 多模态支持（视觉能力）
- 工具调用（Agent）功能

### 🎨 HTML 内容展示

笔记和题库支持 HTML 内容渲染，可通过以下方式使用：

| 方式 | 说明 | 交互性 |
|------|------|:---:|
| 内嵌 HTML | 在 Markdown 中直接写 `<div style="...">` 等标签 | 静态渲染 |
| ` ```html ` 代码块 | 围栏代码块，自带**预览/源码**切换按钮 | ✓ 可交互 |
| 纯 HTML 笔记 | 笔记内容为完整 HTML 文档时，自动以 iframe 渲染 | ✓ 可交互 |

**AI 生成 HTML 的模式**：AI 会根据需求选择不同层级的 HTML：
- **Mode 1 内嵌点缀**：1-3 行 HTML，用于 callout box、彩色文字等小装饰
- **Mode 2 紧凑组件**：5-15 行 HTML，用于折叠面板、选项卡、CSS 图表
- **Mode 3 完整块**：` ```html ` 代码块，用于复杂图表、交互式 demo

默认情况下 AI 使用纯 Markdown，仅在排版美化、可视化图表、用户明确要求时使用 HTML。

### 📊 学习统计

- 学习时长记录
- 30 天学习日历热力图
- 今日学习时长实时显示

### 💾 数据管理

- 本地数据存储（IndexedDB）
- 数据导出（JSON 格式）
- 数据导入恢复
- 支持选择性导出/导入

### 🎨 界面特性

- 深色/浅色主题切换
- 响应式设计
- 流畅动画效果（Framer Motion）
- 现代化 UI 设计

## 🛠️ 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **样式**: Tailwind CSS
- **状态管理**: Zustand
- **本地存储**: Dexie (IndexedDB)
- **路由**: React Router v7
- **思维导图**: ReactFlow
- **Markdown**: react-markdown + remark-gfm + rehype-katex + rehype-raw（内嵌 HTML 渲染）
- **动画**: Framer Motion
- **图标**: Lucide React

## 🚀 快速开始 (推荐)

### 🔗 直接使用

我已将项目部署到[地址](https://mengstudystudio.cn/)

您可以直接访问使用，数据完全存储在您本地。

### 💻 本地部署

我为您准备了一键启动脚本，可以自动处理环境配置：

1. 双击运行目录下的 **`start.bat`**
2. 脚本将自动检查并安装 Node.js（如果需要）
3. 脚本将自动安装项目依赖
4. 完成后会自动打开浏览器访问应用

### 🔎 本地搜索后端（无需 Serper/Jina Key）

搜索与网页提取服务已经独立到本仓库的 [`search` 分支](https://github.com/yimeng-YM/StudyStudio/tree/search)，不再与 `master` 的前端源码混合：

- SearXNG 聚合通用网页与图片搜索结果
- Trafilatura 提取正文并转换为 Markdown
- Playwright Chromium 兜底处理 JavaScript 渲染页面
- SQLite 持久缓存搜索和提取结果
- URL 安全策略阻止访问本机、局域网和云元数据地址

`search` 分支以服务文件作为仓库根目录，拥有自己的应用代码、依赖清单、SearXNG/Docker 配置、启动器、测试和使用文档。首次使用时，在本仓库根目录执行：

```bash
git clone --branch search --single-branch https://github.com/yimeng-YM/StudyStudio.git search
```

主仓库会忽略这个独立检出目录。运行服务的前置条件是安装并启动 Docker Desktop；首次启动还会下载 Python 依赖与 Chromium。

前端与搜索服务现在是两个独立进程：

- 双击 **`start.bat`**：打开 `http://localhost:5173`；若已检出 `search` 分支，会自动在另一个窗口启动搜索服务。
- 双击 **`start-search.bat`**：通过正式桥接入口启动独立检出中的 `search/start.bat`，不启动或构建前端。
- **`start-local.bat`** 不承担独立功能，仅为旧快捷方式保留兼容；新入口统一使用 `start-search.bat`，后续版本可删除该兼容文件。

搜索 API 监听 `http://127.0.0.1:17890`。在「设置 → 高级参数 → 联网」中选择 **Local**，本地开发时 API 地址保持为空即可；Vite 会把 `/api` 代理到搜索服务。

本地 API：

- `GET /api/health`
- `POST /api/web/search`
- `POST /api/web/images`
- `POST /api/web/extract`

### Vercel 前端连接本机搜索服务

SearXNG/Docker 后端本身不部署到 Vercel。部署在 `https://mengstudystudio.cn` 的前端会在浏览器中连接访问者自己电脑上的 `http://127.0.0.1:17890/api`，因此每位使用者仍需先运行 **`start-search.bat`**。浏览器首次访问时可能询问本地网络访问权限，需要允许。

StudyStudio 根启动器会把正式域名加入 CORS 白名单。Vercel Preview 或其他域名需要通过 `LOCAL_SEARCH_ALLOWED_ORIGINS` 把精确的 HTTPS Origin 加入白名单，然后重启搜索服务。不要使用 `*`，避免任意网站调用本机服务。完整的独立部署、API 与配置说明见 [`search` 分支 README](https://github.com/yimeng-YM/StudyStudio/tree/search)。

## 📦 手动运行

如果您更喜欢手动操作：

1. 确保已安装 [Node.js](https://nodejs.org/)
2. 安装依赖：
   ```bash
   npm install
   ```
3. 启动开发服务器：
   ```bash
   npm run dev
   ```
4. 打开浏览器访问 `http://localhost:5173`

## 🔧 构建生产版本

```bash
npm run build
```

构建产物将生成在 `dist` 目录下。

## ⚙️ AI 配置

AI 功能需要您手动配置 API。支持各种可用 OpenAI 接口格式的模型和供应商，推荐使用拥有视觉能力的 AI 以保证最佳体验，如 Google Gemini 系列。

### 推荐 API 提供商

推荐您注册使用 KouriAI，他们的服务稳定且价格优惠，与诸多 AI 提供商官方合作，数据隐私安全可靠。可以在国内网络环境下使用 OpenAI、Gemini、Claude 等模型。

> [KouriAI 地址](https://api.kourichat.com/)

### 配置步骤

1. 进入 StudyStudio 网页后，点击左下角 **设置**
2. 在 **AI 配置**中，填入你使用的 API 提供商 **请求地址** 和 **APIKey(密钥)**
3. 点击 **模型** 右侧的 **获取模型列表**，然后选择您想要使用的模型名称
4. _(可选)_ 手动填入对话命名用的模型名称（推荐使用轻量化模型）
5. 点击 **保存设置**

## 📁 项目结构

```
StudyStudio/
├── public/              # 静态资源
├── src/
│   ├── components/      # React 组件
│   │   ├── ui/          # UI 基础组件
│   │   ├── AIFloatingWindow.tsx
│   │   ├── ChatWindow.tsx
│   │   ├── MindMapEditor.tsx
│   │   ├── NotesModule.tsx
│   │   ├── QuizModule.tsx
│   │   ├── TasksModule.tsx
│   │   └── ...
│   ├── db/              # 数据库配置
│   ├── hooks/           # 自定义 Hooks
│   ├── lib/             # 工具函数
│   ├── pages/           # 页面组件
│   ├── services/        # 服务层
│   │   └── agent/       # AI Agent 工具
│   └── store/           # Zustand 状态管理
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## 🛑 如何关闭

要停止服务，只需 **关闭运行服务的命令行窗口** 即可。

## 📄 许可证

本项目仅供学习和个人使用。

---

<p align="center">
  Made with ❤️ for learners
</p>
