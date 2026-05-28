const COMMANDS: &[&str] = &[
    "show_window",
    "hide_window",
    "show_taskbar_icon",
    "set_window_active_mode",
    "is_window_visible",
    "set_window_pinned",
    "set_mbutton_listener_active",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
