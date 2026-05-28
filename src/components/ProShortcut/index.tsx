import { useFocusWithin, useHover, useReactive, useUpdateEffect } from "ahooks";
import { Flex, Popover } from "antd";
import type { ListItemMetaProps } from "antd/es/list";
import { find, isEmpty, map, remove, some, split } from "es-toolkit/compat";
import { type FC, type KeyboardEvent, type MouseEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { isWin } from "@/utils/is";
import ProListItem from "../ProListItem";
import UnoIcon from "../UnoIcon";
import { type Key, getKeySymbol, keys, modifierKeys, standardKeys } from "./keyboard";

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

  const parseValue = (val: string = value) => {
    if (!val || isDoubleValue(val)) return [];

    return split(val, separator).map((key) => {
      return find(keys, { [keyFiled]: key })!;
    });
  };

  const state = useReactive<State>({
    value: parseValue(),
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const isHovering = useHover(groupRef);
  const [isOpen, setIsOpen] = useState(false);

  const isFocusing = useFocusWithin(containerRef, {
    onBlur: () => {
      if (!isValidShortcut()) {
        state.value = parseValue();
      } else {
        const nextValue = map(state.value, keyFiled).join(separator);
        onChange?.(nextValue);
      }
    },
    onFocus: () => {
      state.value = [];
    },
  });

  useUpdateEffect(() => {
    state.value = parseValue();
  }, [value]);

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

  const handleKeyDown = (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
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
    event.preventDefault();
    event.stopPropagation();
    remove(state.value, { eventKey: getEventKey(event) });
  };

  const getDisplayValue = (val: string) => {
    if (!val || val === "Double_None" || val === "无") return t("component.shortcut_key.double_none", "无");
    if (val === "Double_Control") return t("component.shortcut_key.double_ctrl", "双击 Ctrl");
    if (val === "Double_Alt") return t("component.shortcut_key.double_alt", "双击 Alt");
    if (val === "Double_Shift") return t("component.shortcut_key.double_shift", "双击 Shift");

    return val
      .split(separator)
      .map((k) => {
        const sym = getKeySymbol(k);
        if (sym === "Super" && isWin) return "Win";
        return sym;
      })
      .join(" + ");
  };

  const commonShortcuts = ["Alt+C", "Alt+V", "Alt+X", "Command+V"];
  const doubleShortcuts = ["Double_Control", "Double_Alt", "Double_Shift"];

  const popoverContent = (
    <div className="w-56 p-1 text-sm flex flex-col gap-3 font-normal">
      {/* 1. 录制入口 */}
      <div 
        onClick={() => {
          setIsOpen(false);
          setTimeout(() => {
            containerRef.current?.focus();
          }, 50);
        }} 
        className="flex items-center gap-2 p-2 rounded-md hover:bg-primary-1/10 border border-dashed border-primary/30 cursor-pointer text-primary transition-colors justify-center font-normal"
      >
        <UnoIcon name="i-lucide:keyboard" size={14} />
        <span className="text-xs font-normal">{t("component.shortcut_key.hints.record_click", "点击开始录制按键...")}</span>
      </div>

      {/* 2. 常用建议列表 */}
      <div>
        <div className="text-xs text-color-3 mb-1.5 flex items-center gap-1 px-1 font-normal">
          <UnoIcon name="i-lucide:command" size={12} />
          {t("component.shortcut_key.common_shortcuts", "常用组合键")}
        </div>
        <div className="flex flex-col gap-0.5 font-normal">
          {commonShortcuts.map((sc) => {
            const isSelected = value === sc;
            return (
              <button 
                key={sc} 
                type="button"
                onClick={() => {
                  onChange?.(sc);
                  setIsOpen(false);
                }} 
                className={`w-full text-left px-2 py-1.5 rounded-md text-xs font-normal transition-colors flex items-center justify-between border-none bg-transparent cursor-pointer ${
                  isSelected 
                    ? "bg-primary-1/15 text-primary" 
                    : "text-color-1 hover:bg-bg-3"
                }`}
              >
                <span className="font-normal pl-[1em]">{getDisplayValue(sc)}</span>
                {isSelected && <UnoIcon name="i-lucide:check" size={12} className="text-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 分割线 */}
      {supportDoubleClick && (
        <div className="mx-2 h-[1px] bg-border-1/60" />
      )}

      {/* 3. 双击动作列表 */}
      {supportDoubleClick && (
        <div>
          <div className="text-xs text-color-3 mb-1.5 flex items-center gap-1 px-1 font-normal">
            <UnoIcon name="i-lucide:mouse-pointer-2" size={12} />
            {t("component.shortcut_key.double_click_actions", "双击修饰键")}
          </div>
          <div className="flex flex-col gap-0.5 font-normal">
            {doubleShortcuts.map((action) => {
              const isSelected = value === action;
              return (
                <button 
                  key={action}
                  type="button"
                  onClick={() => {
                    onChange?.(action);
                    setIsOpen(false);
                  }} 
                  className={`w-full text-left px-2 py-1.5 rounded-md text-xs font-normal transition-colors flex items-center justify-between border-none bg-transparent cursor-pointer ${
                    isSelected 
                      ? "bg-primary-1/15 text-primary" 
                      : "text-color-1 hover:bg-bg-3"
                  }`}
                >
                  <span className="font-normal pl-[1em]">{getDisplayValue(action)}</span>
                  {isSelected && <UnoIcon name="i-lucide:check" size={12} className="text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const showClear = value && value !== "Double_None" && (isHovering || isFocusing);

  return (
    <ProListItem {...rest}>
      <div className="flex flex-col items-end">
        <div ref={groupRef} className="flex items-center">
          {/* 录制输入框 */}
          <div 
            ref={containerRef}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onClick={(e) => {
              e.stopPropagation();
              containerRef.current?.focus();
            }}
            className={`flex items-center h-8 bg-bg-1 border border-solid overflow-hidden transition-all outline-none cursor-pointer ${
              supportDoubleClick ? "rounded-l-md" : "rounded-md"
            } ${
              isFocusing 
                ? "border-primary shadow-[0_0_0_2px_rgba(5,145,255,0.1)] z-10" 
                : "border-border-1 hover:border-primary hover:z-10"
            }`}
            style={{ width: supportDoubleClick ? 168 : 200 }}
          >
            <div className="flex-1 px-2.5 text-sm truncate flex items-center h-full font-normal">
              {isFocusing ? (
                <span className="text-primary animate-pulse flex items-center gap-1 select-none font-normal">
                  <UnoIcon name="i-lucide:keyboard" size={14} />
                  {isEmpty(state.value) 
                    ? t("component.shortcut_key.hints.press", "监听中...")
                    : map(state.value, "symbol").join(" ")
                  }
                </span>
              ) : (
                <span className={`truncate select-none font-normal ${(!value || value === "Double_None" || value === "无") ? "text-color-3" : "text-color-1"}`}>
                  {getDisplayValue(value)}
                </span>
              )}
            </div>

            {/* 清除按钮 */}
            {showClear && (
              <button 
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange?.("");
                  setIsOpen(false);
                  containerRef.current?.blur();
                }} 
                className="px-2 h-full text-color-3 hover:text-danger transition-colors flex items-center justify-center border-none bg-transparent cursor-pointer group font-normal"
                title={t("component.shortcut_key.clear", "清除快捷键")}
              >
                <UnoIcon name="i-lucide:x" size={14} className="group-hover:scale-110 transition-transform" />
              </button>
            )}
          </div>

          {/* 下拉按钮：拼接在后面，只有在支持双击/建议菜单时才展示 */}
          {supportDoubleClick && (
            <Popover
              content={popoverContent}
              trigger="click"
              open={isOpen}
              onOpenChange={setIsOpen}
              placement="bottomRight"
              overlayClassName="shortcut-popover"
            >
              <div 
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className={`w-8 h-8 flex items-center justify-center border border-solid rounded-r-md transition-all cursor-pointer bg-bg-1 -ml-[1px] ${
                  isOpen 
                    ? "border-primary text-primary z-10" 
                    : "border-border-1 hover:border-primary text-color-3 hover:text-color-1 hover:z-10"
                }`}
              >
                <UnoIcon 
                  name="i-lucide:chevron-down" 
                  size={14} 
                  className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} 
                />
              </div>
            </Popover>
          )}
        </div>

        {/* 系统接管警告文字 */}
        {value === "Command+V" && isWin && (
          <div className="mt-1.5 text-xs text-gold flex items-center gap-1 pr-1 animate-in fade-in duration-300 select-none">
            <UnoIcon name="i-lucide:alert-triangle" size={12} />
            {t("preference.shortcut.shortcut.hints.system_takeover", "已接管系统剪贴板功能")}
          </div>
        )}
      </div>
    </ProListItem>
  );
};

export default ProShortcut;
