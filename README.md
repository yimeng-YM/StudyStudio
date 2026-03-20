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
- AI 智能出题与解析
- 答题练习模式

### 🤖 AI 功能

- 支持 OpenAI 格式 API 的各类模型
- 悬浮窗 AI 助手
- 对话历史管理
- 多模态支持（视觉能力）
- 工具调用（Agent）功能

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
- **Markdown**: react-markdown + remark-gfm + rehype-katex
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
