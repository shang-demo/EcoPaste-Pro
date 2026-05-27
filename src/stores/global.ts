import { proxy } from "valtio";
import type { GlobalStore } from "@/types/store";

export const globalStore = proxy<GlobalStore>({
  app: {
    autoStart: false,
    showMenubarIcon: true,
    showTaskbarIcon: false,
    silentStart: false,
  },

  appearance: {
    favoriteTags: ["text", "image", "links"],
    isDark: false,
    showFavoriteTags: true,
    theme: "auto",
    viewMode: "top",
  },

  env: {},

  shortcut: {
    clipboard: "Alt+C",
    pastePlain: "",
    preference: "Alt+X",
    quickPaste: {
      enable: false,
      value: "Command+Shift",
    },
  },

  update: {
    auto: false,
    beta: false,
  },
});
