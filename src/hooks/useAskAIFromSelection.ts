import { useCallback } from 'react';
import { generateUUID } from '@/lib/utils';
import { useAIStore } from '@/store/useAIStore';

export interface AskAISelectionRequest {
  selectedText: string;
  sourceLabel: string;
  hiddenContext: string;
}

/** Opens the AI sidebar and prepares a question without exposing locator metadata in the composer. */
export function useAskAIFromSelection() {
  const setComposerDraft = useAIStore(state => state.setComposerDraft);
  const setAIWindowMode = useAIStore(state => state.setAIWindowMode);
  const setFloatingWindowOpen = useAIStore(state => state.setFloatingWindowOpen);
  const setFloatingWindowMinimized = useAIStore(state => state.setFloatingWindowMinimized);

  return useCallback(({ selectedText, sourceLabel, hiddenContext }: AskAISelectionRequest) => {
    const normalizedText = selectedText.trim();
    if (!normalizedText) return;
    const quote = normalizedText
      .split(/\r?\n/)
      .map(line => `> ${line}`)
      .join('\n');

    setComposerDraft({
      id: generateUUID(),
      text: `请针对我选中的内容回答：\n\n${quote}\n\n我的问题是：`,
      hiddenContext,
      sourceLabel,
    });
    setAIWindowMode('sidebar');
    setFloatingWindowMinimized(false);
    setFloatingWindowOpen(true);
  }, [setAIWindowMode, setComposerDraft, setFloatingWindowMinimized, setFloatingWindowOpen]);
}
