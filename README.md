<p align="center">
  <img src="public/logo.png" alt="StudyStudio 标志" width="112">
</p>

# StudyStudio

**以学科组织知识，用 AI 辅助理解、规划与练习的个人学习工作台。**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React 18](https://img.shields.io/badge/React-18-149eca?logo=react&logoColor=white)](package.json)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](package.json)
[![Vite 5](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)](vite.config.ts)

[在线使用](https://mengstudystudio.cn/) · [应用内使用文档](https://mengstudystudio.cn/#/docs) · [问题反馈](https://github.com/yimeng-YM/StudyStudio/issues)

StudyStudio 以学科为单位组织思维导图、Markdown 笔记、任务看板与题库，并提供能读取当前上下文的 AI 助手。你可以手动整理学习内容，也可以让 AI 结合当前页面和已有资料生成导图、修改笔记、拆解任务或补充练习题。

应用采用浏览器本地存储，无需注册账户。基础学习功能可独立使用；AI 需要配置自己的模型服务，联网检索可按需接入本地搜索服务或第三方 API。

## 导航

- [功能概览](#功能概览)
- [快速开始](#快速开始)
- [AI 配置与使用](#ai-配置与使用)
- [联网搜索](#联网搜索)
- [数据与隐私](#数据与隐私)
- [构建与部署](#构建与部署)
- [开发指南](#开发指南)
- [常见问题](#常见问题)
- [参与贡献](#参与贡献)
- [开源协议](#开源协议)

## 功能概览

| 模块 | 主要能力 |
| --- | --- |
| 学科空间 | 按学科管理学习内容，自定义名称和图标，支持手动排序及多种排序方式 |
| 思维导图 | 节点编辑、拖拽连线、自动布局、批量操作，以及笔记和任务关联 |
| 笔记 | Markdown 与 GFM、数学公式、代码高亮、Mermaid 图表、HTML 预览和撤销重做 |
| 任务看板 | 在画布中组织任务块、任务项和子任务集，追踪完成情况 |
| 题库练习 | 单选、多选、填空、判断、简答和解答题；支持题目编辑、解析展示与答题记录 |
| AI 助手 | 多供应商与模型切换、流式对话、附件理解、工具调用、规划与研究模式、多个会话任务在应用内持续运行 |
| 学习统计 | 今日学习时长、最近 30 天学习日历和学习内容概览 |
| 数据管理 | JSON 导出与导入，可选择学科、内容、对话记录和 AI 配置 |
| 界面定制 | 桌面与移动端响应式布局、深浅主题、强调色、自定义背景和字体大小 |

## 快速开始

### 环境要求

| 依赖 | 要求 |
| --- | --- |
| Node.js | **22.13.0 或更高版本**；此下限来自当前锁定的 `pdfjs-dist` 依赖 |
| npm | 使用随 Node.js 安装的 npm，按 `package-lock.json` 安装依赖 |
| Git | 用于克隆代码和独立搜索分支 |
| 浏览器 | 支持 IndexedDB 的现代浏览器 |

Python 和 Docker 仅在运行可选的本地搜索服务时需要。在线使用前端无需安装上述开发工具。

### 本地开发

```bash
git clone --branch master https://github.com/yimeng-YM/StudyStudio.git
cd StudyStudio
npm ci
npm run dev
```

打开 [http://127.0.0.1:5173](http://127.0.0.1:5173)。开发服务器默认绑定本机回环地址，端口被占用时会报错，不会自动切换到其他端口。

在侧边栏或移动端学科页创建一个学科，随后添加导图、笔记、任务看板或题库。配置 AI 后，可以从对话页或悬浮助手开始提问；详细操作见应用内的「使用文档」。

### Windows 启动器

安装 Node.js 并获取源码后，可双击根目录的 [`start.bat`](start.bat)，或在 PowerShell 中运行：

```powershell
.\start.bat
```

启动器检查 Node.js，在缺少 `node_modules` 时执行 `npm install`，然后启动前端并打开浏览器。已检出 `search/` 时，它还会检查并按需启动独立搜索服务。缺少 Node.js 时会提示安装地址，需要自行完成安装。

使用期间保持服务窗口打开；停止前端可在对应终端按 `Ctrl+C`。搜索服务在独立窗口运行，需要单独停止。

## AI 配置与使用

### 连接模型服务

StudyStudio 使用 **OpenAI 兼容的 Chat Completions 接口**。浏览器直接请求你配置的服务，供应商需要允许应用所在来源的跨域访问。

1. 打开「设置 → 供应商」，新增或编辑一个供应商。
2. 填写名称、API 基础地址和 API Key，也可选用内置模板预填名称与地址。
3. 获取模型列表并加入模型清单；服务不支持模型列表接口时，可手动添加模型名称。
4. 保存供应商，将其设为当前供应商并选择当前模型。
5. 按需在「设置 → 高级参数」调整生成参数，或为会话命名单独指定供应商与模型。

API 基础地址应包含服务需要的版本路径，例如 `https://api.example.com/v1`，不要填写完整的 `/chat/completions` 地址。应用会在基础地址后追加 `/models` 或 `/chat/completions`；未包含 `/v数字` 版本段时会自动补上 `/v1`。

AI 编辑导图、笔记、题库等功能依赖模型的 **工具调用能力**；图片和文档中的图像理解依赖 **视觉能力**。实际可用能力、上下文长度和调用费用取决于所选服务与模型。

### 工作模式

| 模式 | 用途 |
| --- | --- |
| 快速执行 | 直接处理明确请求，例如修改笔记、生成题目或调整导图 |
| 深度规划 | 先提出计划，再根据确认结果逐步执行复杂任务 |
| 深度研究 | 结合检索与子代理协作处理较复杂的问题；联网检索需要额外启用搜索工具 |

AI 可以通过工具读取和修改学习内容。应用会展示工具调用、任务进度以及需要用户回答的问题；执行后可到对应学科查看和编辑结果。

会话任务可在切换应用页面、关闭悬浮助手或切换会话后继续运行。这里的后台任务依赖当前网页保持运行，刷新、关闭页面或浏览器挂起会中断执行。

### 附件与内容展示

| 输入 | 处理方式 |
| --- | --- |
| 图片 | 作为图像提供给支持视觉的模型 |
| PDF | 提取文本，对部分文本不足的页面渲染图像供模型理解 |
| DOCX、PPTX | 提取文字及支持的内嵌图片 |
| XLSX、XLS | 提取工作表内容 |
| TXT、Markdown、HTML、CSV、JSON 及支持的代码文件 | 读取为文本 |

附件先在浏览器中解析；发起 AI 请求后，相关文本和图像会随对话发送给模型服务。扫描文档和复杂版式的理解效果取决于解析结果与模型能力。

消息和学习内容支持数学公式、Mermaid、ECharts 及 HTML 展示。HTML 代码块提供预览与源码切换，交互预览使用允许脚本执行的沙箱 iframe。外部图片或 HTML 内容仍可能发起网络请求，导入和预览内容时应确认其来源。

## 联网搜索

联网功能与模型服务分别配置。在「设置 → 高级参数 → 联网（搜索 + 网页读取）」中选择后端，然后在 AI 对话的工具菜单中开启「联网搜索 + 网页读取」。

| 后端 | 配置要求 | 运行方式 |
| --- | --- | --- |
| Local | 本地搜索服务；无需 Serper / Jina API Key | SearXNG 搜索，Trafilatura 提取正文，Playwright 处理需要浏览器渲染的页面 |
| Serper | Serper API Key | 浏览器请求对应的搜索与网页提取 API |
| Jina | Jina API Key | 浏览器请求对应的搜索与网页读取 API |

Local 服务仍需联网访问搜索引擎和目标网页。

### 启动本地搜索服务

搜索后端维护在独立的 [`search` 分支](https://github.com/yimeng-YM/StudyStudio/tree/search)。Windows 启动前请安装 **Python 3.11+**，并安装、启动 **Docker Desktop**。

在前端仓库根目录执行一次：

```bash
git clone --branch search --single-branch https://github.com/yimeng-YM/StudyStudio.git search
```

`search/` 是独立检出目录，已被主分支的 `.gitignore` 忽略。随后双击 [`start-search.bat`](start-search.bat)，或在 PowerShell 中运行：

```powershell
.\start-search.bat
```

也可使用 `npm run search` 调用 PowerShell 桥接入口；两者都只启动搜索服务。首次运行会准备 Python 虚拟环境、安装依赖和 Playwright Chromium，并启动 SearXNG。

服务默认监听 `http://127.0.0.1:17890`，可通过 [健康检查](http://127.0.0.1:17890/api/health) 或设置页的「检测」按钮确认状态。完整 API、Linux / macOS 启动方式和环境配置见 [搜索服务文档](https://github.com/yimeng-YM/StudyStudio/blob/search/README.md)。

### 前端如何连接搜索服务

| 使用场景 | 本地 API 地址与连接方式 |
| --- | --- |
| 默认本机开发 | 设置中的地址留空，使用 `/api`，由 Vite 代理到 `http://127.0.0.1:17890` |
| 访问已部署的网站 | 默认连接访问者自己设备上的 `http://127.0.0.1:17890/api`，需要在该设备运行搜索服务 |
| 自定义搜索地址 | 在设置中填写包含 `/api` 的完整地址；服务需允许当前网页的 Origin |

以上为未设置 `VITE_LOCAL_SEARCH_BASE_URL` 时的默认行为。手机上的 `127.0.0.1` 指向手机自身；连接电脑上的服务需按搜索服务文档配置局域网监听、Host / Origin 白名单和防火墙。

从 HTTPS 网站访问本机服务时，浏览器可能要求授予本地网络访问权限。根目录的 `start-search.bat` 默认追加正式网站的 Origin；自部署网站或预览域名可在启动前显式配置：

```powershell
$env:LOCAL_SEARCH_ADDITIONAL_ORIGINS = "https://study.example.com"
.\start-search.bat
```

多个 Origin 使用逗号分隔，填写准确的协议、域名和端口，不包含页面路径。修改后重启搜索服务。纯前端托管不会替访问者运行 Python、Docker 或 SearXNG。

## 数据与隐私

| 数据 | 存储或传输方式 |
| --- | --- |
| 学科、学习内容、关系、会话、附件和学习记录 | 通过 Dexie 存储于当前浏览器的 IndexedDB |
| 供应商地址、API Key 和 AI 配置 | 存储于当前浏览器的 IndexedDB，未做应用层加密 |
| 主题、背景及部分界面偏好 | 存储于浏览器本地存储 |
| AI 请求 | 对话、附件解析结果和工具读取的相关学习内容会发送到所选模型服务 |
| 联网检索 | 查询词与目标网址会发送到所选搜索后端；本地后端也会访问外部搜索引擎和网页 |

数据按浏览器及网站来源隔离：不同设备、浏览器、域名、协议或端口不会自动共享数据。`localhost` 与 `127.0.0.1` 也属于不同来源。清除站点数据、卸载浏览器或结束隐私浏览会话可能导致数据丢失。

请在「设置 → 数据」定期导出 JSON 备份，并在迁移设备或更换访问地址前备份学习内容。导入时可以选择需要恢复的内容以及是否导入 AI 配置。当前备份不是完整的浏览器状态快照，界面偏好和学习时长记录不在导出结构中。

**默认不导出 AI 配置；勾选后，备份中将包含供应商 API Key 等敏感信息。** 共享备份或提交 Issue 前应移除密钥和私人内容。仓库没有提供账户系统或自动云同步；模型与搜索服务的数据处理方式由相应服务提供方决定。

## 构建与部署

### 生产构建

```bash
npm ci
npm run build
```

构建先执行 TypeScript 检查，再将静态资源输出到 `dist/`。本地预览构建结果：

```bash
npm run preview -- --host 127.0.0.1
```

访问终端显示的预览地址，默认端口为 `4173`。`preview` 用于本地检查构建产物，正式部署请使用静态托管服务。

### 静态托管与 Vercel

将 `dist/` 的内容部署到 HTTP(S) 服务的站点根目录即可。项目使用 `HashRouter`，页面地址形如 `/#/settings`，无需为这些页面配置服务端路由重写；网站仍需正确提供静态资源。部署到子路径时，需先调整 Vite 的 `base` 配置并重新构建。

仓库的 [`vercel.json`](vercel.json) 已声明以下配置：

| 配置项 | 值 |
| --- | --- |
| 框架 | Vite |
| 安装命令 | `npm ci` |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |

前端部署使用 `master` 分支；配置已禁用 `search` 分支的自动部署。带哈希的 `/assets/` 资源使用长期缓存，首页与 `index.html` 禁止缓存，以减少更新后的资源版本错配。

生产静态托管不包含 Vite 开发服务器的代理。需要联网功能时，应按前面的说明连接独立搜索服务，或使用 Serper / Jina。

### 环境变量

| 变量 | 默认值 | 生效范围 |
| --- | --- | --- |
| `STUDYSTUDIO_DEV_PORT` | `5173` | Vite 开发端口，以及 Windows 启动器打开的页面端口 |
| `STUDYSTUDIO_LOCAL_BACKEND_URL` | `http://127.0.0.1:17890` | Vite 开发服务器 `/api` 代理的目标，不附加 `/api` |
| `VITE_LOCAL_SEARCH_BASE_URL` | 本机页面使用 `/api`，其他域名使用 `http://127.0.0.1:17890/api` | 前端的默认搜索 API 地址；部署时在构建阶段写入，可被应用设置覆盖 |
| `STUDYSTUDIO_SKIP_SEARCH` | 未设置 | 设为 `1` 时，`start.bat` 跳过自动启动搜索服务 |
| `STUDYSTUDIO_SKIP_BROWSER` | 未设置 | 设为 `1` 时，`start.bat` 跳过自动打开浏览器 |

Vite 配置可通过进程环境变量或根目录 `.env.local` 提供。Windows 批处理启动器读取的是进程环境变量；需要让启动器同步使用自定义端口时，可在 PowerShell 中设置：

```powershell
$env:STUDYSTUDIO_DEV_PORT = "5174"
.\start.bat
```

`VITE_` 前缀的配置会进入浏览器代码，仅用于公开配置。API Key 应通过应用设置填写，不要放入前端构建变量或提交到仓库。

## 开发指南

### 技术栈

| 层次 | 主要技术 |
| --- | --- |
| 应用与构建 | React 18、TypeScript 5、Vite 5、React Router 7 |
| 界面 | Tailwind CSS 3、Framer Motion、Lucide React |
| 状态与持久化 | Zustand 5、Dexie 4 / IndexedDB |
| 画布与布局 | React Flow 11、Dagre、React Grid Layout |
| 内容渲染 | React Markdown、remark / rehype、KaTeX、Mermaid、ECharts |
| 文件解析 | PDF.js、Mammoth、SheetJS、JSZip |

依赖声明见 [`package.json`](package.json)，可复现安装使用 [`package-lock.json`](package-lock.json) 锁定的版本。

### 项目结构

```text
StudyStudio/
├── public/                  # 图标与品牌资源
├── scripts/                 # 搜索服务的 PowerShell 桥接入口
├── src/
│   ├── components/          # 导图、笔记、题库、任务看板与 AI 交互组件
│   │   ├── charts/          # 图表渲染
│   │   ├── settings/        # 供应商与高级参数
│   │   └── ui/              # 通用界面组件
│   ├── db/                  # IndexedDB 模型与版本迁移
│   ├── hooks/               # 会话、历史、排序、主题与学习统计
│   ├── lib/                 # 文件解析、工具配置与通用函数
│   ├── pages/               # 仪表盘、学科、AI 对话、设置与使用文档
│   ├── services/            # AI 请求、后台任务与数据导入导出
│   │   └── agent/           # 工具定义、读写实现及子代理执行
│   ├── store/               # Zustand 状态管理
│   ├── App.tsx              # 路由与全局运行时
│   └── main.tsx             # 应用入口
├── LICENSE                  # MIT 开源协议
├── start.bat                # Windows 前端启动器
├── start-search.bat         # Windows 搜索服务桥接入口
├── package.json             # 依赖与 npm 命令
├── package-lock.json        # 依赖锁文件
├── vercel.json              # 静态托管构建与缓存配置
└── vite.config.ts           # 开发服务器、代理与构建配置
```

`master` 维护 Web 前端，`search` 维护独立搜索服务；Android 相关代码见 [`android` 分支](https://github.com/yimeng-YM/StudyStudio/tree/android)。可选的本地 `search/` 检出目录不属于主分支源码。

### 开发命令与验证

| 命令 | 作用 |
| --- | --- |
| `npm ci` | 按锁文件安装依赖 |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 执行 TypeScript 检查并构建生产资源 |
| `npm run preview` | 预览已生成的构建产物 |
| `npm run search` | 通过 PowerShell 启动独立搜索服务 |
| `npm run lint` | 调用 ESLint；当前仓库尚未提交 ESLint 配置，运行会因找不到配置而失败 |

当前主分支未配置 `npm test` 脚本或自动化测试流水线。提交改动前应完成构建，并手动验证受影响的页面、AI 交互或导入导出流程；仅通过构建不能证明外部模型服务和浏览器交互可用。搜索服务的测试在其独立分支维护。

## 常见问题

| 问题 | 排查方式 |
| --- | --- |
| 未配置 API Key 能否使用？ | 可以手动使用学科、导图、笔记、看板和题库；AI 功能需要模型服务配置 |
| 模型列表获取失败或 AI 无响应 | 检查当前供应商、基础地址、Key、模型名称、网络与跨域许可；列表接口不可用时可手动添加模型 |
| AI 能聊天但不能编辑学习内容 | 确认模型支持并正确返回工具调用；检查对话中的工具结果和错误提示 |
| Local 检测失败 | 确认搜索服务窗口仍在运行、Docker / SearXNG 就绪，并检查 API 地址、Origin 白名单及浏览器本地网络权限 |
| 更换域名、端口或浏览器后数据为空 | 本地数据按来源隔离；回到原地址导出，再到新地址导入 |
| 开发端口被占用 | 停止占用该端口的进程，或通过 `STUDYSTUDIO_DEV_PORT` 指定其他端口；新端口使用独立的浏览器存储 |

## 参与贡献

欢迎通过 [Issues](https://github.com/yimeng-YM/StudyStudio/issues) 报告问题、讨论功能，或通过 [Pull Requests](https://github.com/yimeng-YM/StudyStudio/pulls) 改进代码和文档。

1. Fork 仓库并从对应分支创建功能分支；Web 前端改动以 `master` 为基线。
2. 保持改动聚焦，涉及数据结构时同步考虑数据库迁移和备份兼容性。
3. 执行 `npm run build`，验证受影响的功能，并补充相应文档。
4. 在 PR 中说明问题、变更后的行为和验证结果。涉及界面的改动请附截图；涉及 AI 的问题请提供去除密钥与私人内容后的服务配置和错误信息。

提交贡献时，请确保你有权按本项目的 MIT 协议提供相关代码或文档。引入第三方代码、资源或依赖时，应保留其原始版权和许可信息。

## 开源协议

StudyStudio 采用 **[MIT License](LICENSE)**，版权归属为 `Copyright (c) 2026 yimeng-YM`。

MIT 允许个人与商业使用、修改、复制、分发、再许可和销售，也允许将代码用于闭源项目。分发本软件的副本或实质性部分时，必须保留原始版权声明和许可声明；软件按原样提供，不附带担保。完整条款以仓库中的 [LICENSE](LICENSE) 为准，标准文本可参阅 [Open Source Initiative](https://opensource.org/license/mit)。

该协议适用于随此许可发布的 StudyStudio 原创代码与文档。第三方依赖及其附带资源保留各自的版权和协议，分发时仍须遵守相应条款。独立分支或组件的许可范围以其随附的许可文件为准。
