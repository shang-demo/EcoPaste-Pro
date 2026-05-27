import { Flex, List, Switch } from "antd";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import ProSelect from "@/components/ProSelect";
import UnoIcon from "@/components/UnoIcon";
import { globalStore } from "@/stores/global";

interface Option {
  label: string;
  value: "top" | "side";
}

const ViewMode = () => {
  const { appearance } = useSnapshot(globalStore);
  const { t } = useTranslation();

  const viewMode = appearance.viewMode || "top";
  const showFavoriteTags = appearance.showFavoriteTags ?? true;

  const options: Option[] = [
    {
      label: t("preference.settings.appearance_settings.label.view_mode_top"),
      value: "top",
    },
    {
      label: t("preference.settings.appearance_settings.label.view_mode_side"),
      value: "side",
    },
  ];

  const tagOptions = [
    {
      color: "#3b82f6",
      icon: "i-lucide:type",
      key: "text",
      label: t("clipboard.label.tab.text"),
    },
    {
      color: "#ef4444",
      icon: "i-lucide:image",
      key: "image",
      label: t("clipboard.label.tab.image"),
    },
    {
      color: "#8b5cf6",
      icon: "i-lucide:link",
      key: "links",
      label: t("clipboard.label.tab.links"),
    },
    {
      color: "#f97316",
      icon: "i-lucide:palette",
      key: "colors",
      label: t("clipboard.label.tab.colors"),
    },
    {
      color: "#14b8a6",
      icon: "i-lucide:mail",
      key: "email",
      label: t("clipboard.label.tab.email"),
    },
    {
      color: "#ec4899",
      icon: "i-lucide:code",
      key: "code",
      label: t("clipboard.label.tab.code"),
    },
    {
      color: "#64748b",
      icon: "i-lucide:file-box",
      key: "files",
      label: t("clipboard.label.tab.files"),
    },
  ];

  const currentTags = appearance.favoriteTags || ["text", "image", "links"];

  const handleToggleTag = (key: string) => {
    if (currentTags.includes(key)) {
      globalStore.appearance.favoriteTags = currentTags.filter(
        (t) => t !== key,
      );
    } else {
      globalStore.appearance.favoriteTags = [...currentTags, key];
    }
  };

  const handleSelectAll = () => {
    globalStore.appearance.favoriteTags = tagOptions.map((t) => t.key);
  };

  const handleClearAll = () => {
    globalStore.appearance.favoriteTags = [];
  };

  return (
    <>
      {/* 视图模式选择 */}
      <ProSelect
        onChange={(value) => {
          globalStore.appearance.viewMode = value as "top" | "side";
        }}
        options={options}
        title={t("preference.settings.appearance_settings.label.view_mode")}
        value={viewMode}
      />

      {/* 仅在侧边导航模式下展示：把开关和多选标签放在同一个 List.Item 内，完全复用备份页面的排版与渲染风格 */}
      {viewMode === "side" && (
        <List.Item
          className="block w-full overflow-hidden rounded-b-lg p-4!"
          style={{
            borderBottomLeftRadius: "8px",
            borderBottomRightRadius: "8px",
            overflow: "hidden",
          }}
        >
          <div className="w-full">
            {/* 开关容器 */}
            <Flex align="center" className="w-full" justify="space-between">
              <span className="text-color-1 text-sm">
                收藏夹内显示类型标签
              </span>
              <Switch
                checked={showFavoriteTags}
                onChange={(value) => {
                  globalStore.appearance.showFavoriteTags = value;
                }}
              />
            </Flex>

            {/* 动态显示的类型标签选择流（完全镜像备份页面的 transition 折叠和样式效果，取消与开关之间的灰色横线） */}
            <div
              className="overflow-hidden transition-all duration-300 ease-in-out"
              style={{
                marginTop: showFavoriteTags ? "16px" : "0px",
                maxHeight: showFavoriteTags ? "300px" : "0px",
                opacity: showFavoriteTags ? 1 : 0,
              }}
            >
              <div>
                <Flex align="center" className="mb-3" justify="space-between">
                  <span className="select-none text-color-3 text-xs">
                    点击选择收藏夹中显示的类型：
                  </span>
                  <Flex gap={12}>
                    <button
                      className="cursor-pointer border-none bg-transparent font-bold text-primary text-xs transition-opacity hover:opacity-80"
                      onClick={handleSelectAll}
                      type="button"
                    >
                      全选
                    </button>
                    <button
                      className="cursor-pointer border-none bg-transparent font-bold text-color-3 text-xs transition-colors hover:text-color-2"
                      onClick={handleClearAll}
                      type="button"
                    >
                      清空
                    </button>
                  </Flex>
                </Flex>

                <Flex gap={8} wrap="wrap">
                  {tagOptions.map((tag) => {
                    const selected = currentTags.includes(tag.key);
                    return (
                      <button
                        className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-all"
                        key={tag.key}
                        onClick={() => handleToggleTag(tag.key)}
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
                        <UnoIcon
                          className="flex items-center justify-center transition-all"
                          name={tag.icon}
                          size={14}
                          style={{
                            color: selected
                              ? tag.color
                              : "var(--ant-color-text-quaternary)",
                          }}
                        />
                        <span>{tag.label}</span>
                      </button>
                    );
                  })}
                </Flex>
              </div>
            </div>
          </div>
        </List.Item>
      )}
    </>
  );
};

export default ViewMode;
