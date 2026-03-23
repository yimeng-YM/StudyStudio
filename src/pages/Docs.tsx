import { useState, useRef } from 'react';
import {
Book,
Rocket,
Brain,
PenTool,
CheckSquare,
ListChecks,
Sparkles,
Database,
Layout,
Terminal,
ShieldCheck,
Zap,
Cpu,
MousePointer2,
ChevronRight,
ExternalLink,
Plus,
Settings,
Trash2,
Layers,
FileText,
Target,
Bot,
Workflow,
Play,
Lightbulb,
Move,
Square,
Grid3X3,
FileType,
HelpCircle,
ClipboardList,
CheckCircle2,
ArrowRight,
Puzzle,
GitBranch
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

interface DocCategory {
  id: string;
  title: string;
  sections: DocSection[];
}

/**
 * 使用文档页面组件
 * 采用侧边栏分类导航 + 右侧平滑滚动的内容布局。
 * 核心逻辑：
 * 1. 结构化管理文档内容（分类 -> 章节）。
 * 2. 基于 ID 的平滑滚动定位。
 * 3. 响应式布局与深色模式适配。
 */
export const Docs = () => {
  /**
   * 文档数据结构定义
   * 包含基础入门、核心功能、进阶功能三大模块
   */
  const categories: DocCategory[] = [
    {
      id: 'getting-started',
      title: '基础入门',
      sections: [
        {
          id: 'intro',
          title: '项目简介',
          icon: <Book className="w-4 h-4" />,
          content: (
            <div className="space-y-6">
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                StudyStudio 是一款融合了前沿 AI 技术的全方位学习管理系统。它致力于将<strong>知识组织、任务规划、笔记记录与智能练习</strong>有机结合，为每一位追求效率的学习者提供一站式的“数字化第二大脑”。
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl">
                  <h4 className="font-bold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                    <Zap className="w-4 h-4" /> 效率为先
                  </h4>
                  <p className="text-sm text-blue-700/80 dark:text-blue-400/80">利用 AI 自动化处理繁琐的整理工作，让你专注于深度思考。</p>
                </div>
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl">
                  <h4 className="font-bold text-emerald-800 dark:text-emerald-300 mb-2 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" /> 隐私第一
                  </h4>
                  <p className="text-sm text-emerald-700/80 dark:text-emerald-400/80">所有数据均存储在本地浏览器，无需注册，不上传您的私密笔记。</p>
                </div>
              </div>
            </div>
          )
        },
        {
          id: 'quick-start',
          title: '快速上手',
          icon: <Rocket className="w-4 h-4" />,
          content: (
            <div className="space-y-6">
              <div className="relative pl-8 border-l-2 border-slate-200 dark:border-zinc-800 space-y-8">
                <div className="relative">
                  <div className="absolute -left-[41px] top-0 w-5 h-5 bg-primary rounded-full border-4 border-white dark:border-zinc-950" />
                  <h3 className="text-lg font-bold mb-2">配置 AI 能力</h3>
                  <p className="text-slate-600 dark:text-slate-400">
                    进入<strong>设置</strong>页面，在 AI 配置项中填入您的 Base URL、API Key 和 模型名称。推荐使用支持视觉能力的模型，例如 Gemini、Claude、GPT、Grok等系列模型。
                  </p>
                </div>
                <div className="relative">
                  <div className="absolute -left-[41px] top-0 w-5 h-5 bg-primary rounded-full border-4 border-white dark:border-zinc-950" />
                  <h3 className="text-lg font-bold mb-2">创建学科空间</h3>
                  <p className="text-slate-600 dark:text-slate-400">
                    在侧边栏点击“添加学科”，为您的学习目标建立独立的空间。每个学科都有其专属的思维导图、笔记和题库。
                  </p>
                </div>
                <div className="relative">
                  <div className="absolute -left-[41px] top-0 w-5 h-5 bg-primary rounded-full border-4 border-white dark:border-zinc-950" />
                  <h3 className="text-lg font-bold mb-2">利用 AI 启动</h3>
                  <p className="text-slate-600 dark:text-slate-400">
                    在任意界面中，使用“AI 生成”功能，快速勾勒知识雏形，告别从零开始的焦虑。
                  </p>
                </div>
              </div>
            </div>
          )
        },
        {
          id: 'subject-mgmt',
          title: '学科管理',
          icon: <Settings className="w-4 h-4" />,
          content: (
            <div className="space-y-6">
              <p>学科是 StudyStudio 的核心组织单位。您可以根据需要灵活管理学科空间。</p>
              <div className="space-y-4">
                <div className="flex gap-4 items-start">
                  <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg shrink-0"><Plus className="w-5 h-5" /></div>
                  <div>
                    <h4 className="font-bold mb-1">创建学科</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">在侧边栏点击“添加学科”按钮，输入名称并选择一个代表性的图标即可创建。</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg shrink-0"><PenTool className="w-5 h-5" /></div>
                  <div>
                    <h4 className="font-bold mb-1">修改名称与图标</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">进入对应学科页面后，点击顶部导航栏左侧的<strong>学科名称或图标</strong>，即可唤起编辑弹窗，修改后保存即可。</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="p-2 bg-rose-500/10 text-rose-500 rounded-lg shrink-0"><Trash2 className="w-5 h-5" /></div>
                  <div>
                    <h4 className="font-bold mb-1">删除学科</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">在上述编辑弹窗的左下角，点击“删除学科”按钮。系统会要求您进行确认，以防止误操作。</p>
                  </div>
                </div>
              </div>
            </div>
          )
        },
        {
          id: 'ai-setup',
          title: 'AI 配置指南',
          icon: <Terminal className="w-4 h-4" />,
          content: (
            <div className="space-y-4">
              <p>StudyStudio 采用灵活的 OpenAI 兼容接口架构，您可以连接到任何主流 AI 提供商。</p>
              <div className="bg-slate-100 dark:bg-zinc-900 p-6 rounded-2xl space-y-4">
                <div className="flex justify-between items-center border-b border-slate-200 dark:border-zinc-800 pb-2">
                  <span className="font-medium">推荐配置</span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">仅供参考</span>
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between"><span className="text-slate-500">模型选择:</span> <span className="font-mono">gemini-3.1-pro-preview</span></li>
                  <li className="flex justify-between"><span className="text-slate-500">请求地址:</span> <span className="font-mono text-xs">https://api.kourichat.com/v1</span></li>
                  <li className="flex justify-between"><span className="text-slate-500">API Key:</span> <span className="text-emerald-500 font-medium">必须填写</span></li>
                </ul>
              </div>
              <div className="p-5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 rounded-2xl flex gap-4 shadow-sm items-start group">
                <div className="p-2 bg-emerald-500 rounded-xl text-white shadow-lg shadow-emerald-500/20 shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-emerald-900 dark:text-emerald-100 leading-relaxed">
                    <strong>推荐：</strong> 推荐您注册使用 KouriAI，他们的服务稳定且价格优惠，与诸多 AI 提供商官方合作，数据隐私安全可靠。可以在国内网络环境下使用 OpenAI、Gemini、Claude 等模型。
                  </p>
                  <a
                    href="https://api.kourichat.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-all hover:shadow-lg hover:shadow-emerald-500/30 group-hover:-translate-y-0.5"
                  >
                    访问 KouriAI 官网 <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          )
        }
      ]
    },
    {
      id: 'core-features',
      title: '核心功能',
      sections: [
        {
          id: 'mindmap',
          title: '思维导图 (MindMap)',
          icon: <Brain className="w-4 h-4" />,
          content: (
            <div className="space-y-6">
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                思维导图是 StudyStudio 知识管理的核心模块，采用基于 <strong>React Flow</strong> 的节点流操作体验，支持无限画布、自由拖拽、多层级节点结构，让您的知识体系一目了然。
              </p>
              
              {/* 功能概览卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <MousePointer2 className="w-5 h-5 text-blue-500" />
                    <h4 className="font-bold text-blue-800 dark:text-blue-300">节点操作</h4>
                  </div>
                  <p className="text-sm text-blue-700/80 dark:text-blue-400/80">双击编辑、悬停菜单、拖拽连线</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-100 dark:border-purple-800 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    <h4 className="font-bold text-purple-800 dark:text-purple-300">AI 生成</h4>
                  </div>
                  <p className="text-sm text-purple-700/80 dark:text-purple-400/80">智能构建多层级知识导图</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Layout className="w-5 h-5 text-emerald-500" />
                    <h4 className="font-bold text-emerald-800 dark:text-emerald-300">智能排版</h4>
                  </div>
                  <p className="text-sm text-emerald-700/80 dark:text-emerald-400/80">一键自动整理布局</p>
                </div>
              </div>

              {/* 详细操作指南 */}
              <div className="space-y-6">
                <div className="p-5 bg-slate-50 dark:bg-zinc-900/50 rounded-2xl border border-slate-200 dark:border-zinc-800">
                  <h4 className="font-bold flex items-center gap-2 mb-4 text-lg">
                    <MousePointer2 className="w-5 h-5 text-primary" />
                    节点交互详解
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-800/50 rounded-xl">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg shrink-0">
                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400">双击</span>
                      </div>
                      <div>
                        <p className="font-medium">编辑节点内容</p>
                        <p className="text-sm text-slate-500">双击任意节点即可进入编辑模式，支持纯文本输入</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-800/50 rounded-xl">
                      <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg shrink-0">
                        <span className="text-sm font-bold text-purple-600 dark:text-purple-400">悬停</span>
                      </div>
                      <div>
                        <p className="font-medium">快捷操作菜单</p>
                        <p className="text-sm text-slate-500">鼠标悬停在节点上，唤起快捷菜单：添加子节点、删除节点、新建关联笔记或任务卡</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-800/50 rounded-xl">
                      <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg shrink-0">
                        <Move className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="font-medium">拖拽模式</p>
                        <p className="text-sm text-slate-500">左下角切换至"移动"图标。滚轮负责<strong>缩放</strong>画布，左键按住背景可<strong>平移</strong>画布位置</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-800/50 rounded-xl">
                      <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg shrink-0">
                        <Square className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="font-medium">框选模式</p>
                        <p className="text-sm text-slate-500">左下角切换至"箭头"图标。滚轮负责<strong>平移</strong>，左键按住背景可<strong>框选</strong>多个节点进行批量操作</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-800/50 rounded-xl">
                      <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg shrink-0">
                        <Grid3X3 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      </div>
                      <div>
                        <p className="font-medium">批量操作</p>
                        <p className="text-sm text-slate-500">框选多个节点后，点击左下角框选图标唤起功能菜单，执行<strong>批量删除</strong>或<strong>局部整理</strong></p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-2xl border border-purple-200 dark:border-purple-800">
                  <h4 className="font-bold flex items-center gap-2 mb-4 text-lg">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    AI 智能生成
                  </h4>
                  <p className="text-slate-600 dark:text-slate-400 mb-4">
                    点击蓝色圆形的 <strong>AI 悬浮窗</strong>，描述您想学习的主题，例如：
                  </p>
                  <div className="bg-white/80 dark:bg-zinc-800/80 p-4 rounded-xl font-mono text-sm space-y-2 mb-4">
                    <p className="text-purple-600 dark:text-purple-400">"帮我生成一份《数据结构与算法》的知识导图"</p>
                    <p className="text-purple-600 dark:text-purple-400">"创建一个关于近代史的学习框架"</p>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    AI Agent 会自动调用系统工具，构建层级清晰、内容丰富的思维导图，包含定义、分类、示例、应用等多个维度，极大节省手动录入时间。
                  </p>
                </div>

                <div className="p-5 bg-slate-50 dark:bg-zinc-900/50 rounded-2xl border border-slate-200 dark:border-zinc-800">
                  <h4 className="font-bold flex items-center gap-2 mb-4 text-lg">
                    <Layout className="w-5 h-5 text-emerald-500" />
                    自动整理布局
                  </h4>
                  <p className="text-slate-600 dark:text-slate-400 mb-4">
                    点击顶部导航栏的"自动整理"下拉菜单，选择合适的布局方式：
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="p-3 bg-white dark:bg-zinc-800/50 rounded-xl text-center border border-slate-200 dark:border-zinc-700">
                      <ArrowRight className="w-5 h-5 mx-auto mb-2 text-primary" />
                      <span className="text-sm font-medium">向右</span>
                    </div>
                    <div className="p-3 bg-white dark:bg-zinc-800/50 rounded-xl text-center border border-slate-200 dark:border-zinc-700">
                      <ArrowRight className="w-5 h-5 mx-auto mb-2 text-primary rotate-180" />
                      <span className="text-sm font-medium">向左</span>
                    </div>
                    <div className="p-3 bg-white dark:bg-zinc-800/50 rounded-xl text-center border border-slate-200 dark:border-zinc-700">
                      <ArrowRight className="w-5 h-5 mx-auto mb-2 text-primary rotate-90" />
                      <span className="text-sm font-medium">向下</span>
                    </div>
                    <div className="p-3 bg-white dark:bg-zinc-800/50 rounded-xl text-center border border-slate-200 dark:border-zinc-700">
                      <ArrowRight className="w-5 h-5 mx-auto mb-2 text-primary -rotate-90" />
                      <span className="text-sm font-medium">向上</span>
                    </div>
                    <div className="p-3 bg-white dark:bg-zinc-800/50 rounded-xl text-center border border-slate-200 dark:border-zinc-700">
                      <GitBranch className="w-5 h-5 mx-auto mb-2 text-primary" />
                      <span className="text-sm font-medium">发散</span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 mt-4">
                    系统将自动排版节点并适配屏幕视角，让您的导图始终保持整洁美观。
                  </p>
                </div>
              </div>

              {/* 与其他模块联动 */}
              <div className="p-5 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-200 dark:border-blue-800">
                <h4 className="font-bold flex items-center gap-2 mb-3">
                  <Layers className="w-5 h-5 text-blue-500" />
                  与其他模块联动
                </h4>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                  <li className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-500" />
                    <span><strong>生成笔记</strong>：右键节点可快速创建关联的详细知识笔记</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span><strong>创建任务</strong>：将知识点转化为待办任务，规划学习进度</span>
                  </li>
                </ul>
              </div>
            </div>
          )
        },
        {
          id: 'notes',
          title: '详细知识 (Notes)',
          icon: <PenTool className="w-4 h-4" />,
          content: (
            <div className="space-y-6">
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                详细知识模块是一个功能强大的 <strong>Markdown 编辑器</strong>，支持 GFM 标准、KaTeX 数学公式、代码高亮，并深度集成 AI 协作能力，是您记录和整理深度知识的理想空间。
              </p>

              {/* 功能卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-100 dark:border-blue-800 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <FileType className="w-5 h-5 text-blue-500" />
                    <h4 className="font-bold text-blue-800 dark:text-blue-300">全能 Markdown</h4>
                  </div>
                  <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-500" />
                      支持 GFM 标准语法
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-500" />
                      实时渲染表格、任务列表
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-500" />
                      代码块语法高亮
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-500" />
                      图片粘贴与拖拽上传
                    </li>
                  </ul>
                </div>
                <div className="p-5 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-100 dark:border-purple-800 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    <h4 className="font-bold text-purple-800 dark:text-purple-300">AI 沉浸式创作</h4>
                  </div>
                  <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-purple-500" />
                      右侧悬浮 AI 助手
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-purple-500" />
                      对话式内容生成
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-purple-500" />
                      智能扩写与润色
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-purple-500" />
                      一键生成学习笔记
                    </li>
                  </ul>
                </div>
              </div>

              {/* 数学公式支持 */}
              <div className="p-5 bg-slate-50 dark:bg-zinc-900/50 rounded-2xl border border-slate-200 dark:border-zinc-800">
                <h4 className="font-bold flex items-center gap-2 mb-4 text-lg">
                  <Cpu className="w-5 h-5 text-amber-500" />
                  KaTeX 数学公式支持
                </h4>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  特别优化的 KaTeX 支持，让复杂的数学公式输入如履平地。支持行内公式和块级公式：
                </p>
                <div className="bg-white dark:bg-zinc-800/50 p-4 rounded-xl space-y-3">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-mono text-slate-500 w-32">行内公式：</span>
                    <code className="bg-slate-100 dark:bg-zinc-700 px-2 py-1 rounded text-sm">$E = mc^2$</code>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-mono text-slate-500 w-32">块级公式：</span>
                    <code className="bg-slate-100 dark:bg-zinc-700 px-2 py-1 rounded text-sm">$$...$$</code>
                  </div>
                </div>
                <p className="text-sm text-slate-500 mt-3">
                  支持积分、矩阵、分数、希腊字母等所有常用数学符号，适合理工科学习者记录公式推导过程。
                </p>
              </div>

              {/* 推荐结构 */}
              <div className="p-5 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                <h4 className="font-bold flex items-center gap-2 mb-3">
                  <Lightbulb className="w-5 h-5 text-emerald-500" />
                  推荐笔记结构
                </h4>
                <p className="text-slate-600 dark:text-slate-400 mb-3">
                  AI 生成的笔记通常遵循以下结构，您也可以参考这个框架手动编写：
                </p>
                <div className="bg-white/80 dark:bg-zinc-800/80 p-4 rounded-xl text-sm space-y-2">
                  <p className="font-medium text-emerald-700 dark:text-emerald-400"># 主题概述 / Introduction</p>
                  <p className="pl-4 text-slate-600 dark:text-slate-400">核心概念解释与背景介绍</p>
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">## 核心概念 / Core Concepts</p>
                  <p className="pl-4 text-slate-600 dark:text-slate-400">关键术语、定义和原理</p>
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">## 详细内容 / Detailed Content</p>
                  <p className="pl-4 text-slate-600 dark:text-slate-400">分章节深入讲解</p>
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">## 重难点分析 / Key Points</p>
                  <p className="pl-4 text-slate-600 dark:text-slate-400">易错点、难点解析</p>
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">## 应用案例 / Applications</p>
                  <p className="pl-4 text-slate-600 dark:text-slate-400">实际应用场景与案例</p>
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">## 总结 / Summary</p>
                  <p className="pl-4 text-slate-600 dark:text-slate-400">要点回顾与延伸思考</p>
                </div>
              </div>
            </div>
          )
        },
        {
          id: 'tasks',
          title: '任务列表 (Tasks)',
          icon: <CheckSquare className="w-4 h-4" />,
          content: (
            <div className="space-y-6">
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                任务列表模块采用<strong>看板管理法</strong>，将学习任务转化为可视化的进度条。支持多任务块管理、子任务拆解、进度追踪，帮助您高效规划和执行学习计划。
              </p>

              {/* 功能概览 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-100 dark:border-amber-800 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardList className="w-5 h-5 text-amber-500" />
                    <h4 className="font-bold text-amber-800 dark:text-amber-300">看板管理</h4>
                  </div>
                  <p className="text-sm text-amber-700/80 dark:text-amber-400/80">可视化任务块，一目了然</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className="w-5 h-5 text-blue-500" />
                    <h4 className="font-bold text-blue-800 dark:text-blue-300">子任务拆解</h4>
                  </div>
                  <p className="text-sm text-blue-700/80 dark:text-blue-400/80">大任务层层分解</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-5 h-5 text-emerald-500" />
                    <h4 className="font-bold text-emerald-800 dark:text-emerald-300">进度追踪</h4>
                  </div>
                  <p className="text-sm text-emerald-700/80 dark:text-emerald-400/80">勾选完成，实时统计</p>
                </div>
              </div>

              {/* 详细操作指南 */}
              <div className="p-5 bg-slate-50 dark:bg-zinc-900/50 rounded-2xl border border-slate-200 dark:border-zinc-800">
                <h4 className="font-bold flex items-center gap-2 mb-4 text-lg">
                  <MousePointer2 className="w-5 h-5 text-primary" />
                  看板操作详解
                </h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-800/50 rounded-xl">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg shrink-0">
                      <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium">添加任务块</p>
                      <p className="text-sm text-slate-500">点击顶部"添加任务块"创建新的分类，例如"第一阶段：基础学习"、"第二阶段：进阶练习"等</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-800/50 rounded-xl">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg shrink-0">
                      <Move className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="font-medium">模式切换</p>
                      <p className="text-sm text-slate-500">同思维导图，支持<strong>拖拽模式</strong>（滚轮缩放）与<strong>框选模式</strong>（滚轮平移），灵活操作画布</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-800/50 rounded-xl">
                    <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg shrink-0">
                      <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    </div>
                    <div>
                      <p className="font-medium">批量删除</p>
                      <p className="text-sm text-slate-500">框选模式下选中多个任务块后，通过左下角菜单一键删除</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-800/50 rounded-xl">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg shrink-0">
                      <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-medium">子任务拆解</p>
                      <p className="text-sm text-slate-500">点击任务项右侧的图标可为该项创建独立的<strong>子任务看板</strong>，实现层级化管理。支持无限层级嵌套</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI 生成任务 */}
              <div className="p-5 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-2xl border border-purple-200 dark:border-purple-800">
                <h4 className="font-bold flex items-center gap-2 mb-3">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  AI 智能规划
                </h4>
                <p className="text-slate-600 dark:text-slate-400 mb-3">
                  告诉 AI 您的学习目标，它会自动生成结构化的任务计划：
                </p>
                <div className="bg-white/80 dark:bg-zinc-800/80 p-4 rounded-xl font-mono text-sm space-y-2 mb-3">
                  <p className="text-purple-600 dark:text-purple-400">"帮我制定一个30天攻克高数的学习计划"</p>
                  <p className="text-purple-600 dark:text-purple-400">"创建一个考研英语复习任务清单"</p>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  AI 会将大目标拆解为多个阶段（任务块），每个阶段包含具体的任务项，帮您清晰地规划学习路径。
                </p>
              </div>

              <div className="p-4 border border-slate-200 dark:border-zinc-800 rounded-xl bg-gradient-to-r from-slate-50 to-zinc-50 dark:from-zinc-900 dark:to-zinc-900/50">
                <p className="text-sm italic text-slate-500 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  "将大目标拆解为细小的子任务，是克服拖延症最有效的方法。"
                </p>
              </div>
            </div>
          )
        },
        {
          id: 'quiz',
          title: '题库 (Quiz)',
          icon: <ListChecks className="w-4 h-4" />,
          content: (
            <div className="space-y-6">
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                题库是验证学习成果的最佳途径。StudyStudio 的题库系统支持<strong>五种题型</strong>，可手动录入或通过 AI 智能生成，所有题目均支持 Markdown 格式，完美呈现公式和图片。
              </p>

              {/* 支持的题型 */}
              <div className="p-5 bg-slate-50 dark:bg-zinc-900/50 rounded-2xl border border-slate-200 dark:border-zinc-800">
                <h4 className="font-bold flex items-center gap-2 mb-4 text-lg">
                  <HelpCircle className="w-5 h-5 text-primary" />
                  多维题型支持
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-800/50 rounded-xl">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg shrink-0">
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400">单选</span>
                    </div>
                    <div>
                      <p className="font-medium">单选题 (Single Choice)</p>
                      <p className="text-sm text-slate-500">4-5 个选项，选择唯一正确答案</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-800/50 rounded-xl">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg shrink-0">
                      <span className="text-xs font-bold text-purple-600 dark:text-purple-400">多选</span>
                    </div>
                    <div>
                      <p className="font-medium">多选题 (Multiple Choice)</p>
                      <p className="text-sm text-slate-500">4-5 个选项，可选择多个正确答案</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-800/50 rounded-xl">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg shrink-0">
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">判断</span>
                    </div>
                    <div>
                      <p className="font-medium">判断题 (True/False)</p>
                      <p className="text-sm text-slate-500">判断陈述是否正确</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-800/50 rounded-xl">
                    <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg shrink-0">
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400">填空</span>
                    </div>
                    <div>
                      <p className="font-medium">填空题 (Fill in Blank)</p>
                      <p className="text-sm text-slate-500">根据上下文填写正确内容</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-800/50 rounded-xl md:col-span-2">
                    <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg shrink-0">
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400">大题</span>
                    </div>
                    <div>
                      <p className="font-medium">简答/大题 (Short Answer / Essay)</p>
                      <p className="text-sm text-slate-500">开放性问答，需要详细解答</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI 智能出题 */}
              <div className="p-5 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-2xl border border-indigo-200 dark:border-indigo-800">
                <h4 className="font-bold flex items-center gap-2 mb-3">
                  <Cpu className="w-5 h-5 text-indigo-500" />
                  AI 知识点出题
                </h4>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  AI 会根据您当前学科下的<strong>笔记和思维导图</strong>，自动提取核心知识点并生成针对性的练习题，真正实现"因材施考"。
                </p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-white/80 dark:bg-zinc-800/80 rounded-xl">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg shrink-0">
                      <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <p className="font-medium">基于笔记生成</p>
                      <p className="text-sm text-slate-500">AI 分析笔记内容，提取关键概念和知识点进行出题</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-white/80 dark:bg-zinc-800/80 rounded-xl">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg shrink-0">
                      <Brain className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="font-medium">基于导图生成</p>
                      <p className="text-sm text-slate-500">解析思维导图的节点结构，覆盖所有分支进行出题</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 答案解析 */}
              <div className="p-5 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                <h4 className="font-bold flex items-center gap-2 mb-3">
                  <Lightbulb className="w-5 h-5 text-emerald-500" />
                  详细答案解析
                </h4>
                <p className="text-slate-600 dark:text-slate-400">
                  每道题目都配有<strong>详细解析</strong>，帮助您理解答题思路。AI 生成的题目会自动包含解析内容，手动录入时也可添加。
                </p>
              </div>

              {/* 题型分布建议 */}
              <div className="p-5 bg-slate-50 dark:bg-zinc-900/50 rounded-2xl border border-slate-200 dark:border-zinc-800">
                <h4 className="font-bold flex items-center gap-2 mb-3">
                  <Target className="w-5 h-5 text-primary" />
                  AI 生成题型分布
                </h4>
                <p className="text-slate-600 dark:text-slate-400 mb-3">
                  AI 生成题库时会遵循以下比例，确保题型多样化：
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm w-20">单选题</span>
                    <div className="flex-1 bg-slate-200 dark:bg-zinc-700 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{width: '40%'}}></div>
                    </div>
                    <span className="text-sm text-slate-500">40%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm w-20">多选题</span>
                    <div className="flex-1 bg-slate-200 dark:bg-zinc-700 rounded-full h-2">
                      <div className="bg-purple-500 h-2 rounded-full" style={{width: '20%'}}></div>
                    </div>
                    <span className="text-sm text-slate-500">20%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm w-20">判断题</span>
                    <div className="flex-1 bg-slate-200 dark:bg-zinc-700 rounded-full h-2">
                      <div className="bg-emerald-500 h-2 rounded-full" style={{width: '15%'}}></div>
                    </div>
                    <span className="text-sm text-slate-500">15%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm w-20">填空题</span>
                    <div className="flex-1 bg-slate-200 dark:bg-zinc-700 rounded-full h-2">
                      <div className="bg-amber-500 h-2 rounded-full" style={{width: '15%'}}></div>
                    </div>
                    <span className="text-sm text-slate-500">15%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm w-20">简答题</span>
                    <div className="flex-1 bg-slate-200 dark:bg-zinc-700 rounded-full h-2">
                      <div className="bg-rose-500 h-2 rounded-full" style={{width: '10%'}}></div>
                    </div>
                    <span className="text-sm text-slate-500">10%</span>
                  </div>
                </div>
              </div>
            </div>
          )
        }
      ]
    },
    {
      id: 'advanced',
      title: '进阶功能',
      sections: [
        {
          id: 'ai-agent',
          title: 'AI Agent 智能体',
          icon: <Bot className="w-4 h-4" />,
          content: (
            <div className="space-y-6">
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                StudyStudio 的核心竞争力在于内置的 <strong>AI Agent (智能体)</strong> 系统。页面右侧的蓝色圆形悬浮窗不仅是一个聊天框，更是一个拥有系统<strong>操作权限</strong>的数字助手。
              </p>

              {/* 核心能力 */}
              <div className="p-5 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800">
                <h4 className="font-bold flex items-center gap-2 mb-4 text-lg">
                  <Workflow className="w-5 h-5 text-indigo-500" />
                  Agent 核心能力
                </h4>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  不同于普通的问答大模型，我们的 Agent 被赋予了一套完整的<strong>工具系统 (Tool Calling)</strong>。它可以直接读取您的学习数据，并代表您创建或修改内容。
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-start gap-3 p-3 bg-white/80 dark:bg-zinc-800/80 rounded-xl">
                    <Database className="w-4 h-4 text-indigo-500 mt-1 shrink-0" />
                    <div>
                      <p className="font-medium text-sm">上下文感知</p>
                      <p className="text-xs text-slate-500">自动识别您当前所在的页面、学科和实体，无需重复提供背景信息。</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-white/80 dark:bg-zinc-800/80 rounded-xl">
                    <PenTool className="w-4 h-4 text-indigo-500 mt-1 shrink-0" />
                    <div>
                      <p className="font-medium text-sm">全栈操作权限</p>
                      <p className="text-xs text-slate-500">可自主创建学科、生成导图、编写笔记、出题和规划任务。</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 两种运行模式 */}
              <div className="space-y-4">
                <h3 className="text-xl font-bold border-b border-slate-200 dark:border-zinc-800 pb-2">两种运行模式</h3>
                <p className="text-slate-600 dark:text-slate-400">
                  为了应对不同复杂度的任务，AI Agent 设计了两种协同模式：<strong>直接执行模式 (ACT)</strong> 和 <strong>计划确认模式 (PLAN)</strong>。
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                  {/* ACT 模式 */}
                  <div className="p-5 bg-slate-50 dark:bg-zinc-900/50 rounded-2xl border border-slate-200 dark:border-zinc-800 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Play className="w-5 h-5 text-emerald-500" />
                        <h4 className="font-bold text-lg">ACT 模式</h4>
                      </div>
                      <span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded">直接执行</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 flex-1">
                      适用于目标明确、指令清晰的单一任务。Agent 在理解指令后会<strong>立即调用工具执行</strong>，无需等待确认。
                    </p>
                    <div className="bg-white dark:bg-zinc-800/80 p-3 rounded-xl">
                      <p className="text-xs font-bold text-slate-500 mb-2">典型指令示例：</p>
                      <ul className="space-y-2 text-sm list-disc list-inside">
                        <li>"帮我建一个名为『微积分基础』的学科"</li>
                        <li>"把这篇笔记转成思维导图"</li>
                        <li>"在这个导图下加几个关于导数的节点"</li>
                      </ul>
                    </div>
                  </div>

                  {/* PLAN 模式 */}
                  <div className="p-5 bg-slate-50 dark:bg-zinc-900/50 rounded-2xl border border-slate-200 dark:border-zinc-800 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Puzzle className="w-5 h-5 text-purple-500" />
                        <h4 className="font-bold text-lg">PLAN 模式</h4>
                      </div>
                      <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-bold rounded">计划与确认</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 flex-1">
                      适用于复杂的宏大目标构建。Agent 会先进行<strong>深度需求分析和目标拆解</strong>，向您展示详细的执行计划，<strong>等待您确认后</strong>才会开始实质性的创建工作。
                    </p>
                    <div className="bg-white dark:bg-zinc-800/80 p-3 rounded-xl">
                      <p className="text-xs font-bold text-slate-500 mb-2">典型指令示例：</p>
                      <ul className="space-y-2 text-sm list-disc list-inside">
                        <li>"我下个月要考研政治，帮我准备全套复习资料"</li>
                        <li>"从零开始帮我构建一份 Python 学习体系，包含导图、笔记和测试题"</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* 最佳实践 */}
              <div className="p-5 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800">
                <h4 className="font-bold flex items-center gap-2 mb-3">
                  <Lightbulb className="w-5 h-5 text-amber-500" />
                  使用建议
                </h4>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400 list-disc list-inside">
                  <li><strong>明确意图</strong>：尽量用清晰的动词（如"创建"、"整理"、"生成"、"修改"）。</li>
                  <li><strong>提供材料</strong>：您可以直接粘贴大段文本给 AI，让它帮您整理成结构化的导图或笔记。</li>
                  <li><strong>善用上下文</strong>：当您打开某篇笔记时，直接对 AI 说"帮我出几道题"，它会自动读取当前笔记内容进行出题。</li>
                </ul>
              </div>
            </div>
          )
        },
        {
          id: 'data-management',
          title: '数据与安全',
          icon: <Database className="w-4 h-4" />,
          content: (
            <div className="space-y-4">
              <p>我们坚信数据主权属于用户。StudyStudio 使用 IndexedDB 将数据物理存储在您的设备上。</p>
              <div className="flex flex-col gap-3">
                <div className="p-4 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl">
                  <h4 className="font-bold text-sm mb-1">定期备份</h4>
                  <p className="text-xs text-slate-500">在“设置”页面点击“导出数据”，即可下载完整的 JSON 备份文件。</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl">
                  <h4 className="font-bold text-sm mb-1">跨设备同步</h4>
                  <p className="text-xs text-slate-500">目前由于隐私策略，暂不支持云端同步。您可以通过在另一台设备导入 JSON 备份文件来实现数据迁移。</p>
                </div>
              </div>
            </div>
          )
        }
      ]
    }
  ];

  /** 当前处于激活状态（可见）的章节 ID，用于侧边栏高亮 */
  const [activeSection, setActiveSection] = useState('intro');
  /** 内容滚动容器的引用，用于手动控制滚动逻辑 */
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  /**
   * 滚动至指定章节
   * 逻辑：
   * 1. 更新 activeSection 状态同步侧边栏。
   * 2. 通过 DOM ID 查找目标元素。
   * 3. 使用原生 scrollIntoView 实现平滑滚动效果。
   * @param {string} id - 章节 ID
   */
  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  /**
   * 回到页面顶部
   * 直接操作滚动容器的 scrollTop
   */
  const scrollToTop = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="flex h-full bg-white dark:bg-zinc-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* 侧边栏导航 */}
      <div className="w-72 border-r border-slate-200 dark:border-zinc-900 flex flex-col bg-slate-50/50 dark:bg-zinc-900/20">
        <div className="p-6 border-b border-slate-200 dark:border-zinc-900">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary border border-primary/20">
              <Book className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">使用文档</h1>
          </div>
          <p className="text-xs text-slate-500">最后更新: 2026年3月</p>
        </div>
        
        <nav className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-none">
          {categories.map(category => (
            <div key={category.id} className="space-y-1">
              <h3 className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                {category.title}
              </h3>
              {category.sections.map(section => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 group",
                    activeSection === section.id 
                      ? "bg-primary/10 text-primary font-semibold" 
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-zinc-800/50"
                  )}
                >
                  <span className={cn(
                    "transition-colors",
                    activeSection === section.id ? "text-primary" : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200"
                  )}>
                    {section.icon}
                  </span>
                  {section.title}
                  {activeSection === section.id && <ChevronRight className="w-3 h-3 ml-auto" />}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </div>

      {/* 内容主区域 */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto scroll-smooth bg-white dark:bg-zinc-950">
        <div className="max-w-4xl mx-auto p-8 lg:p-16 space-y-24 pb-32">
          {categories.map(category => (
            <div key={category.id} className="space-y-16">
              {category.sections.map(section => (
                <section 
                  key={section.id} 
                  id={section.id} 
                  className="scroll-mt-16 animate-in fade-in slide-in-from-bottom-4 duration-700"
                >
                  <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-primary/5 rounded-2xl text-primary border border-primary/10">
                      {section.icon}
                    </div>
                    <div>
                      <h2 className="text-3xl font-extrabold tracking-tight mb-1">{section.title}</h2>
                      <div className="h-1.5 w-12 bg-primary/20 rounded-full" />
                    </div>
                  </div>
                  <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-p:leading-relaxed prose-a:text-primary">
                    {section.content}
                  </div>
                </section>
              ))}
            </div>
          ))}
          
          <div className="pt-16 border-t border-slate-100 dark:border-zinc-900 flex justify-between items-center text-slate-400 text-sm">
            <p>© 2026 StudyStudio. 致力于更好的学习体验。</p>
            <div className="flex gap-4">
              <button onClick={scrollToTop} className="hover:text-primary transition-colors">回到顶部</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Docs;
