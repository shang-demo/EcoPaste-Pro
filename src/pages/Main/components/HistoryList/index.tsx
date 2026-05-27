import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useUpdateEffect } from "ahooks";
import { FloatButton, Modal } from "antd";
import clsx from "clsx";
import { findIndex } from "es-toolkit/compat";
import { useContext, useEffect, useRef } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import Scrollbar from "@/components/Scrollbar";
import { LISTEN_KEY } from "@/constants";
import { updateHistory } from "@/database/history";
import { useHistoryList } from "@/hooks/useHistoryList";
import { useKeyboard } from "@/hooks/useKeyboard";
import { useTauriListen } from "@/hooks/useTauriListen";
import { clipboardStore } from "@/stores/clipboard";
import { dayjs, formatDate } from "@/utils/dayjs";
import { MainContext } from "../..";
import EditModal, { type EditModalRef } from "./components/EditModal";
import Item from "./components/Item";
import NoteModal, { type NoteModalRef } from "./components/NoteModal";

const HistoryList = () => {
  const { rootState } = useContext(MainContext);
  const noteModelRef = useRef<NoteModalRef>(null);
  const editModalRef = useRef<EditModalRef>(null);
  const [deleteModal, contextHolder] = Modal.useModal();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const isFavoriteTab = rootState.group === "favorite";
  const isSortEnabled = isFavoriteTab && clipboardStore.content.favoriteSort;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = rootState.list.findIndex(
        (item) => item.id === active.id,
      );
      const newIndex = rootState.list.findIndex((item) => item.id === over.id);

      if (oldIndex < 0 || newIndex < 0) return;

      const activeItem = rootState.list[oldIndex];

      // 重排本地状态列表
      const [movedItem] = rootState.list.splice(oldIndex, 1);
      rootState.list.splice(newIndex, 0, movedItem);

      // 计算合理的 favoriteOrder 时间差以在数据库中维持正确的排序
      const prevItem = rootState.list[newIndex - 1];
      const nextItem = rootState.list[newIndex + 1];

      let newTime: string;

      if (prevItem && nextItem) {
        const prevOrderStr = prevItem.favoriteOrder || prevItem.createTime;
        const nextOrderStr = nextItem.favoriteOrder || nextItem.createTime;

        const prevMs = dayjs(prevOrderStr).valueOf();
        const nextMs = dayjs(nextOrderStr).valueOf();
        const midMs = Math.round((prevMs + nextMs) / 2);

        if (prevOrderStr === nextOrderStr) {
          newTime = formatDate(dayjs(prevOrderStr).subtract(1, "second"));
        } else if (Math.abs(prevMs - nextMs) <= 1000) {
          // 仅相差1秒，没有足够的中点秒数，我们需要将 movedItem 设为 prevItem.favoriteOrder 减去 1 秒，
          // 并级联向下微调后续受影响的条目，以腾出时间差空间。
          newTime = formatDate(dayjs(prevOrderStr).subtract(1, "second"));

          let targetTime = dayjs(newTime);
          for (let i = newIndex + 1; i < rootState.list.length; i++) {
            const cur = rootState.list[i];
            const curOrderStr = cur.favoriteOrder || cur.createTime;
            if (dayjs(curOrderStr).valueOf() >= targetTime.valueOf()) {
              const nextT = targetTime.subtract(1, "second");
              cur.favoriteOrder = formatDate(nextT);
              await updateHistory(cur.id, { favoriteOrder: cur.favoriteOrder });
              targetTime = nextT;
            } else {
              break;
            }
          }
        } else {
          newTime = formatDate(midMs);
        }
      } else if (prevItem) {
        // 移到末尾
        const prevOrderStr = prevItem.favoriteOrder || prevItem.createTime;
        newTime = formatDate(dayjs(prevOrderStr).subtract(1, "second"));
      } else if (nextItem) {
        // 移到开头
        const nextOrderStr = nextItem.favoriteOrder || nextItem.createTime;
        const nextTimeVal = dayjs(nextOrderStr);
        const now = dayjs();
        newTime = formatDate(
          nextTimeVal.isAfter(now) ? nextTimeVal.add(1, "second") : now,
        );
      } else {
        return;
      }

      movedItem.favoriteOrder = newTime;
      await updateHistory(movedItem.id, { favoriteOrder: newTime });
    }
  };

  const scrollToIndex = (index: number) => {
    return virtuosoRef.current?.scrollIntoView({ index });
  };

  const scrollToTop = () => {
    if (rootState.list.length === 0) return;

    scrollToIndex(0);

    rootState.activeId = rootState.list[0].id;
  };

  const { reload, loadMore } = useHistoryList({ scrollToTop });

  useKeyboard({ scrollToTop });

  useTauriListen(LISTEN_KEY.ACTIVATE_BACK_TOP, scrollToTop);

  // 默认收起：激活窗口时清空展开状态
  useTauriListen(LISTEN_KEY.ACTIVATE_DEFAULT_COLLAPSE, () => {
    rootState.expandedIds = [];
  });

  useUpdateEffect(() => {
    const { list } = rootState;

    if (list.length === 0) {
      rootState.activeId = void 0;
    } else {
      rootState.activeId ??= list[0].id;
    }
  }, [rootState.list.length]);

  useEffect(() => {
    const { list, activeId } = rootState;

    if (!activeId) return;

    const index = findIndex(list, { id: activeId });

    if (index < 0) return;

    scrollToIndex(index);
  }, [rootState.activeId]);

  const renderVirtuoso = () => (
    <Virtuoso
      atTopStateChange={(atTop) => {
        if (!atTop || rootState.list.length <= 20) return;

        reload();
      }}
      computeItemKey={(_, item) => item.id}
      customScrollParent={scrollerRef.current ?? void 0}
      data={rootState.list}
      endReached={loadMore}
      itemContent={(index, data) => {
        return (
          <div className={clsx({ "pt-3": index !== 0 })}>
            <Item
              data={data}
              deleteModal={deleteModal}
              handleEdit={() => editModalRef.current?.open(data.id)}
              handleNote={() => noteModelRef.current?.open(data.id)}
              index={index}
            />
          </div>
        );
      }}
      ref={virtuosoRef}
    />
  );

  return (
    <>
      <Scrollbar className="flex-1" offsetX={3} ref={scrollerRef}>
        {isSortEnabled ? (
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <SortableContext
              items={rootState.list.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              {renderVirtuoso()}
            </SortableContext>
          </DndContext>
        ) : (
          renderVirtuoso()
        )}
      </Scrollbar>

      <NoteModal ref={noteModelRef} />
      <EditModal ref={editModalRef} />

      <FloatButton.BackTop
        duration={0}
        onClick={scrollToTop}
        style={{ bottom: 24 }}
        target={() => scrollerRef.current!}
      />

      {contextHolder}
    </>
  );
};

export default HistoryList;
