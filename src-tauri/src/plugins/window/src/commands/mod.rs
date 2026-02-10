use tauri::{async_runtime::spawn, AppHandle, Emitter, Manager, Runtime, WebviewWindow};

// 主窗口的label
pub static MAIN_WINDOW_LABEL: &str = "main";
// 偏好设置窗口的label
pub static PREFERENCE_WINDOW_LABEL: &str = "preference";
// 主窗口的title
pub static MAIN_WINDOW_TITLE: &str = "EcoPaste";

#[cfg(target_os = "macos")]
mod macos;

#[cfg(not(target_os = "macos"))]
mod not_macos;

#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(not(target_os = "macos"))]
pub use not_macos::*;

// 是否为主窗口
pub fn is_main_window<R: Runtime>(window: &WebviewWindow<R>) -> bool {
    window.label() == MAIN_WINDOW_LABEL
}

// 共享显示窗口的方法
fn shared_show_window<R: Runtime>(window: &WebviewWindow<R>) {
    if is_main_window(window) {
        // 主窗口：不夺焦显示，类似 Windows 自带 Win+V 剪贴板
        show_window_no_activate(window);
    } else {
        // 偏好设置等其他窗口：正常激活显示
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

// Windows 平台：显示窗口后立即恢复原应用焦点（不夺焦效果）
#[cfg(target_os = "windows")]
fn show_window_no_activate<R: Runtime>(window: &WebviewWindow<R>) {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, SetForegroundWindow, GetCursorPos, GetWindowRect,
        IsWindowVisible,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    use windows::Win32::Foundation::{HWND, POINT, RECT};
    use std::time::Duration;

    let app_handle = window.app_handle().clone();

    unsafe {
        // 记住当前前台窗口（用户正在操作的应用）
        let previous = GetForegroundWindow();

        // 通过 Tauri API 显示窗口（保持内部状态一致，isVisible() 等正常工作）
        let _ = window.show();
        let _ = window.unminimize();
        // 注意：不调用 set_focus()

        // 立即恢复原应用的前台焦点
        if !previous.is_invalid() {
            let _ = SetForegroundWindow(previous);
        }
    }

    // 启动后台线程监控窗口外点击，实现"点击窗口外自动隐藏"
    if let Ok(hwnd) = window.hwnd() {
        let hwnd_val = hwnd.0 as usize; // 存为 usize 以安全跨线程
        std::thread::spawn(move || {
            let our_hwnd = HWND(hwnd_val as *mut std::ffi::c_void);
            let start = std::time::Instant::now();

            loop {
                std::thread::sleep(Duration::from_millis(100));

                // 安全超时：60秒
                if start.elapsed() > Duration::from_secs(60) {
                    break;
                }

                unsafe {
                    // 窗口已隐藏（通过快捷键或粘贴）→ 退出
                    if !IsWindowVisible(our_hwnd).as_bool() {
                        break;
                    }

                    // 窗口获得了焦点（用户点击了窗口）→ 让 onBlur 处理
                    let fg = GetForegroundWindow();
                    if fg == our_hwnd {
                        break;
                    }

                    // 检测鼠标左键或右键点击
                    let lbutton = GetAsyncKeyState(0x01); // VK_LBUTTON
                    let rbutton = GetAsyncKeyState(0x02); // VK_RBUTTON

                    if lbutton < 0 || rbutton < 0 {
                        let mut cursor = POINT::default();
                        let _ = GetCursorPos(&mut cursor);

                        let mut rect = RECT::default();
                        let _ = GetWindowRect(our_hwnd, &mut rect);

                        // 点击在窗口外部 → 发送事件隐藏窗口
                        if cursor.x < rect.left || cursor.x > rect.right ||
                           cursor.y < rect.top || cursor.y > rect.bottom {
                            let _ = app_handle.emit("clipboard-outside-click", ());
                            break;
                        }
                    }
                }
            }
        });
    }
}

// 非 Windows 平台：回退到默认显示行为
#[cfg(not(target_os = "windows"))]
fn show_window_no_activate<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

// 共享隐藏窗口的方法
fn shared_hide_window<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.hide();
}

// 显示主窗口
pub fn show_main_window(app_handle: &AppHandle) {
    show_window_by_label(app_handle, MAIN_WINDOW_LABEL);
}

// 显示偏好设置窗口
pub fn show_preference_window(app_handle: &AppHandle) {
    show_window_by_label(app_handle, PREFERENCE_WINDOW_LABEL);
}

// 显示指定 label 的窗口
fn show_window_by_label(app_handle: &AppHandle, label: &str) {
    if let Some(window) = app_handle.get_webview_window(label) {
        let app_handle_clone = app_handle.clone();

        spawn(async move {
            show_window(app_handle_clone, window).await;
        });
    }
}
