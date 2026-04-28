import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, BookOpen, Sparkles, Settings, HelpCircle } from 'lucide-react';

export function MobileBottomNav() {
  const location = useLocation();
  const isSubjectPage = location.pathname.startsWith('/subject/');

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-200 dark:border-zinc-800 safe-area-bottom md:hidden">
      <div className="flex items-center justify-around h-14 px-1">
        <NavLink
          to="/"
          className={({ isActive }) => cn(
            "flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 px-0.5 transition-colors",
            isActive ? "text-primary" : "text-muted-foreground"
          )}
          end
        >
          <LayoutDashboard size={20} />
          <span className="text-[10px] leading-tight">首页</span>
        </NavLink>

        <NavLink
          to="/subjects"
          className={({ isActive }) => cn(
            "flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 px-0.5 transition-colors",
            isActive || isSubjectPage ? "text-primary" : "text-muted-foreground"
          )}
        >
          <BookOpen size={20} />
          <span className="text-[10px] leading-tight">学科</span>
        </NavLink>

        <NavLink
          to="/ai-chat"
          className={({ isActive }) => cn(
            "flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 px-0.5 transition-colors",
            isActive ? "text-primary" : "text-muted-foreground"
          )}
        >
          <Sparkles size={20} />
          <span className="text-[10px] leading-tight">AI</span>
        </NavLink>

        <NavLink
          to="/docs"
          className={({ isActive }) => cn(
            "flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 px-0.5 transition-colors",
            isActive ? "text-primary" : "text-muted-foreground"
          )}
        >
          <HelpCircle size={20} />
          <span className="text-[10px] leading-tight">文档</span>
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) => cn(
            "flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 py-1 px-0.5 transition-colors",
            isActive ? "text-primary" : "text-muted-foreground"
          )}
        >
          <Settings size={20} />
          <span className="text-[10px] leading-tight">设置</span>
        </NavLink>
      </div>
    </nav>
  );
}
