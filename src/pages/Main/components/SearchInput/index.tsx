import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useBoolean, useDebounce, useKeyPress } from "ahooks";
import type { InputRef } from "antd";
import { Input } from "antd";
import {
  type FC,
  type HTMLAttributes,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import UnoIcon from "@/components/UnoIcon";
import { PRESET_SHORTCUT } from "@/constants";
import { useTauriFocus } from "@/hooks/useTauriFocus";
import { useTauriListen } from "@/hooks/useTauriListen";
import { setWindowActiveMode } from "@/plugins/window";
import { clipboardStore } from "@/stores/clipboard";
import { MainContext } from "../..";

const SearchInput: FC<HTMLAttributes<HTMLDivElement>> = (props) => {
  const { rootState } = useContext(MainContext);
  const inputRef = useRef<InputRef>(null);
  const [value, setValue] = useState<string>();
  const debouncedValue = useDebounce(value, { wait: 300 });
  const [isComposition, { setTrue, setFalse }] = useBoolean();
  const { t } = useTranslation();

  useEffect(() => {
    if (isComposition) return;

    rootState.search = debouncedValue;
  }, [debouncedValue, isComposition]);

  useTauriFocus({
    onBlur() {
      const { search } = clipboardStore;

      // 搜索框自动清空
      if (search.autoClear) {
        setValue(void 0);
      }
    },
    onFocus() {
      const { search } = clipboardStore;

      // 搜索框默认聚焦（仅在非不夺焦模式下生效）
      if (search.defaultFocus && !clipboardStore.window.noActivate) {
        inputRef.current?.focus();
      }
    },
  });

  useTauriListen("focus_search_input", () => {
    inputRef.current?.focus();
  });

  useKeyPress(PRESET_SHORTCUT.SEARCH, async () => {
    if (clipboardStore.window.noActivate) {
      await setWindowActiveMode(true);
      await getCurrentWebviewWindow().setFocus();
    }
    inputRef.current?.focus();
  });

  useKeyPress(
    ["enter", "uparrow", "downarrow"],
    () => {
      inputRef.current?.blur();
    },
    {
      target: inputRef.current?.input,
    },
  );

  return (
    <div {...props}>
      <Input
        allowClear
        autoCorrect="off"
        onChange={(event) => {
          setValue(event.target.value);
        }}
        onCompositionEnd={setFalse}
        onCompositionStart={setTrue}
        placeholder={t("clipboard.hints.search_placeholder")}
        prefix={<UnoIcon name="i-lucide:search" />}
        ref={inputRef}
        size="small"
        value={value}
      />
    </div>
  );
};

export default SearchInput;
