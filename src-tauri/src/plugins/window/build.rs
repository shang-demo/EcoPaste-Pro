const COMMANDS: &[&str] = &["show_window", "hide_window", "show_taskbar_icon", "get_caret_position"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}

