import { openPath } from "@tauri-apps/plugin-opener";
import { Flex } from "antd";
import type { HookAPI } from "antd/es/modal/useModal";
import clsx from "clsx";
import { type FC, useContext, useState } from "react";
import { Marker } from "react-mark.js";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import SafeHtml from "@/components/SafeHtml";
import UnoIcon from "@/components/UnoIcon";
import { LISTEN_KEY } from "@/constants";
import { useContextMenu } from "@/hooks/useContextMenu";
import { MainContext } from "@/pages/Main";
import { pasteToClipboard } from "@/plugins/clipboard";
import { clipboardStore } from "@/stores/clipboard";
import type { DatabaseSchemaHistory } from "@/types/database";
import Files from "../Files";
import Header from "../Header";
import Image from "../Image";
import Rtf from "../Rtf";
import Text from "../Text";

export interface ItemProps {
  index: number;
  data: DatabaseSchemaHistory;
  deleteModal: HookAPI;
  handleNote: () => void;
}

const Item: FC<ItemProps> = (props) => {
  const { index, data, handleNote } = props;
  const { id, type, note, value } = data;
  const { rootState } = useContext(MainContext);
  const { content } = useSnapshot(clipboardStore);
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  // 计算内容是否需要展开按钮（仅文本类型）
  const needsExpand = type === "text" || type === "rtf" || type === "html";

  const handlePreview = () => {
    if (type !== "image") return;

    openPath(value);
  };

  const handleNext = () => {
    const { list } = rootState;

    const nextItem = list[index + 1] ?? list[index - 1];

    rootState.activeId = nextItem?.id;
  };

  const handlePrev = () => {
    if (index === 0) return;

    rootState.activeId = rootState.list[index - 1].id;
  };

  rootState.eventBus?.useSubscription((payload) => {
    if (payload.id !== id) return;

    const { handleDelete, handleFavorite } = rest;

    switch (payload.action) {
      case LISTEN_KEY.CLIPBOARD_ITEM_PREVIEW:
        return handlePreview();
      case LISTEN_KEY.CLIPBOARD_ITEM_PASTE:
        return pasteToClipboard(data);
      case LISTEN_KEY.CLIPBOARD_ITEM_DELETE:
        return handleDelete();
      case LISTEN_KEY.CLIPBOARD_ITEM_SELECT_PREV:
        return handlePrev();
      case LISTEN_KEY.CLIPBOARD_ITEM_SELECT_NEXT:
        return handleNext();
      case LISTEN_KEY.CLIPBOARD_ITEM_FAVORITE:
        return handleFavorite();
    }
  });

  const { handleContextMenu, ...rest } = useContextMenu({
    ...props,
    handleNext,
  });

  const handleClick = (type: typeof content.autoPaste) => {
    rootState.activeId = id;

    if (content.autoPaste !== type) return;

    pasteToClipboard(data);
  };

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const renderContent = () => {
    switch (type) {
      case "text":
        return <Text {...data} expanded={expanded} />;
      case "rtf":
        return <Rtf {...data} expanded={expanded} />;
      case "html":
        return <SafeHtml {...data} expanded={expanded} />;
      case "image":
        return <Image {...data} expanded={expanded} />;
      case "files":
        return <Files {...data} />;
    }
  };

  // 根据 displayLines 配置计算动态最大高度类名
  // 每行约 1.5rem (24px)，Header 约 1.5rem，padding 约 0.75rem
  const getMaxHeightClass = () => {
    if (expanded) return "";
    const lines = content.displayLines || 4;
    // 基础高度 = header(1.5rem) + padding(0.75rem) + 内容行数 * 1.5rem
    const heights: Record<number, string> = {
      1: "max-h-12",
      2: "max-h-16",
      3: "max-h-20",
      4: "max-h-24",
      5: "max-h-28",
      6: "max-h-32",
      8: "max-h-40",
      10: "max-h-48",
    };
    return heights[lines] || "max-h-24";
  };

  return (
    <Flex
      className={clsx(
        "group b hover:b-primary-5 b-color-2 mx-3 rounded-md p-1.5 transition",
        getMaxHeightClass(),
        {
          "b-primary bg-primary-1": rootState.activeId === id,
          "max-h-none": expanded,
        },
      )}
      gap={4}
      onClick={() => handleClick("single")}
      onContextMenu={handleContextMenu}
      onDoubleClick={() => handleClick("double")}
      vertical
    >
      <Header {...rest} data={data} handleNote={handleNote} />

      <div className="relative flex-1 select-auto overflow-hidden break-words children:transition">
        <div
          className={clsx(
            "pointer-events-none absolute inset-0 children:inline opacity-0",
            {
              "group-hover:opacity-0": content.showOriginalContent,
              "opacity-100": note,
            },
            expanded ? "" : `line-clamp-${content.displayLines || 4}`,
          )}
        >
          <UnoIcon
            className="mr-0.5 translate-y-0.5"
            name="i-hugeicons:task-edit-01"
          />

          <Marker mark={rootState.search}>{note}</Marker>
        </div>

        <div
          className={clsx("h-full", {
            "group-hover:opacity-100": content.showOriginalContent,
            "opacity-0": note,
          })}
        >
          {renderContent()}
        </div>
      </div>

      {/* 展开/收起按钮 */}
      {needsExpand && (
        <div
          className="flex cursor-pointer items-center justify-center text-xs text-primary hover:text-primary-6"
          onClick={handleToggleExpand}
        >
          <UnoIcon
            className="mr-1"
            name={expanded ? "i-lucide:chevron-up" : "i-lucide:chevron-down"}
          />
          <span>
            {expanded
              ? t("preference.clipboard.content_settings.label.collapse")
              : t("preference.clipboard.content_settings.label.expand")}
          </span>
        </div>
      )}
    </Flex>
  );
};

export default Item;
