import { invoke } from "@tauri-apps/api/core";
import { InputNumber, Select, Space, Switch } from "antd";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import ProList from "@/components/ProList";
import ProListItem from "@/components/ProListItem";
import ProShortcut from "@/components/ProShortcut";
import { globalStore } from "@/stores/global";
import Preset from "./components/Preset";
import QuickPaste from "./components/QuickPaste";

const Shortcut = () => {
  const { shortcut } = useSnapshot(globalStore);
  const { t } = useTranslation();

  const mbuttonConfig = shortcut.mbuttonOpen || {
    delay: 500,
    enable: false,
    triggerMode: "click",
  };

  const syncMbuttonListener = (
    active: boolean,
    triggerMode: "click" | "long_press",
    delay: number,
  ) => {
    invoke("plugin:eco-window|set_mbutton_listener_active", {
      active,
      delay,
      triggerMode,
    }).catch((err) => {
      // biome-ignore lint/suspicious/noConsole: log error
      console.error(err);
    });
  };

  return (
    <>
      <ProList header={t("preference.shortcut.shortcut.title")}>
        <ProShortcut
          onChange={(value) => {
            globalStore.shortcut.clipboard = value;
          }}
          supportDoubleClick={true}
          title={t("preference.shortcut.shortcut.label.open_clipboard")}
          value={shortcut.clipboard}
        />

        <ProShortcut
          onChange={(value) => {
            globalStore.shortcut.preference = value;
          }}
          title={t("preference.shortcut.shortcut.label.open_settings")}
          value={shortcut.preference}
        />

        <QuickPaste />

        <ProShortcut
          description={t("preference.shortcut.shortcut.hints.paste_as_plain")}
          isSystem={true}
          onChange={(value) => {
            globalStore.shortcut.pastePlain = value;
          }}
          title={t("preference.shortcut.shortcut.label.paste_as_plain")}
          value={shortcut.pastePlain}
        />
      </ProList>

      <ProList header={t("preference.shortcut.mbutton.title")}>
        <ProListItem
          description={t("preference.shortcut.mbutton.hints.enable")}
          title={t("preference.shortcut.mbutton.label.enable")}
        >
          <Switch
            checked={mbuttonConfig.enable}
            onChange={(value) => {
              globalStore.shortcut.mbuttonOpen = {
                ...mbuttonConfig,
                enable: value,
              };
              syncMbuttonListener(
                value,
                mbuttonConfig.triggerMode,
                mbuttonConfig.delay ?? 500,
              );
            }}
          />
        </ProListItem>

        {mbuttonConfig.enable && (
          <ProListItem
            description={t("preference.shortcut.mbutton.hints.trigger_mode")}
            title={t("preference.shortcut.mbutton.label.trigger_mode")}
          >
            <Space size="middle">
              <Select
                onChange={(value) => {
                  globalStore.shortcut.mbuttonOpen = {
                    ...mbuttonConfig,
                    triggerMode: value,
                  };
                  syncMbuttonListener(
                    mbuttonConfig.enable,
                    value,
                    mbuttonConfig.delay ?? 500,
                  );
                }}
                options={[
                  {
                    label: t("preference.shortcut.mbutton.options.click"),
                    value: "click",
                  },
                  {
                    label: t("preference.shortcut.mbutton.options.long_press"),
                    value: "long_press",
                  },
                ]}
                style={{ width: 120 }}
                value={mbuttonConfig.triggerMode}
              />
              {mbuttonConfig.triggerMode === "long_press" && (
                <Space>
                  <span>{t("preference.shortcut.mbutton.label.delay")}:</span>
                  <InputNumber
                    addonAfter="ms"
                    max={2000}
                    min={300}
                    onChange={(value) => {
                      if (value !== null) {
                        globalStore.shortcut.mbuttonOpen = {
                          ...mbuttonConfig,
                          delay: value,
                        };
                        syncMbuttonListener(
                          mbuttonConfig.enable,
                          mbuttonConfig.triggerMode,
                          value,
                        );
                      }
                    }}
                    step={50}
                    style={{ width: 130 }}
                    value={mbuttonConfig.delay ?? 500}
                  />
                </Space>
              )}
            </Space>
          </ProListItem>
        )}
      </ProList>

      <Preset />
    </>
  );
};

export default Shortcut;
