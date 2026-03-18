/**
 * 12 类内容类型标签定义
 * 统一供 DateFilter、StorageStats 等组件使用
 */
export interface ContentTypeTag {
  key: string;
  icon: string;
  color: string;
  label: string;
}

export const CONTENT_TYPE_TAGS: ContentTypeTag[] = [
  { color: "#3b82f6", icon: "T", key: "text", label: "纯文本" },
  { color: "#22c55e", icon: "≡", key: "rtf", label: "富文本" },
  { color: "#f59e0b", icon: "<>", key: "html", label: "Html" },
  { color: "#ef4444", icon: "🖼", key: "image", label: "图片" },
  { color: "#8b5cf6", icon: "🔗", key: "url", label: "链接" },
  { color: "#06b6d4", icon: "📂", key: "path", label: "路径" },
  { color: "#ec4899", icon: "{}", key: "code", label: "代码" },
  { color: "#6366f1", icon: "M↓", key: "markdown", label: "Markdown" },
  { color: "#14b8a6", icon: "✉", key: "email", label: "邮箱" },
  { color: "#f97316", icon: "🎨", key: "color", label: "颜色" },
  { color: "#84cc16", icon: ">_", key: "command", label: "指令" },
  { color: "#64748b", icon: "📄", key: "files", label: "文件(夹)" },
];

/**
 * 获取指定类型 key 的 Kysely 查询条件生成器
 * 与 useHistoryList.ts 中的过滤逻辑保持一致
 */
export const getTypeDbCondition = (
  key: string,
  eb: any,
): ReturnType<typeof eb.and> | ReturnType<typeof eb> | null => {
  switch (key) {
    case "text":
      return eb.and([eb("type", "=", "text"), eb("subtype", "is", null)]);
    case "rtf":
      return eb("type", "=", "rtf");
    case "html":
      return eb("type", "=", "html");
    case "image":
      return eb("type", "=", "image");
    case "url":
      return eb("subtype", "=", "url");
    case "path":
      return eb("subtype", "=", "path");
    case "code":
      return eb("subtype", "like", "code_%");
    case "markdown":
      return eb("subtype", "=", "markdown");
    case "email":
      return eb("subtype", "=", "email");
    case "color":
      return eb("subtype", "=", "color");
    case "command":
      return eb("subtype", "=", "command");
    case "files":
      return eb("type", "=", "files");
    default:
      return null;
  }
};
