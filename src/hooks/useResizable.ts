import { useState, useEffect, useCallback } from 'react';

interface UseResizableOptions {
    initialWidth: number;
    minWidth?: number;
    maxWidth?: number;
    key?: string; // storage key
    direction?: 'left' | 'right'; // 'left' means handle is on the left (grows to the left), 'right' means handle is on the right
}

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
