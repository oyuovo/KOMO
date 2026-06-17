/**
 * 将标题文本转换为 URL 友好的 id。
 * 与 MarkdownRenderer 和 TOC 共用，确保两端生成的 id 一致。
 */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[（(]([^)）]+)[)）]/g, '')  // 移除中文/英文括号内容
    .replace(/[^\w一-鿿\s-]/g, '')       // 移除特殊符号，保留中文
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
