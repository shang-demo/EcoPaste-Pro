import { useFocusWithin, useHover, useReactive, useUpdateEffect } from "ahooks";
import { Flex, Segmented, Select } from "antd";
import type { ListItemMetaProps } from "antd/es/list";
import { find, isEmpty, map, remove, some, split } from "es-toolkit/compat";
import { type FC, type KeyboardEvent, type MouseEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ProListItem from "../ProListItem";
import UnoIcon from "../UnoIcon";
import { type Key, keys, modifierKeys, standardKeys } from "./keyboard";

interface ProShortcutProps extends ListItemMetaProps {
  value?: string;
  isSystem?: boolean;
  supportDoubleClick?: boolean;
  onChange?: (value: string) => void;
}

interface State {
  value: Key[];
}

const ProShortcut: FC<ProShortcutProps> = (props) => {
  const { value = "", isSystem = true, supportDoubleClick = false, onChange, ...rest } = props;

  const { t } = useTranslation();

  const separator = isSystem ? "+" : ".";
  const keyFiled = isSystem ? "tauriKey" : "hookKey";

  const isDoubleValue = (val: string) => val.startsWith("Double_");

  const [mode, setMode] = useState<"record" | "double">(
    isDoubleValue(value) ? "double" : "record"
  );

  const lastRecordValue = useRef<string>(isDoubleValue(value) ? "" : value);
  const lastDoubleValue = useRef<string>(isDoubleValue(value) ? value : "Double_None");

  useUpdateEffect(() => {
    const nextMode = isDoubleValue(value) ? "double" : "record";
    setMode(nextMode);
    if (nextMode === "double") {
      lastDoubleValue.current = value;
    } else {
      lastRecordValue.current = value;
    }
  }, [value]);

  const parseValue = (val: string = value) => {
    if (!val || isDoubleValue(val)) return [];

    return split(val, separator).map((key) => {
      return find(keys, { [keyFiled]: key })!;
    });
  };

  const state = useReactive<State>({
    value: parseValue(),
  });

  const containerRef = useRef<HTMLElement>(null);

  const isHovering = useHover(containerRef);

  const isFocusing = useFocusWithin(containerRef, {
    onBlur: () => {
      if (mode === "double") return;
      if (!isValidShortcut()) {
        state.value = parseValue();
      }

      handleChange();
    },
    onFocus: () => {
      if (mode === "double") return;
      state.value = [];
    },
  });

  const isValidShortcut = () => {
    if (state.value?.[0]?.eventKey?.startsWith("F")) {
      return true;
    }

    const hasModifierKey = some(state.value, ({ eventKey }) => {
      return some(modifierKeys, { eventKey });
    });
    const hasStandardKey = some(state.value, ({ eventKey }) => {
      return some(standardKeys, { eventKey });
    });

    return hasModifierKey && hasStandardKey;
  };

  const getEventKey = (event: KeyboardEvent) => {
    let { key, code } = event;

    key = key.replace("Meta", "Command");

    const isModifierKey = some(modifierKeys, { eventKey: key });

    return isModifierKey ? key : code;
  };

  const handleChange = () => {
    if (mode === "double") return;
    const nextValue = map(state.value, keyFiled).join(separator);

    onChange?.(nextValue);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (mode === "double") return;
    const eventKey = getEventKey(event);

    const matched = find(keys, { eventKey });
    const isInvalid = !matched;
    const isDuplicate = some(state.value, { eventKey });

    if (isInvalid || isDuplicate) return;

    state.value.push(matched);

    if (isValidShortcut()) {
      containerRef.current?.blur();
    }
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    if (mode === "double") return;
    remove(state.value, { eventKey: getEventKey(event) });
  };

  const handleClear = (event: MouseEvent) => {
    event.preventDefault();
    if (mode === "double") return;

    state.value = [];

    handleChange();
  };

  return (
    <ProListItem {...rest}>
      <Flex gap="small" align="center">
        {supportDoubleClick && (
          <Segmented
            options={[
              { 
                label: (
                  <div style={{ padding: "0 12px" }}>
                    {t("component.shortcut_key.mode.record", "录制")}
                  </div>
                ), 
                value: "record" 
              },
              { 
                label: (
                  <div style={{ padding: "0 12px" }}>
                    {t("component.shortcut_key.mode.double", "双击")}
                  </div>
                ), 
                value: "double" 
              },
            ]}
            value={mode}
            onChange={(val) => {
              const nextMode = val as "record" | "double";
              setMode(nextMode);
              if (nextMode === "double") {
                onChange?.(lastDoubleValue.current);
              } else {
                onChange?.(lastRecordValue.current);
                state.value = parseValue(lastRecordValue.current);
              }
            }}
            style={{ height: 32 }}
          />
        )}

        {mode === "record" || !supportDoubleClick ? (
          <Flex
            align="center"
            className="b hover:b-primary-5 b-color-1 focus:b-primary relative h-8 min-w-32 rounded-md px-2.5 outline-none transition focus:shadow-[0_0_0_2px_rgba(5,145,255,0.1)] focus:dark:shadow-[0_0_0_2px_rgba(0,60,180,0.15)]"
            gap="small"
            justify="center"
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            ref={containerRef}
            tabIndex={0}
            style={{ width: 136 }}
          >
            {isEmpty(state.value) ? (
              isFocusing ? (
                t("component.shortcut_key.hints.press")
              ) : (
                t("component.shortcut_key.hints.click")
              )
            ) : (
              <div className="font-bold text-primary">
                {map(state.value, "symbol").join(" ")}
              </div>
            )}

            <UnoIcon
              className="absolute right-2 text-color-3"
              hidden={isFocusing || !isHovering || isEmpty(state.value)}
              hoverable
              name="i-iconamoon:close-circle-1"
              onMouseDown={handleClear}
              size={16}
            />
          </Flex>
        ) : (
          <Select
            className="min-w-34"
            style={{ width: 136 }}
            value={value}
            onChange={(val) => onChange?.(val)}
            options={[
              { label: t("component.shortcut_key.double_none", "无"), value: "Double_None" },
              { label: t("component.shortcut_key.double_ctrl", "双击 Ctrl"), value: "Double_Control" },
              { label: t("component.shortcut_key.double_alt", "双击 Alt"), value: "Double_Alt" },
              { label: t("component.shortcut_key.double_shift", "双击 Shift"), value: "Double_Shift" }
            ]}
          />
        )}
      </Flex>
    </ProListItem>
  );
};

export default ProShortcut;
