import { platform } from "@tauri-apps/plugin-os";
import { getWebdavComputerName } from "@/plugins/webdav";
import { globalStore } from "@/stores/global";
import { dayjs, formatDate } from "@/utils/dayjs";
import { getBackupExtname } from "@/utils/path";

/**
 * 备份模式
 * - full:   完整备份（全部范围 + 全部标签）
 * - lite:   轻量备份（仅 DB + store，无图片，WebDAV 专用）
 * - filter: 筛选备份（全部范围 + 部分标签）
 * - favs:   仅收藏夹备份（仅收藏范围，无论标签）
 */
export type BackupMode = "full" | "lite" | "filter" | "favs";

let cachedComputerName: string | undefined;

const normalizeComputerName = (value?: string) => {
  const name = value?.trim();
  if (!name) return "Unknown";
  return name;
};

export const resolveComputerName = async (value?: string) => {
  if (value?.trim()) {
    cachedComputerName = value.trim();
    return cachedComputerName;
  }
  if (cachedComputerName) return cachedComputerName;
  const fetched = await getWebdavComputerName();
  cachedComputerName = normalizeComputerName(fetched);
  return cachedComputerName;
};

const capitalizeFirst = (value: string) => {
  if (!value) return value;
  return value.slice(0, 1).toUpperCase() + value.slice(1);
};

/**
 * 生成备份时间戳
 */
export const buildBackupTime = () => {
  return formatDate(dayjs(), "YYYYMMDDHHmmss");
};

/**
 * 生成公共的备份文件名（不含扩展名）
 * 格式: ${appName}.${timestamp}.${deviceName}.${os}.${mode}
 */
export const buildBackupBasename = async (
  mode: BackupMode,
  computerName?: string,
) => {
  const appName = globalStore.env.appName || "EcoPaste";
  const device = await resolveComputerName(computerName);
  const deviceName = normalizeComputerName(device).replace(/\s+/g, "");
  const os = capitalizeFirst(await platform());
  const timestamp = buildBackupTime();
  return `${appName}.${timestamp}.${deviceName}.${os}.${mode}`;
};

/**
 * 生成公共的备份文件名（含扩展名）
 * 格式: ${appName}.${timestamp}.${deviceName}.${os}.${mode}.${extname}
 */
export const buildBackupFilename = async (
  mode: BackupMode,
  computerName?: string,
) => {
  const basename = await buildBackupBasename(mode, computerName);
  const ext = getBackupExtname();
  return `${basename}.${ext}`;
};

/**
 * 根据导出选项自动判定备份模式
 */
export const determineExportMode = (
  scope: "all" | "favorites",
  selectedTypeCount: number,
  totalTypeCount: number,
): BackupMode => {
  if (scope === "favorites") return "favs";
  if (selectedTypeCount >= totalTypeCount) return "full";
  return "filter";
};
