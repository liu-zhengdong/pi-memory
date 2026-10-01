/**
 * 根层默认展开记忆的单篇上限：`defaultopen: true` 的全文每轮都在上下文里，
 * 单篇大小决定最坏的一条成本。这里只做判定与提醒文案；注入文本由 memory.ts 渲染，
 * 保证只有一处生成上下文。
 */
export const EXPANDED_FULL_BYTES_LIMIT = 8 * 1024;

/** 单篇超过字节上限时提醒，不阻止注入；顺序与输入一致。 */
export function checkExpandedFull(
  fullText: readonly { name: string; bytes: number }[],
): string[] {
  return fullText
    .filter((note) => note.bytes > EXPANDED_FULL_BYTES_LIMIT)
    .map(
      (note) =>
        `${note.name}：每轮注入全文 ${(note.bytes / 1024).toFixed(1)} KiB，超过单篇默认展开 ${
          EXPANDED_FULL_BYTES_LIMIT / 1024
        } KiB 上限；请拆分，或改为按需阅读。`,
    );
}
