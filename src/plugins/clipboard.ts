import { emit } from "@tauri-apps/api/event";
import { exists } from "@tauri-apps/plugin-fs";
import {
  writeFiles,
  writeHTML,
  writeImage,
  writeRTF,
  writeText,
} from "tauri-plugin-clipboard-x-api";
import { LISTEN_KEY } from "@/constants";
import { updateHistory } from "@/database/history";
import { clipboardStore } from "@/stores/clipboard";
import type { DatabaseSchemaHistory } from "@/types/database";
import { formatDate } from "@/utils/dayjs";
import { isColor, isEmail, isMarkdown, isURL } from "@/utils/is";
import { detectCode } from "@/utils/isCode";
import { isEnvPath, isShellPath, isSysCommand } from "@/utils/winPaths";
import { paste } from "./paste";
import { hideWindow } from "./window";

export const getClipboardTextSubtype = async (value: string) => {
  try {
    const trimmedValue = value.trim();

    if (isURL(trimmedValue)) {
      return "url";
    }

    if (isEmail(trimmedValue)) {
      return "email";
    }

    if (isColor(trimmedValue)) {
      return "color";
    }

    // Windows 特殊路径与指令检测
    if (isEnvPath(trimmedValue) || isShellPath(trimmedValue)) {
      return "path";
    }

    if (isSysCommand(trimmedValue)) {
      return "command";
    }

    if (await exists(trimmedValue)) {
      return "path";
    }

    // Markdown detection: check for common markdown patterns
    if (isMarkdown(trimmedValue)) {
      return "markdown";
    }

    const codeDetect = detectCode(trimmedValue);
    if (codeDetect.isCode && codeDetect.language) {
      return `code_${codeDetect.language}`;
    }
  } catch {
    return;
  }
};

export const markInternalClipboardWrite = (isImage = false) => {
  (window as any).__isEcoPastePasting = true;
  if ((window as any).__ecoPastePasteTimeout) {
    clearTimeout((window as any).__ecoPastePasteTimeout);
  }
  (window as any).__ecoPastePasteTimeout = setTimeout(() => {
    (window as any).__isEcoPastePasting = false;
  }, 1000);

  // 图片粘贴时，插件可能延迟数十秒后再次触发事件，需要更长的保护窗口
  if (isImage) {
    (window as any).__isEcoPasteImageEcho = true;
    if ((window as any).__ecoPasteImageTimeout) {
      clearTimeout((window as any).__ecoPasteImageTimeout);
    }
    (window as any).__ecoPasteImageTimeout = setTimeout(() => {
      (window as any).__isEcoPasteImageEcho = false;
    }, 3000); // 3秒，覆盖插件的延迟异步处理
  }
};

export const writeToClipboard = (data: DatabaseSchemaHistory) => {
  markInternalClipboardWrite(data.type === "image");
  const { type, value, search } = data;

  switch (type) {
    case "text":
      return writeText(value);
    case "rtf":
      return writeRTF(search, value);
    case "html":
      return writeHTML(search, value);
    case "image":
      return writeImage(value);
    case "files":
      return writeFiles(value);
  }
};

export const pasteToClipboard = async (
  data: DatabaseSchemaHistory,
  asPlain?: boolean,
  options?: { pinned?: boolean },
) => {
  const { type, value, search } = data;
  const { pastePlain } = clipboardStore.content;

  if (asPlain ?? pastePlain) {
    markInternalClipboardWrite(type === "image");
    if (type === "files") {
      await writeText(value.join("\n"));
    } else {
      await writeText(search);
    }
  } else {
    await writeToClipboard(data);
  }

  // 图片粘贴时，回声路径因文件名不同无法走 matched 置顶，在此处主动置顶
  if (clipboardStore.content.autoSort && data.id && type === "image") {
    await updateHistory(data.id, { createTime: formatDate() });
    emit(LISTEN_KEY.REFRESH_CLIPBOARD_LIST);
  }

  // 窗口置顶（钉住）时不关闭窗口
  if (!options?.pinned) {
    hideWindow();
  }

  return paste();
};
