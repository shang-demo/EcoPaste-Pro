import { tempDir } from "@tauri-apps/api/path";
import { copyFile, mkdir, remove } from "@tauri-apps/plugin-fs";
import { compress, fullName } from "tauri-plugin-fs-pro-api";
import {
  getSaveDatabasePath,
  getSaveDataPath,
  getSaveImagePath,
  getSaveStorePath,
  join,
} from "@/utils/path";
import { saveStore } from "@/utils/store";

/**
 * 创建临时 staging 目录
 */
export const createStagingDir = async (prefix: string) => {
  const tempRoot = await tempDir();
  const stagingDir = join(tempRoot, `${prefix}-${Date.now()}`);
  await mkdir(stagingDir, { recursive: true });
  return stagingDir;
};

/**
 * 复制 store 备份文件到 staging 目录
 * @returns store 文件的 basename
 */
export const copyStoreToStaging = async (stagingDir: string) => {
  const storePath = await getSaveStorePath(true);
  const storeBasename = await fullName(storePath);
  const stagingStorePath = join(stagingDir, storeBasename);
  await copyFile(storePath, stagingStorePath);
  return storeBasename;
};

/**
 * 复制数据库文件到 staging 目录（原样复制）
 * @returns 数据库文件的 basename
 */
export const copyDatabaseToStaging = async (stagingDir: string) => {
  const dbPath = await getSaveDatabasePath();
  const dbBasename = await fullName(dbPath);
  const stagingDbPath = join(stagingDir, dbBasename);
  await copyFile(dbPath, stagingDbPath);
  return dbBasename;
};

/**
 * 复制 images 目录到 staging 目录
 * @param imagePaths 需要复制的图片路径列表（相对于 images 目录的文件名）
 *                   如果不传，则复制整个 images 目录
 * @returns images 目录的 basename
 */
export const copyImagesToStaging = async (
  stagingDir: string,
  imageNames?: string[],
) => {
  const imagesDir = getSaveImagePath();
  const imagesBasename = await fullName(imagesDir);
  const stagingImagesDir = join(stagingDir, imagesBasename);
  await mkdir(stagingImagesDir, { recursive: true });

  if (imageNames) {
    // 选择性复制指定图片
    for (const name of imageNames) {
      const src = join(imagesDir, name);
      const dest = join(stagingImagesDir, name);
      try {
        await copyFile(src, dest);
      } catch {
        // 跳过不存在的图片文件
      }
    }
  } else {
    // 复制整个 images 目录的内容（使用 compress 的方式不需要这里处理）
    // 调用方会直接把 imagesDir 加入 compress includes
  }

  return imagesBasename;
};

/**
 * 压缩 staging 目录为归档文件
 */
export const compressStaging = async (
  stagingDir: string,
  archivePath: string,
  includes: string[],
) => {
  await compress(stagingDir, archivePath, { includes });
};

/**
 * 清理临时文件和目录
 */
export const cleanupPaths = async (paths: string[]) => {
  for (const path of paths) {
    try {
      await remove(path, { recursive: true });
    } catch {
      // 静默忽略清理失败
    }
  }
};

/**
 * 创建完整备份（full）归档文件
 * 直接压缩数据目录，包含 DB + store + images
 */
export const createFullBackupArchive = async (archivePath: string) => {
  await saveStore(true);

  const basePath = getSaveDataPath();
  const includes = [
    await fullName(await getSaveStorePath(true)),
    await fullName(getSaveImagePath()),
    await fullName(await getSaveDatabasePath()),
  ];

  await compress(basePath, archivePath, { includes });

  return { archivePath, cleanupList: [] as string[] };
};

/**
 * 创建 staging 式备份归档（用于 lite / filter / favs 模式）
 * @param prepareDatabase 自定义数据库处理回调（如 lite 或 filter 逻辑）
 * @param prepareImages   可选的图片处理回调
 */
export const createStagedBackupArchive = async (
  archivePath: string,
  options: {
    prefix?: string;
    prepareDatabase: (
      stagingDir: string,
      sourceDbPath: string,
    ) => Promise<string>;
    prepareImages?: (stagingDir: string) => Promise<string | null>;
  },
) => {
  await saveStore(true);

  const stagingDir = await createStagingDir(options.prefix || "backup-staging");
  const cleanupList = [stagingDir];

  try {
    // 复制 store
    const storeBasename = await copyStoreToStaging(stagingDir);

    // 处理数据库
    const sourceDbPath = await getSaveDatabasePath();
    const dbBasename = await options.prepareDatabase(stagingDir, sourceDbPath);

    const includes = [storeBasename, dbBasename];

    // 处理图片（可选）
    if (options.prepareImages) {
      const imagesBasename = await options.prepareImages(stagingDir);
      if (imagesBasename) {
        includes.push(imagesBasename);
      }
    }

    await compressStaging(stagingDir, archivePath, includes);

    return { archivePath, cleanupList };
  } catch (error) {
    // 确保出错时也尝试清理
    await cleanupPaths(cleanupList);
    throw error;
  }
};
