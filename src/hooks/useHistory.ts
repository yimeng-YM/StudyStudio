import { useState, useCallback } from 'react';

/**
 * 历史记录钩子的返回对象结构
 */
interface UseHistoryReturn<T> {
    /** 当前状态值 */
    state: T;
    /** 设置新状态，并将新状态压入历史记录栈 */
    set: (newState: T) => void;
    /** 撤销到上一步状态 */
    undo: () => void;
    /** 重做以恢复撤销前的状态 */
    redo: () => void;
    /** 标识是否可以执行撤销操作 */
    canUndo: boolean;
    /** 标识是否可以执行重做操作 */
    canRedo: boolean;
    /** 清空历史栈并将状态重置为指定的初始状态 */
    reset: (newState: T) => void;
    /** 当前的历史记录数组 */
    history: T[];
}

/**
 * 通用状态历史记录 Hook
 * 用于实现数据的撤销与重做功能（例如编辑器中的操作回退）
 *
 * @param initialState - 初始状态值
 * @returns 包含状态读取和操作控制函数的集合对象
 */
export function useHistory<T>(initialState: T): UseHistoryReturn<T> {
    const [history, setHistory] = useState<T[]>([initialState]);
    const [index, setIndex] = useState(0);

    const state = history[index];

    const set = useCallback((newState: T) => {
        setHistory(prev => {
            const newHistory = prev.slice(0, index + 1);
            return [...newHistory, newState];
        });
        setIndex(prev => prev + 1);
    }, [index]);

    const undo = useCallback(() => {
        setIndex(prev => Math.max(0, prev - 1));
    }, []);

    const redo = useCallback(() => {
        setIndex(prev => Math.min(history.length - 1, prev + 1));
    }, [history.length]);

    const reset = useCallback((newState: T) => {
        setHistory([newState]);
        setIndex(0);
    }, []);

    return {
        state,
        set,
        undo,
        redo,
        canUndo: index > 0,
        canRedo: index < history.length - 1,
        reset,
        history
    };
}
