import { downloadDir } from "@tauri-apps/api/path";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open, save } from "@tauri-apps/plugin-dialog";
import { copyFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import Database from "@tauri-apps/plugin-sql";
import {
  Button,
  Flex,
  List,
  Modal,
  message,
  Segmented,
  Switch,
  Tabs,
} from "antd";
import { type FC, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { decompress, fullName } from "tauri-plugin-fs-pro-api";
import ProList from "@/components/ProList";
import UnoIcon from "@/components/UnoIcon";
import { CONTENT_TYPE_TAGS } from "@/constants/contentTypes";
import { showWindow } from "@/plugins/window";
import {
  cleanupPaths,
  copyImagesToStaging,
  copyStoreToStaging,
  createFullBackupArchive,
  createStagingDir,
} from "@/utils/backupArchive";
import {
  buildBackupFilename,
  determineExportMode,
} from "@/utils/backupFilename";
import { hotReloadData } from "@/utils/hotReload";
import {
  getBackupExtname,
  getSaveDatabasePath,
  getSaveDataPath,
  join,
} from "@/utils/path";
import { saveStore } from "@/utils/store";
import type { State } from "../..";

type ExportScope = "all" | "favorites";

const Manual: FC<{ state: State }> = (props) => {
  const { state } = props;
  const { t } = useTranslation();

  // --- 状态管理 ---
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    CONTENT_TYPE_TAGS.map((tag) => tag.key),
  );
  const [exportScope, setExportScope] = useState<ExportScope>("all");
  const [isExportByType, setIsExportByType] = useState(true);

  // 拖拽高亮状态
  const [isDragging, setIsDragging] = useState(false);

  // 拖拽区域 Ref
  const dropzoneRef = useRef<HTMLDivElement>(null);

  // 备份文件的扩展名
  const extname = () => {
    return getBackupExtname();
  };

  // --- 类型标签交互 ---
  const toggleType = (key: string) => {
    setSelectedTypes((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const selectAllTypes = () => {
    setSelectedTypes(CONTENT_TYPE_TAGS.map((tag) => tag.key));
  };

  const deselectAllTypes = () => {
    setSelectedTypes([]);
  };

  // 动态生成导出提示文案
  const getExportHintText = () => {
    const scopeLabel =
      exportScope === "all"
        ? t("preference.data_backup.import_export.hint.scope_all")
        : t("preference.data_backup.import_export.hint.scope_favorites");

    if (isExportByType) {
      if (selectedTypes.length === 0) {
        return t("preference.data_backup.import_export.hint.no_type_selected");
      }
      return t("preference.data_backup.import_export.hint.export_with_types", {
        count: selectedTypes.length,
        scope: scopeLabel,
      });
    }
    return t("preference.data_backup.import_export.hint.export_all_types", {
      scope: scopeLabel,
    });
  };

  // 导出按钮是否禁用
  const isExportDisabled = isExportByType && selectedTypes.length === 0;

  // 执行导入逻辑
  const executeImport = async (path: string) => {
    Modal.confirm({
      centered: true,
      content: t("preference.data_backup.import_export.hints.confirm_import"),
      onOk: async () => {
        try {
          state.spinning = true;

          await hotReloadData(async () => {
            await decompress(path, getSaveDataPath());
          });

          message.success(
            t("preference.data_backup.import_export.hints.import_success"),
          );
        } catch (error) {
          message.error(String(error));
        } finally {
          state.spinning = false;
        }
      },
      title: t("preference.data_backup.import_export.label.confirm_import"),
    });
  };

  // 通过选择文件进行导入
  const handleImport = async () => {
    try {
      const path = await open({
        filters: [
          {
            extensions: [extname()],
            name: t("preference.data_backup.import_export.label.backup_file"),
          },
        ],
      });

      showWindow();

      if (path) {
        executeImport(path);
      }
    } catch (error) {
      message.error(String(error));
    }
  };

  // 判断坐标是否在拖拽区域内
  const isInsideDropzone = (position: { x: number; y: number }) => {
    if (!dropzoneRef.current || !position) return false;
    const rect = dropzoneRef.current.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const logicalX = position.x / scale;
    const logicalY = position.y / scale;
    return (
      logicalX >= rect.left &&
      logicalX <= rect.right &&
      logicalY >= rect.top &&
      logicalY <= rect.bottom
    );
  };

  // 监听文件拖拽导入
  useEffect(() => {
    const unlisten = getCurrentWebviewWindow().onDragDropEvent((event: any) => {
      const { type, position, paths } = event.payload;

      if (type === "enter" || type === "over") {
        // 文件进入或悬停 — 检测是否在拖拽区域内
        setIsDragging(isInsideDropzone(position));
      } else if (type === "leave") {
        // 文件离开窗口
        setIsDragging(false);
      } else if (type === "drop" && paths?.length > 0) {
        // 文件释放
        setIsDragging(false);

        if (!isInsideDropzone(position)) return;

        const path = paths[0];
        if (path.endsWith(`.${extname()}`)) {
          executeImport(path);
        } else {
          message.warning(
            t("preference.data_backup.import_export.hints.drop_zone_format", {
              ext: `.${extname()}`,
            }),
          );
        }
      }
    });

    return () => {
      unlisten.then((fn: any) => fn());
    };
  }, [t, executeImport]);

  /**
   * 构建筛选 SQL 的 DELETE 条件
   * 删除不匹配的记录（保留匹配的记录）
   */
  const buildFilterDeleteSQL = (
    scope: ExportScope,
    types: string[],
  ): string => {
    // 构建类型保留条件（仅保留选中的类型）
    const typeConditions: string[] = [];
    for (const key of types) {
      switch (key) {
        case "text":
          typeConditions.push("(type = 'text' AND subtype IS NULL)");
          break;
        case "rtf":
          typeConditions.push("type = 'rtf'");
          break;
        case "html":
          typeConditions.push("type = 'html'");
          break;
        case "image":
          typeConditions.push("type = 'image'");
          break;
        case "url":
          typeConditions.push("subtype = 'url'");
          break;
        case "path":
          typeConditions.push("subtype = 'path'");
          break;
        case "code":
          typeConditions.push("subtype LIKE 'code_%'");
          break;
        case "markdown":
          typeConditions.push("subtype = 'markdown'");
          break;
        case "email":
          typeConditions.push("subtype = 'email'");
          break;
        case "color":
          typeConditions.push("subtype = 'color'");
          break;
        case "command":
          typeConditions.push("subtype = 'command'");
          break;
        case "files":
          typeConditions.push("type = 'files'");
          break;
      }
    }

    // DELETE WHERE NOT (keepConditions)
    const parts: string[] = [];

    // 范围条件
    if (scope === "favorites") {
      parts.push("favorite != 1");
    }

    // 类型条件（删除不在选中类型中的记录）
    if (
      typeConditions.length > 0 &&
      typeConditions.length < CONTENT_TYPE_TAGS.length
    ) {
      parts.push(`NOT (${typeConditions.join(" OR ")})`);
    }

    if (parts.length === 0) return "";

    // 如果同时有范围和类型条件，需要分两步删除或用 OR 连接
    // 逻辑：保留的记录必须同时满足范围和类型，所以删除不满足任一条件的记录
    return `DELETE FROM history WHERE ${parts.join(" OR ")}`;
  };

  /**
   * 收集筛选结果中需要保留的图片文件名
   */
  const collectFilteredImageNames = async (
    dbPath: string,
  ): Promise<string[]> => {
    const dbUri = `sqlite:${dbPath}`;
    const tempDb = await Database.load(dbUri);
    try {
      const rows = await tempDb.select<{ value: string }[]>(
        "SELECT value FROM history WHERE type = 'image'",
      );
      return rows.map((r) => r.value).filter(Boolean);
    } finally {
      await tempDb.close(dbUri);
    }
  };

  // 导出数据
  const handleExport = async () => {
    try {
      // 确定有效的导出类型
      const effectiveTypes = isExportByType
        ? selectedTypes
        : CONTENT_TYPE_TAGS.map((tag) => tag.key);

      // 确定备份模式
      const mode = determineExportMode(
        exportScope,
        effectiveTypes.length,
        CONTENT_TYPE_TAGS.length,
      );

      // 生成标准文件名
      const filename = await buildBackupFilename(mode);

      const defaultPath = join(await downloadDir(), filename);

      const savePath = await save({
        defaultPath,
        filters: [
          {
            extensions: [extname()],
            name: t("preference.data_backup.import_export.label.backup_file"),
          },
        ],
        title: t("preference.data_backup.import_export.label.save_as_title"),
      });

      showWindow();

      if (!savePath) return;

      state.spinning = true;

      if (mode === "full") {
        // 完整备份：直接打包整个数据目录
        await createFullBackupArchive(savePath);
      } else {
        // 筛选/收藏备份：staging + 筛选 DB + 选择性图片
        await saveStore(true);

        const stagingDir = await createStagingDir("export-filter");
        const cleanupList = [stagingDir];

        try {
          // 复制 store
          const storeBasename = await copyStoreToStaging(stagingDir);

          // 复制 DB 到 staging
          const sourceDbPath = await getSaveDatabasePath();
          const dbBasename = await fullName(sourceDbPath);
          const stagingDbPath = join(stagingDir, dbBasename);
          await copyFile(sourceDbPath, stagingDbPath);

          // 在副本上执行 DELETE 删除不匹配的记录
          const deleteSQL = buildFilterDeleteSQL(exportScope, effectiveTypes);
          if (deleteSQL) {
            const dbUri = `sqlite:${stagingDbPath}`;
            const tempDb = await Database.load(dbUri);
            try {
              await tempDb.execute(deleteSQL);
              // VACUUM 压缩数据库
              await tempDb.execute("VACUUM");
            } finally {
              await tempDb.close(dbUri);
            }
          }

          const includes = [storeBasename, dbBasename];

          // 如果选中了图片类型，复制关联图片
          if (effectiveTypes.includes("image")) {
            const imageNames = await collectFilteredImageNames(stagingDbPath);
            if (imageNames.length > 0) {
              const imagesBasename = await copyImagesToStaging(
                stagingDir,
                imageNames,
              );
              includes.push(imagesBasename);
            }
          }

          // 压缩
          const { compress } = await import("tauri-plugin-fs-pro-api");
          await compress(stagingDir, savePath, { includes });
        } finally {
          await cleanupPaths(cleanupList);
        }
      }

      await revealItemInDir(savePath);

      message.success(
        t("preference.data_backup.import_export.hints.export_success"),
      );
    } catch (error) {
      message.error(String(error));
    } finally {
      state.spinning = false;
    }
  };

  // --- 导出面板 ---
  const renderExportPanel = () => (
    <div className="pt-2">
      {/* 导出范围 */}
      <div className="b-b b-color-2 mb-5 pb-5">
        <Flex align="center" justify="space-between">
          <div>
            <div className="mb-1 text-sm">
              {t("preference.data_backup.import_export.label.export_scope")}
            </div>
            <div className="text-color-3 text-xs">
              {t("preference.data_backup.import_export.hints.export_scope")}
            </div>
          </div>
          <Segmented<ExportScope>
            onChange={setExportScope}
            options={[
              {
                label: (
                  <div style={{ padding: "0 12px" }}>
                    {t("preference.data_backup.import_export.label.scope_all")}
                  </div>
                ),
                value: "all",
              },
              {
                label: (
                  <div style={{ padding: "0 12px" }}>
                    {t(
                      "preference.data_backup.import_export.label.scope_favorites",
                    )}
                  </div>
                ),
                value: "favorites",
              },
            ]}
            size="middle"
            style={{ height: "32px" }}
            value={exportScope}
          />
        </Flex>
      </div>

      {/* 按类型标签筛选 */}
      <Flex align="center" className="mb-4" justify="space-between">
        <span className="text-sm">
          {t("preference.data_backup.import_export.label.filter_by_type")}
        </span>
        <Switch checked={isExportByType} onChange={setIsExportByType} />
      </Flex>

      {/* 标签流区域 */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          marginBottom: isExportByType ? "20px" : "0px",
          maxHeight: isExportByType ? "300px" : "0px",
          opacity: isExportByType ? 1 : 0,
        }}
      >
        <div className="pt-1">
          <Flex align="center" className="mb-3" justify="space-between">
            <span className="text-color-3 text-xs">
              {t("preference.data_backup.import_export.hints.click_to_toggle")}
            </span>
            <Flex gap={12}>
              <button
                className="b-none cursor-pointer bg-transparent text-primary text-xs transition-opacity hover:opacity-80"
                onClick={selectAllTypes}
                type="button"
              >
                {t("preference.data_backup.import_export.button.select_all")}
              </button>
              <button
                className="b-none cursor-pointer bg-transparent text-color-3 text-xs transition-colors hover:text-color-2"
                onClick={deselectAllTypes}
                type="button"
              >
                {t("preference.data_backup.import_export.button.deselect_all")}
              </button>
            </Flex>
          </Flex>

          {/* 类型标签 */}
          <Flex gap={8} wrap="wrap">
            {CONTENT_TYPE_TAGS.map((tag) => {
              const selected = selectedTypes.includes(tag.key);
              return (
                <button
                  className="b flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all"
                  key={tag.key}
                  onClick={() => toggleType(tag.key)}
                  style={{
                    background: selected
                      ? "var(--ant-color-bg-container)"
                      : "var(--ant-color-fill-quaternary)",
                    borderColor: selected
                      ? "var(--ant-color-border)"
                      : "transparent",
                    color: selected
                      ? "var(--ant-color-text)"
                      : "var(--ant-color-text-quaternary)",
                  }}
                  type="button"
                >
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] transition-all"
                    style={{
                      backgroundColor: selected
                        ? `${tag.color}18`
                        : "var(--ant-color-fill-tertiary)",
                      color: selected
                        ? tag.color
                        : "var(--ant-color-text-quaternary)",
                    }}
                  >
                    {tag.icon}
                  </span>
                  <span>{tag.label}</span>
                </button>
              );
            })}
          </Flex>
        </div>
      </div>

      {/* 底部动态文案与导出按钮 */}
      <Flex
        align="center"
        className="b-t b-color-2 pt-4"
        justify="space-between"
      >
        <span
          className="text-xs transition-colors"
          style={{
            color:
              isExportByType && selectedTypes.length === 0
                ? "var(--ant-color-error)"
                : "var(--ant-color-text-tertiary)",
          }}
        >
          {getExportHintText()}
        </span>
        <Button
          disabled={isExportDisabled}
          icon={<UnoIcon name="i-lucide:download" size={16} />}
          onClick={handleExport}
          type="primary"
        >
          {t("preference.data_backup.import_export.button.export_now")}
        </Button>
      </Flex>
    </div>
  );

  // --- 导入面板 ---
  const renderImportPanel = () => (
    <div className="pt-2">
      {/* 拖拽区域 */}
      <div
        className={`b-2 b-dashed flex cursor-pointer flex-col items-center justify-center rounded-xl p-8 transition-all hover:opacity-80 ${isDragging ? "scale-[1.02]" : ""}`}
        onClick={handleImport}
        onKeyDown={(e) => e.key === "Enter" && handleImport()}
        ref={dropzoneRef}
        style={{
          backgroundColor: isDragging
            ? "var(--ant-color-primary-bg-hover)"
            : "var(--ant-color-primary-bg)",
          borderColor: isDragging
            ? "var(--ant-color-primary)"
            : "var(--ant-color-primary-border)",
        }}
      >
        <div
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-full shadow-sm transition-transform"
          style={{ background: "var(--ant-color-bg-container)" }}
        >
          <UnoIcon
            className="text-primary"
            name="i-lucide:upload-cloud"
            size={28}
          />
        </div>
        <h3 className="mb-1 text-sm">
          {t("preference.data_backup.import_export.label.drop_zone_title")}
        </h3>
        <p className="mb-6 text-color-3 text-xs">
          {t("preference.data_backup.import_export.hints.drop_zone_format", {
            ext: `.${extname()}`,
          })}
        </p>

        <Flex
          align="center"
          className="b b-color-2 hover:b-primary rounded-lg px-4 py-2 text-sm transition-colors hover:text-primary"
          gap={8}
          style={{ background: "var(--ant-color-bg-container)" }}
        >
          <UnoIcon name="i-lucide:file-json" size={16} />
          <span>
            {t("preference.data_backup.import_export.button.select_file")}
          </span>
        </Flex>
      </div>

      {/* 覆盖警告 */}
      <Flex align="center" className="mt-3" gap={6}>
        <UnoIcon
          className="flex-shrink-0 text-warning"
          name="i-lucide:alert-circle"
          size={14}
        />
        <span className="text-color-3 text-xs">
          {t(
            "preference.data_backup.import_export.hints.import_will_overwrite",
          )}
        </span>
      </Flex>
    </div>
  );

  return (
    <ProList header={t("preference.data_backup.import_export.title")}>
      <List.Item className="p-4!">
        <div className="w-full">
          <Tabs
            defaultActiveKey="export"
            items={[
              {
                children: renderExportPanel(),
                key: "export",
                label: t("preference.data_backup.import_export.tab.export"),
              },
              {
                children: renderImportPanel(),
                key: "import",
                label: t("preference.data_backup.import_export.tab.import"),
              },
            ]}
          />
        </div>
      </List.Item>
    </ProList>
  );
};

export default Manual;
