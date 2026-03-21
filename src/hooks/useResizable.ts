import { useState, useEffect, useCallback } from 'react';

/**
 * 拖拽调整宽度钩子的配置项
 */
interface UseResizableOptions {
    /** 初始分配的宽度 */
    initialWidth: number;
    /** 允许拖拽的最小宽度 */
    minWidth?: number;
    /** 允许拖拽的最大宽度 */
    maxWidth?: number;
    /** 缓存宽度的本地存储标识键（可选） */
    key?: string;
    /** 拖拽方向指示把手的位置：'left' 表示把手在左侧，向左扩展宽度；'right' 表示在右侧 */
    direction?: 'left' | 'right';
}

/**
 * 侧边栏/面板可拖拽调整宽度的功能 Hook
 * 支持在鼠标拖拽时动态计算并更新宽度，可选持久化存储以在刷新时记住宽度状态
 *
 * @param options - 拖拽功能的配置参数
 * @returns 包含当前宽度、重置宽度函数、以及拖拽控制函数和状态的对象
 */
export function useResizable({
    initialWidth,
    minWidth = 200,
    maxWidth = 800,
    key,
    direction = 'right'
}: UseResizableOptions) {
    const [width, setWidth] = useState(() => {
        if (key) {
            const saved = localStorage.getItem(key);
            if (saved) {
                const parsed = parseInt(saved, 10);
                if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
                    return parsed;
                }
            }
        }
        return initialWidth;
    });

    const [isResizing, setIsResizing] = useState(false);

    useEffect(() => {
        if (key) {
            localStorage.setItem(key, width.toString());
        }
    }, [key, width]);

    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);

        const startX = e.clientX;
        const startWidth = width;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const currentX = moveEvent.clientX;
            const diff = currentX - startX;

            let newWidth = startWidth;
            if (direction === 'right') {
                newWidth = startWidth + diff;
            } else {
                newWidth = startWidth - diff; // Moving left increases width
            }

            if (newWidth < minWidth) newWidth = minWidth;
            if (newWidth > maxWidth) newWidth = maxWidth;

            setWidth(newWidth);
        };

        const onMouseUp = () => {
            setIsResizing(false);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [width, minWidth, maxWidth, direction]);

    return { width, startResizing, isResizing, setWidth };
}
