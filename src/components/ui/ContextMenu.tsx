import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

type MenuIcon = ComponentType<any>;

export interface ContextMenuItem {
  key: string;
  label: string;
  icon?: MenuIcon;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  onSelect: () => unknown;
}

export interface ContextMenuTriggerEvent {
  clientX: number;
  clientY: number;
  preventDefault: () => void;
  stopPropagation: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  label: string;
  items: ContextMenuItem[];
}

interface ContextMenuProps extends ContextMenuState {
  onClose: () => void;
}

const NATIVE_CONTEXT_SELECTOR = [
  'input',
  'textarea',
  'select',
  'option',
  '[contenteditable="true"]',
  'a[href]',
  'img',
  'video',
  'audio',
  'iframe',
  'pre',
  'code',
].join(',');

/** Returns true when replacing the browser menu would hide a useful native action. */
export function shouldPreserveNativeContextMenu(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(NATIVE_CONTEXT_SELECTOR));
}

function ContextMenu({ x, y, label, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const margin = 8;
    const rect = menu.getBoundingClientRect();
    setPosition({
      x: Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin)),
      y: Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin)),
    });
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [x, y]);

  useEffect(() => {
    const close = () => onClose();
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) close();
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [onClose]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    if (!buttons.length) return;
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : event.key === 'ArrowDown'
          ? (currentIndex + 1 + buttons.length) % buttons.length
          : (currentIndex - 1 + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className="fixed z-[220] min-w-48 max-w-72 overflow-hidden rounded-xl border border-zinc-200/80 bg-white/95 p-1.5 shadow-2xl backdrop-blur-xl dark:border-zinc-700/80 dark:bg-zinc-900/95"
      style={{ left: position.x, top: position.y }}
    >
      {items.map(item => {
        const Icon = item.icon;
        return (
          <div key={item.key}>
            {item.separatorBefore && <div className="mx-1 my-1 h-px bg-zinc-200 dark:bg-zinc-700" />}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onClose();
                void item.onSelect();
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-40 ${
                item.danger
                  ? 'text-red-600 hover:bg-red-50 focus-visible:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 dark:focus-visible:bg-red-950/40'
                  : 'text-zinc-700 hover:bg-zinc-100 focus-visible:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800'
              }`}
            >
              {Icon ? <Icon size={16} className="shrink-0" /> : <span className="w-4 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.shortcut && <span className="text-[11px] text-zinc-400">{item.shortcut}</span>}
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState | null>(null);
  const closeContextMenu = useCallback(() => setState(null), []);
  const openContextMenu = useCallback((
    event: ContextMenuTriggerEvent,
    items: ContextMenuItem[],
    label = '快捷操作',
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setState({ x: event.clientX, y: event.clientY, items, label });
  }, []);

  const contextMenu: ReactNode = state
    ? <ContextMenu {...state} onClose={closeContextMenu} />
    : null;

  return { openContextMenu, closeContextMenu, contextMenu };
}
