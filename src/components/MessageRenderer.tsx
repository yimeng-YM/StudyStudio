import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, prism } from 'react-syntax-highlighter/dist/esm/styles/prism';

import 'katex/dist/katex.min.css';
import { MessageContentPart } from '@/services/ai';
import { FileText, FileSpreadsheet, FileCode, ChevronDown, ChevronRight } from 'lucide-react';
import { db } from '@/db';
import mermaid from 'mermaid';
import { useTheme } from '@/hooks/useTheme';

function useIsDark() {
  const { theme } = useTheme();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDark = () => {
      if (theme === 'dark') return true;
      if (theme === 'light') return false;
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    };

    setIsDark(checkDark());

    if (theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => setIsDark(e.matches);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, [theme]);

  return isDark;
}

// Initialize mermaid with default (will be updated)
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
});

interface MessageRendererProps {
  content: string | MessageContentPart[];
}

export function MessageRenderer({ content }: MessageRendererProps) {
  if (Array.isArray(content)) {
    return (
      <div className="space-y-2">
        {content.map((part, i) => {
          if (part.type === 'text') {
            return <MarkdownText key={i} content={part.text} />;
          } else if (part.type === 'image_url') {
            return (
              <img
                key={i}
                src={part.image_url.url}
                alt="Uploaded"
                className="max-w-full h-auto rounded-lg border border-slate-200 dark:border-slate-700"
              />
            );
          }
          return null;
        })}
      </div>
    );
  }

  return <MarkdownText content={content} />;
}

function extractMetadata(text: string): [any | null, string] {
  const regex = /<<<FILE_METADATA=(.*?)>>>\n?/;
  const match = text.match(regex);
  if (match) {
    try {
      return [JSON.parse(match[1]), text.replace(match[0], '')];
    } catch (e) {
      return [null, text];
    }
  }
  return [null, text];
}

// Async Image Component for loading from Dexie
function AsyncImage(props: any) {
  const { src, alt, className } = props;
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    if (src?.startsWith('attachment:')) {
      const id = src.split(':')[1];
      setLoading(true);
      db.attachments.get(id)
        .then(attachment => {
          if (mounted && attachment) {
            setImageSrc(attachment.data);
          } else if (mounted) {
            console.warn(`Attachment ${id} not found`);
            setImageSrc(null);
          }
        })
        .catch(err => {
          console.error("Failed to load attachment", err);
          if (mounted) setImageSrc(null);
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    } else {
      setImageSrc(src);
      setLoading(false);
    }

    return () => {
      mounted = false;
    };
  }, [src]);

  if (loading) return <span className="text-slate-400 text-xs animate-pulse">[加载图片...]</span>;
  if (!imageSrc) return (
    <span className="text-red-400 text-xs" title={src}>
      [图片加载失败: {src?.split(':')[1]}]
    </span>
  );

  return <img src={imageSrc} alt={alt} className={className} />;
}

function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isDark = useIsDark();

  useEffect(() => {
    let mounted = true;

    // Re-initialize mermaid when theme changes
    // Note: This is global but Mermaid doesn't support scoped themes easily without iframes or shadow DOM
    // For this app, global switch is fine as all diagrams should match theme
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      securityLevel: 'loose',
    });

    const renderChart = async () => {
      try {
        // Unique ID for each render
        const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        if (mounted) {
          setSvg(svg);
          setError(null);
        }
      } catch (e: any) {
        console.error("Mermaid Render Fail", e);
        if (mounted) {
          setError(e.message || "Invalid Diagram");
        }
      }
    };

    if (chart && mounted) {
      renderChart();
    }

    return () => { mounted = false; };
  }, [chart, isDark]);

  if (error) {
    return (
      <div className="p-2 border border-red-200 bg-red-50 text-red-800 rounded font-mono text-sm whitespace-pre-wrap">
        <div className="font-bold mb-1">Mermaid Error:</div>
        {error}
        <div className="mt-2 text-xs text-slate-500">Source:</div>
        <div className="text-xs text-slate-600">{chart}</div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="flex justify-center bg-white dark:bg-slate-900 p-4 rounded-lg my-4 overflow-x-auto border border-slate-100 dark:border-slate-800"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function MarkdownText({ content }: { content: string }) {
  const [metadata, contentToRender] = extractMetadata(content);
  const [isExpanded, setIsExpanded] = useState(false);
  const isDark = useIsDark();

  // Common Markdown Components configuration
  const markdownComponents = {
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';

      if (!inline && (language === 'mermaid' || language === 'sequenceDiagram')) {
        return <Mermaid chart={String(children).replace(/\n$/, '')} />;
      }

      return !inline && match ? (
        <SyntaxHighlighter
          {...props}
          style={isDark ? vscDarkPlus : prism}
          language={language}
          PreTag="div"
          className="rounded-md !my-2 max-w-full overflow-x-auto"
          wrapLongLines={true}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code {...props} className={`${className} bg-slate-200 dark:bg-slate-700 rounded px-1 py-0.5`}>
          {children}
        </code>
      );
    },
    img: ({ node, ...props }: any) => <AsyncImage {...props} className="max-w-full h-auto rounded-lg" />,
    table: ({ node, ...props }: any) => <div className="overflow-x-auto my-4"><table {...props} className="min-w-full divide-y divide-slate-300 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 table-auto" /></div>,
    th: ({ node, ...props }: any) => <th {...props} className="px-3 py-2 text-left text-sm font-semibold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 whitespace-nowrap" />,
    td: ({ node, ...props }: any) => <td {...props} className="px-3 py-2 text-sm text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700" />,
  };

  if (metadata) {
    let Icon = FileText;
    if (metadata.type === 'xlsx' || metadata.type === 'xls') Icon = FileSpreadsheet;
    if (['js', 'ts', 'tsx', 'html', 'css', 'py', 'json'].includes(metadata.type)) Icon = FileCode;

    return (
      <div className="my-2 select-none">
        <div
          className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg border dark:border-slate-700 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="p-2 bg-white dark:bg-slate-900 rounded border dark:border-slate-700">
            <Icon size={24} className="text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-slate-800 dark:text-slate-200 truncate">{metadata.name}</div>
            <div className="text-xs text-slate-500">{metadata.size} • 点击{isExpanded ? '收起' : '查看内容'}</div>

          </div>
          {isExpanded ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
        </div>
        {isExpanded && (
          <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border dark:border-slate-800 text-sm overflow-x-auto select-text">
            <div className="prose dark:prose-invert max-w-none break-words">
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm, remarkBreaks]}
                rehypePlugins={[[rehypeKatex, { strict: false }]]}
                components={markdownComponents}
                urlTransform={(url) => {
                  if (url.startsWith('attachment:')) return url;
                  return url;
                }}
              >
                {contentToRender}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="prose dark:prose-invert max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeKatex, { strict: false }]]}
        components={markdownComponents}
        urlTransform={(url) => {
          if (url.startsWith('attachment:')) return url;
          return url;
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
