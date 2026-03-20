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
  ExternalLink
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

export const Docs = () => {
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
                    在空白的思维导图或笔记中，使用“AI 生成”功能，快速勾勒知识雏形，告别从零开始的焦虑。
                  </p>
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
              <p>思维导图是知识可视化的核心。我们提供了基于节点流的操作体验。</p>
              <div className="space-y-4">
                <h4 className="font-bold flex items-center gap-2"><MousePointer2 className="w-4 h-4 text-primary" /> 节点交互</h4>
                <ul className="list-disc list-inside ml-4 text-slate-600 dark:text-slate-400 space-y-1">
                  <li><strong>双击</strong>：编辑节点内容。</li>
                  <li><strong>鼠标悬停</strong>：唤起快捷菜单（添加子节点、删除、新建以节点名称命名的笔记或任务卡）。</li>
                  <li><strong>拖拽连线</strong>：点击节点边缘的小圆点并拖拽至另一节点，建立逻辑关联。</li>
                </ul>
                <h4 className="font-bold flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> AI 赋能</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 pl-6">
                  点击AI悬浮窗，描述您想学习的主题。系统会自动调用 Agent 构建层级清晰的导图，极大节省手动录入时间。
                </p>
                <h4 className="font-bold flex items-center gap-2"><Layout className="w-4 h-4 text-primary" /> 智能布局</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 pl-6">
                  当节点变得杂乱时，点击顶部栏的自动布局按钮，系统将采用 Dagre 算法为您重新排列节点，使其层级分明。
                </p>
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
              <p>不仅仅是 Markdown，更是一个集成了数学公式与 AI 的协作空间。</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h4 className="font-bold">全能 Markdown</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">支持 GFM 标准，包括实时渲染的表格、任务列表和代码高亮。特别优化的 KaTeX 支持，让复杂的数学公式输入如履平地。</p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-bold">AI 沉浸式创作</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">打开AI悬浮窗，与AI助手进行交互，实现沉浸式创作体验。</p>
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
            <div className="space-y-4">
              <p>采用看板管理法，将学习任务转化为可见的进度条。</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-slate-200 dark:bg-zinc-800 rounded-full text-xs">看板拖拽</span>
                <span className="px-3 py-1 bg-slate-200 dark:bg-zinc-800 rounded-full text-xs">子任务拆解</span>
              </div>
              <div className="p-4 border border-slate-200 dark:border-zinc-800 rounded-xl bg-slate-50 dark:bg-zinc-900/50">
                <p className="text-sm italic text-slate-500">“将大目标拆解为细小的子任务，是克服拖延症最有效的方法。”</p>
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
              <p>验证学习成果的最佳途径。题库系统支持手动录入与 AI 智能生成。</p>
              <div className="space-y-4">
                <div className="flex gap-4 items-start">
                  <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-lg shrink-0"><Cpu className="w-5 h-5" /></div>
                  <div>
                    <h4 className="font-bold mb-1">AI 知识点出题</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">AI 会根据您当前学科下的笔记和思维导图，自动提取核心知识点并生成针对性的选择题或简答题，真正实现“因材施考”。</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="p-2 bg-rose-500/10 text-rose-500 rounded-lg shrink-0"><Layout className="w-5 h-5" /></div>
                  <div>
                    <h4 className="font-bold mb-1">多维题型支持</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400">涵盖单选、多选、判断、填空及大题。所有题目均支持 Markdown 解析，公式、图片展示无压力。</p>
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
          title: 'AI Agent 助手',
          icon: <Sparkles className="w-4 h-4" />,
          content: (
            <div className="space-y-4">
              <p>页面中的蓝色圆形悬浮窗口不仅仅是聊天框，它是一个拥有<strong>权限</strong>的助手。</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">通过 Agent 技术，您可以直接对它说：</p>
              <div className="bg-slate-100 dark:bg-zinc-900 p-4 rounded-xl font-mono text-xs space-y-2">
                <p className="text-primary">“帮我把数学笔记整理成思维导图”</p>
                <p className="text-primary">“帮我创建一个‘复习微积分’的任务”</p>
                <p className="text-primary">“整理一份XX学科的复习资料，包括思维导图和笔记，再给我出几道例题，最后帮我制定一份复习计划”</p>
              </div>
              <p className="text-sm italic">Agent 会自动识别意图并调用系统内部 API 执行操作。</p>
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

  const [activeSection, setActiveSection] = useState('intro');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

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
