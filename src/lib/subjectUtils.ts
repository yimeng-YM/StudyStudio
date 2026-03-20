import { db } from '@/db';

/**
 * 删除学科及其所有关联实体
 * 包含二次确认（需要用户输入学科名称）
 * 
 * @param e 触发事件的鼠标事件
 * @param id 要删除的学科 ID
 * @param showPrompt 显示输入对话框的函数
 * @returns Promise<boolean> 是否成功删除
 */
export async function deleteSubjectWithConfirm(
  e: React.MouseEvent,
  id: string,
  showPrompt: (message: string, defaultValue?: string, options?: {
    title?: string;
    matchValue?: string;
    confirmText?: string;
    cancelText?: string;
  }) => Promise<string | null>
): Promise<boolean> {
  e.preventDefault();
  e.stopPropagation();

  const subject = await db.subjects.get(id);
  if (!subject) return false;

  const input = await showPrompt(
    `确定要删除学科《${subject.name}》吗？这将删除所有相关的笔记、导图和任务，且无法恢复。\n\n请输入学科名称 "${subject.name}" 以确认删除：`,
    "",
    {
      title: "确认删除学科",
      matchValue: subject.name,
      confirmText: "删除",
      cancelText: "取消"
    }
  );

  if (input !== subject.name) return false;

  await db.transaction('rw', db.subjects, db.entities, async () => {
    await db.subjects.delete(id);
    await db.entities.where('subjectId').equals(id).delete();
  });

  return true;
}
