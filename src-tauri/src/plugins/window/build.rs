const COMMANDS: &[&str] = &[
    "show_window",
    "hide_window",
    "show_taskbar_icon",
    "set_window_active_mode",
    "is_window_visible",
    "set_window_pinned",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
