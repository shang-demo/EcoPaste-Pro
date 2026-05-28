use tauri::{
    generate_handler,
    plugin::{Builder, TauriPlugin},
    Runtime,
};

mod commands;

pub use commands::*;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("eco-window")
        .invoke_handler(generate_handler![
            commands::show_window,
            commands::hide_window,
            commands::show_taskbar_icon,
            commands::set_window_active_mode,
            commands::is_window_visible,
            commands::set_window_pinned,
            commands::set_mbutton_listener_active
        ])
        .build()
}
