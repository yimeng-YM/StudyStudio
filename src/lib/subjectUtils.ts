import { db } from '@/db';

/**
 * 安全删除指定学科及其所有关联的数据实体。
 * 在执行删除操作前，会弹窗要求用户输入学科的完整名称进行二次确认，以防止误删。
 * 一旦确认，将在同一个数据库事务中级联删除该学科及挂载在它下面的所有笔记、导图和任务等实体。
 *
 * @param e - 触发删除的 React 鼠标事件对象，内部会调用阻止冒泡和默认行为
 * @param id - 需要删除的目标学科的唯一标识 ID
 * @param showPrompt - 用于显示输入对话框的 UI 回调函数，由外部（通常是全局弹窗上下文）提供
 * @returns 若用户成功确认并完成删除操作则返回 true；若取消、输入不匹配或学科不存在则返回 false
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
