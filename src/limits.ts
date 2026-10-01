/**
 * 常驻记忆的上限：条目数决定每轮固定成本，单篇全文大小决定最坏的一条成本。
 * 这里只做判定与提醒文案；注入文本由 memory.ts 渲染，保证只有一处生成上下文。
 */
export const RESIDENT_ENTRY_LIMIT = 200;
export const RESIDENT_FULL_BYTES_LIMIT = 8 * 1024;

export interface ResidentPlan {
  /** 本轮登记的深层常驻记忆条数。 */
  take: number;
  omitted: number;
  issues: string[];
}

/**
 * 深层 `defaultopen: true` 的记忆每轮只提供指针，超过条目上限的部分不登记并列出；
 * 根层 `defaultopen: true` 的记忆每轮注入全文，单篇超过字节上限时提醒但不阻止。
 */
export function planResidents(
  openNames: readonly string[],
  fullText: readonly { name: string; bytes: number }[],
): ResidentPlan {
  const issues: string[] = [];
  const take = Math.min(openNames.length, RESIDENT_ENTRY_LIMIT);
  const omitted = openNames.length - take;
  if (omitted)
    issues.push(
      `深层常驻记忆超过上限 ${RESIDENT_ENTRY_LIMIT} 条：已登记 ${take} 条，${omitted} 条未登记（${openNames
        .slice(take, take + 5)
        .join("、")}${omitted > 5 ? " 等" : ""}）。请把不常用的 defaultopen 改为 false，或归档到子目录。`,
    );
  for (const note of fullText)
    if (note.bytes > RESIDENT_FULL_BYTES_LIMIT)
      issues.push(
        `${note.name}：每轮注入全文 ${(note.bytes / 1024).toFixed(1)} KiB，超过单篇常驻 ${
          RESIDENT_FULL_BYTES_LIMIT / 1024
        } KiB 上限；请拆分，或改为按需阅读。`,
      );
  return { take, omitted, issues };
}
