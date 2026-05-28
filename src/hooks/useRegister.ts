import {
  isRegistered,
  register,
  type ShortcutHandler,
  unregister,
} from "@tauri-apps/plugin-global-shortcut";
import { listen } from "@tauri-apps/api/event";
import { useAsyncEffect, useUnmount } from "ahooks";
import { castArray } from "es-toolkit/compat";
import { useEffect, useState } from "react";

export const useRegister = (
  handler: ShortcutHandler,
  deps: Array<string | string[] | undefined>,
) => {
  const [oldShortcuts, setOldShortcuts] = useState(deps[0]);

  useEffect(() => {
    const [shortcuts] = deps;
    if (!shortcuts) return;

    const doubleShortcuts = castArray(shortcuts).filter((s) =>
      s.startsWith("Double_"),
    );
    if (doubleShortcuts.length === 0) return;

    let unlisten: (() => void) | undefined;

    const setup = async () => {
      unlisten = await listen<string>(
        "double_modifier_trigger",
        ({ payload }) => {
          if (doubleShortcuts.includes(payload)) {
            handler({ shortcut: payload, state: "Pressed", id: 0 });
          }
        },
      );
    };

    setup();

    return () => {
      unlisten?.();
    };
  }, deps);

  // Win+V 接管触发监听：当快捷键为 Command+V 时，监听后端的接管触发事件以切换窗口显隐
  useEffect(() => {
    const [shortcuts] = deps;
    if (!shortcuts) return;

    const shortcutList = castArray(shortcuts);
    const hasWinV = shortcutList.includes("Command+V");
    if (!hasWinV) return;

    let unlisten: (() => void) | undefined;

    const setup = async () => {
      unlisten = await listen(
        "win_v_takeover_trigger",
        () => {
          handler({ shortcut: "Command+V", state: "Pressed", id: 0 });
        },
      );
    };

    setup();

    return () => {
      unlisten?.();
    };
  }, deps);

  useAsyncEffect(async () => {
    const [shortcuts] = deps;

    for await (const shortcut of castArray(oldShortcuts)) {
      if (!shortcut) continue;
      if (shortcut.startsWith("Double_")) continue;

      if (shortcut === "Command+V") {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_win_v_takeover", { active: false });
        continue;
      }

      const registered = await isRegistered(shortcut);

      if (registered) {
        await unregister(shortcut);
      }
    }

    if (!shortcuts || (typeof shortcuts === 'string' ? shortcuts.startsWith("Double_") : shortcuts[0]?.startsWith("Double_"))) {
      setOldShortcuts(shortcuts);
      return;
    }

    const shortcutStr = typeof shortcuts === 'string' ? shortcuts : shortcuts[0];
    if (shortcutStr === "Command+V") {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_win_v_takeover", { active: true });
      setOldShortcuts(shortcuts);
      return;
    }

    await register(shortcuts, (event) => {
      if (event.state === "Released") return;

      handler(event);
    });

    setOldShortcuts(shortcuts);
  }, deps);

  useUnmount(() => {
    const [shortcuts] = deps;

    if (!shortcuts || (typeof shortcuts === 'string' ? shortcuts.startsWith("Double_") : shortcuts[0]?.startsWith("Double_"))) return;

    const shortcutStr = typeof shortcuts === 'string' ? shortcuts : shortcuts[0];
    if (shortcutStr === "Command+V") {
      import("@tauri-apps/api/core").then(({ invoke }) => {
        invoke("set_win_v_takeover", { active: false });
      });
      return;
    }

    unregister(shortcuts);
  });
};
