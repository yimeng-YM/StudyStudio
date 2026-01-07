import { useState, useCallback } from 'react';

interface UseHistoryReturn<T> {
    state: T;
    set: (newState: T) => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    reset: (newState: T) => void;
    history: T[];
}

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
