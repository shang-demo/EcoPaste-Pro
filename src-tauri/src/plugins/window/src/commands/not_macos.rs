use super::{is_main_window, shared_hide_window, shared_show_window, MAIN_WINDOW_LABEL};
#[cfg(target_os = "windows")]
use std::sync::Mutex;
use tauri::{command, AppHandle, Emitter, Manager, Runtime, WebviewWindow};
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetWindowLongPtrW, GetWindowRect, IsWindowVisible, SetForegroundWindow,
    SetWindowLongPtrW, SetWindowPos, SetWindowsHookExW, ShowWindow, UnhookWindowsHookEx,
    GWL_EXSTYLE, HC_ACTION, HHOOK, KBDLLHOOKSTRUCT, MSLLHOOKSTRUCT, SWP_FRAMECHANGED, SWP_NOMOVE,
    SWP_NOSIZE, SWP_NOZORDER, SW_HIDE, SW_SHOWNOACTIVATE, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN,
    WM_LBUTTONDOWN, WM_MBUTTONDOWN, WM_RBUTTONDOWN, WM_SYSKEYDOWN, WS_EX_NOACTIVATE, HWND_TOPMOST,
    GetMessageW, MSG, PostThreadMessageW, SWP_NOACTIVATE, SWP_SHOWWINDOW, WM_QUIT,
};
#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::GetCurrentThreadId;
#[cfg(target_os = "windows")]
struct HookState {
    window: Option<WebviewWindow<tauri::Wry>>,
    mouse_hook: Option<HHOOK>,
    kbd_hook: Option<HHOOK>,
    pinned: bool,
}
#[cfg(target_os = "windows")]
unsafe impl Send for HookState {}
#[cfg(target_os = "windows")]
unsafe impl Sync for HookState {}
#[cfg(target_os = "windows")]
static HOOK_STATE: Mutex<HookState> = Mutex::new(HookState {
    window: None,
    mouse_hook: None,
    kbd_hook: None,
    pinned: false,
});
#[cfg(target_os = "windows")]
fn uninstall_hooks_with_handle<R: Runtime>(app_handle: &AppHandle<R>) {
    let app_handle_clone =
        unsafe { &*(app_handle as *const AppHandle<R> as *const AppHandle<tauri::Wry>) }.clone();
    let _ = app_handle_clone.run_on_main_thread(move || {
        let mut state = HOOK_STATE.lock().unwrap();
        if let Some(hook) = state.mouse_hook.take() {
            unsafe {
                let _ = UnhookWindowsHookEx(hook);
            }
        }
        if let Some(hook) = state.kbd_hook.take() {
            unsafe {
                let _ = UnhookWindowsHookEx(hook);
            }
        }
        state.window = None;
    });
}
#[cfg(target_os = "windows")]
unsafe extern "system" fn low_level_mouse_proc(
    code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if code == HC_ACTION as i32 {
        let msg = w_param.0 as u32;
        if msg == WM_LBUTTONDOWN || msg == WM_RBUTTONDOWN || msg == WM_MBUTTONDOWN {
            let mouse = *(l_param.0 as *const MSLLHOOKSTRUCT);
            let pt = mouse.pt;

            let window = {
                let state = HOOK_STATE.lock().unwrap();
                state.window.clone()
            };

            if let Some(window) = window {
                if let Ok(hwnd_ptr) = window.hwnd() {
                    let hwnd = HWND(hwnd_ptr.0 as *mut _);
                    let mut rect = RECT::default();
                    let _ = GetWindowRect(hwnd, &mut rect);

                    let inside = pt.x >= rect.left
                        && pt.x <= rect.right
                        && pt.y >= rect.top
                        && pt.y <= rect.bottom;
                    if !inside {
                        let is_pinned = {
                            let state = HOOK_STATE.lock().unwrap();
                            state.pinned
                        };
                        if !is_pinned {
                            let app_handle = window.app_handle().clone();
                            // 直接使用 Win32 API 隐藏窗口，绕过 Tauri 内部可见性缓存
                            // （因为显示时用了 SW_SHOWNOACTIVATE 绕过了 Tauri，hide() 会被缓存判断跳过）
                            let _ = ShowWindow(hwnd, SW_HIDE);
                            let _ = window.emit("window_hidden", ());
                            uninstall_hooks_with_handle(&app_handle);
                        }
                    } else if msg == WM_LBUTTONDOWN {
                        // 如果点击了窗口内部，且点击的是左键
                        // 判断是否点击在搜索框区域（顶部 65 像素或底部 65 像素）
                        let relative_y = pt.y - rect.top;
                        let height = rect.bottom - rect.top;
                        let in_search_area = relative_y < 65 || relative_y > (height - 65);

                        if in_search_area {
                            // 立即同步移除 WS_EX_NOACTIVATE 属性，使窗口能够正常被 OS 激活
                            let current_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                            let new_style = current_style & !(WS_EX_NOACTIVATE.0 as isize);
                            let _ = SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style);
                            let _ = SetWindowPos(
                                hwnd,
                                HWND(std::ptr::null_mut()),
                                0,
                                0,
                                0,
                                0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
                            );

                            // 立即同步调用 SetForegroundWindow 和 set_focus()
                            // 此时处于系统鼠标按键处理过程中，Windows 保证能够成功转移前台激活焦点
                            let _ = SetForegroundWindow(hwnd);
                            let _ = window.set_focus();

                            // 发送事件让前端聚焦输入框
                            let _ = window.emit("focus_search_input", ());

                            // 卸载钩子（激活后就靠 focus/blur 自行管理了）
                            let app_handle = window.app_handle().clone();
                            uninstall_hooks_with_handle(&app_handle);
                        }
                    }
                }
            }
        }
    }
    CallNextHookEx(None, code, w_param, l_param)
}
#[cfg(target_os = "windows")]
unsafe extern "system" fn low_level_keyboard_proc(
    code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if code == HC_ACTION as i32 {
        let msg = w_param.0 as u32;
        if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
            let kbd = *(l_param.0 as *const KBDLLHOOKSTRUCT);
            let vk = kbd.vkCode;

            let window = {
                let state = HOOK_STATE.lock().unwrap();
                state.window.clone()
            };

            if let Some(window) = window {
                let is_visible = if let Ok(hwnd_ptr) = window.hwnd() {
                    let hwnd = HWND(hwnd_ptr.0 as *mut _);
                    IsWindowVisible(hwnd).as_bool()
                } else {
                    false
                };

                if is_visible {
                    let mut trigger_focus = false;
                    let mut trigger_action = None;

                    if vk == 0x25 || vk == 0x27 || vk == 0xBF || vk == 0x20 {
                        // Left, Right, Slash (/), Space
                        trigger_focus = true;
                    } else if vk == 0x46 {
                        // F key
                        let ctrl_state =
                            windows::Win32::UI::Input::KeyboardAndMouse::GetKeyState(0x11); // VK_CONTROL
                        if (ctrl_state as u16 & 0x8000) != 0 {
                            trigger_focus = true;
                        }
                    } else if vk == 0x26 {
                        // Up Arrow
                        trigger_action = Some("select_prev");
                    } else if vk == 0x28 {
                        // Down Arrow
                        trigger_action = Some("select_next");
                    } else if vk == 0x0D {
                        // Enter
                        trigger_action = Some("paste_active");
                    } else if vk == 0x20 {
                        // Space
                        trigger_action = Some("preview_active");
                    } else if vk == 0x1B {
                        // Escape
                        if let Ok(hwnd_ptr) = window.hwnd() {
                            let hwnd = HWND(hwnd_ptr.0 as *mut _);
                            unsafe {
                                let _ = ShowWindow(hwnd, SW_HIDE);
                            }
                        }
                        let _ = window.emit("window_hidden", ());
                        let app_handle = window.app_handle().clone();
                        uninstall_hooks_with_handle(&app_handle);
                        return LRESULT(1);
                    }

                    if trigger_focus {
                        let _ = window.emit("focus_search_input", ());

                        if let Ok(hwnd_ptr) = window.hwnd() {
                            let hwnd = HWND(hwnd_ptr.0 as *mut _);
                            let current_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                            let new_style = current_style & !(WS_EX_NOACTIVATE.0 as isize);
                            let _ = SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style);
                            let _ = SetWindowPos(
                                hwnd,
                                HWND(std::ptr::null_mut()),
                                0,
                                0,
                                0,
                                0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
                            );
                            let _ = SetForegroundWindow(hwnd);
                        }
                        let _ = window.set_focus();

                        let app_handle = window.app_handle().clone();
                        uninstall_hooks_with_handle(&app_handle);

                        return LRESULT(1);
                    } else if let Some(event_name) = trigger_action {
                        let _ = window.emit(event_name, ());
                        return LRESULT(1); // Consume key!
                    }
                }
            }
        }
    }
    CallNextHookEx(None, code, w_param, l_param)
}
// 显示窗口
#[command]
pub async fn show_window<R: Runtime>(
    _app_handle: AppHandle<R>,
    window: WebviewWindow<R>,
    no_activate: Option<bool>,
    pinned: Option<bool>,
) {
    // 偏好设置等非主窗口绝不进行不夺焦改造，直接显示，避免置于底层
    if !is_main_window(&window) {
        shared_show_window(&window);
        return;
    }
    let no_act = no_activate.unwrap_or(false);
    if no_act {
        #[cfg(target_os = "windows")]
        {
            if let Ok(hwnd_ptr) = window.hwnd() {
                let hwnd = HWND(hwnd_ptr.0 as *mut _);
                unsafe {
                    // 1. 设置 WS_EX_NOACTIVATE 扩展属性，使其点击和显示均不夺焦
                    let current_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                    let new_style = current_style | WS_EX_NOACTIVATE.0 as isize;
                    let _ = SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style);
                    // 2. 用 SW_SHOWNOACTIVATE 原生 Win32 方法无焦点显示，确保绝对不抢占前台输入焦点！
                    let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                    // 3. 强行将窗口置于最顶层 (HWND_TOPMOST)，即使有其他置顶窗口，也能显示在最前，且不夺取焦点
                    let _ = SetWindowPos(
                        hwnd,
                        HWND_TOPMOST,
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
                    );
                }
            }
            let _ = window.unminimize();
            
            // 3. 将全局鼠标/键盘监听钩子全部转移到主 GUI 线程的事件循环中注册，完美解决卡顿问题
            let window_clone = window.clone();
            let raw_window = unsafe {
                &*(&window_clone as *const WebviewWindow<R> as *const WebviewWindow<tauri::Wry>)
            }
            .clone();

            let _ = _app_handle.run_on_main_thread(move || {
                let mut state = HOOK_STATE.lock().unwrap();
                state.pinned = pinned.unwrap_or(false);
                // 确保安全，先清理旧钩子
                if let Some(hook) = state.mouse_hook.take() {
                    unsafe {
                        let _ = UnhookWindowsHookEx(hook);
                    }
                }
                if let Some(hook) = state.kbd_hook.take() {
                    unsafe {
                        let _ = UnhookWindowsHookEx(hook);
                    }
                }

                state.window = Some(raw_window);
                unsafe {
                    let h_instance = windows::Win32::System::LibraryLoader::GetModuleHandleW(None)
                        .unwrap_or_default();
                    match SetWindowsHookExW(WH_MOUSE_LL, Some(low_level_mouse_proc), h_instance, 0)
                    {
                        Ok(m_hook) => {
                            state.mouse_hook = Some(m_hook);
                        }
                        Err(e) => {
                            eprintln!("[EcoPaste] Failed to set mouse hook: {:?}", e);
                        }
                    }
                    match SetWindowsHookExW(
                        WH_KEYBOARD_LL,
                        Some(low_level_keyboard_proc),
                        h_instance,
                        0,
                    ) {
                        Ok(k_hook) => {
                            state.kbd_hook = Some(k_hook);
                        }
                        Err(e) => {
                            eprintln!("[EcoPaste] Failed to set keyboard hook: {:?}", e);
                        }
                    }
                }
            });
        }
        #[cfg(not(target_os = "windows"))]
        {
            shared_show_window(&window);
        }
    } else {
        #[cfg(target_os = "windows")]
        {
            uninstall_hooks_with_handle(&_app_handle);
            // 恢复为正常夺焦样式
            if let Ok(hwnd_ptr) = window.hwnd() {
                let hwnd = HWND(hwnd_ptr.0 as *mut _);
                unsafe {
                    let current_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                    let new_style = current_style & !(WS_EX_NOACTIVATE.0 as isize);
                    let _ = SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style);
                    let _ = SetWindowPos(
                        hwnd,
                        HWND(std::ptr::null_mut()),
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
                    );
                }
            }
        }
        shared_show_window(&window);
    }
}
// 隐藏窗口
#[command]
pub async fn hide_window<R: Runtime>(_app_handle: AppHandle<R>, window: WebviewWindow<R>) {
    #[cfg(target_os = "windows")]
    {
        if is_main_window(&window) {
            uninstall_hooks_with_handle(&_app_handle);
            // 1. 先调用 tauri 的隐藏以同步 tauri 内部缓存状态
            shared_hide_window(&window);
            // 2. 接着直接使用 Win32 API 隐藏窗口，确保在任何情况下（例如不夺焦模式下 Tauri 内部缓存失效时）窗口都能被真正隐藏
            if let Ok(hwnd_ptr) = window.hwnd() {
                let hwnd = HWND(hwnd_ptr.0 as *mut _);
                unsafe {
                    let _ = ShowWindow(hwnd, SW_HIDE);
                }
            }
            return;
        }
    }
    shared_hide_window(&window);
}

// 显示任务栏图标
#[command]
pub async fn show_taskbar_icon<R: Runtime>(
    _app_handle: AppHandle<R>,
    window: WebviewWindow<R>,
    visible: bool,
) {
    let _ = window.set_skip_taskbar(!visible);
}
// 动态开关不夺焦模式
#[command]
pub async fn set_window_active_mode<R: Runtime>(window: WebviewWindow<R>, active: bool) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, SWP_FRAMECHANGED,
            SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_EX_NOACTIVATE,
        };
        if let Ok(hwnd_ptr) = window.hwnd() {
            let hwnd = HWND(hwnd_ptr.0 as *mut _);
            unsafe {
                let current_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                let new_style = if active {
                    current_style & !(WS_EX_NOACTIVATE.0 as isize)
                } else {
                    current_style | WS_EX_NOACTIVATE.0 as isize
                };
                let _ = SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style);
                let _ = SetWindowPos(
                    hwnd,
                    HWND(std::ptr::null_mut()),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
                );
            }
        }
        if active {
            let app_handle = window.app_handle().clone();
            uninstall_hooks_with_handle(&app_handle);
        }
    }
    let _ = window;
}
// 查询窗口可见状态 (Direct OS Query)
#[command]
pub async fn is_window_visible<R: Runtime>(window: WebviewWindow<R>) -> bool {
    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd_ptr) = window.hwnd() {
            let hwnd = HWND(hwnd_ptr.0 as *mut _);
            return unsafe { IsWindowVisible(hwnd).as_bool() };
        }
    }
    window.is_visible().unwrap_or(false)
}

// 动态设置窗口钉住状态
#[command]
pub async fn set_window_pinned(pinned: bool) {
    #[cfg(target_os = "windows")]
    {
        let mut state = HOOK_STATE.lock().unwrap();
        state.pinned = pinned;
    }
}

#[cfg(target_os = "windows")]
struct SendableHhook(HHOOK);
#[cfg(target_os = "windows")]
unsafe impl Send for SendableHhook {}
#[cfg(target_os = "windows")]
unsafe impl Sync for SendableHhook {}

#[cfg(target_os = "windows")]
#[derive(Clone, Copy)]
struct SendableHwnd(HWND);
#[cfg(target_os = "windows")]
unsafe impl Send for SendableHwnd {}
#[cfg(target_os = "windows")]
unsafe impl Sync for SendableHwnd {}

#[cfg(target_os = "windows")]
struct MButtonHookConfig {
    app_handle: Option<AppHandle<tauri::Wry>>,
    main_hwnd: Option<SendableHwnd>,
    trigger_mode: String,
    delay: u64,
}

#[cfg(target_os = "windows")]
static GLOBAL_MOUSE_HOOK: Mutex<Option<SendableHhook>> = Mutex::new(None);

#[cfg(target_os = "windows")]
static MBUTTON_CONFIG: Mutex<MButtonHookConfig> = Mutex::new(MButtonHookConfig {
    app_handle: None,
    main_hwnd: None,
    trigger_mode: String::new(),
    delay: 500,
});

#[cfg(target_os = "windows")]
static MBUTTON_PRESS_TIME: Mutex<Option<std::time::SystemTime>> = Mutex::new(None);

#[cfg(target_os = "windows")]
static MBUTTON_TRIGGERED: Mutex<bool> = Mutex::new(false);

#[cfg(target_os = "windows")]
unsafe fn is_point_inside_visible_hwnd(hwnd: HWND, x: i32, y: i32) -> bool {
    if !IsWindowVisible(hwnd).as_bool() {
        return false;
    }

    let mut rect = RECT::default();
    if GetWindowRect(hwnd, &mut rect).is_ok() {
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    false
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn global_mbutton_proc(
    code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if code == HC_ACTION as i32 {
        let msg = w_param.0 as u32;
        const WM_MBUTTONDOWN: u32 = 0x0207;
        const WM_MBUTTONUP: u32 = 0x0208;

        if msg == WM_MBUTTONDOWN {
            let mouse = *(l_param.0 as *const MSLLHOOKSTRUCT);
            let pt = mouse.pt;

            let (trigger_mode, delay, app_handle) = {
                let config = MBUTTON_CONFIG.lock().unwrap();
                if let Some(hwnd) = config.main_hwnd {
                    if is_point_inside_visible_hwnd(hwnd.0, pt.x, pt.y) {
                        return CallNextHookEx(None, code, w_param, l_param);
                    }
                }

                (
                    config.trigger_mode.clone(),
                    config.delay,
                    config.app_handle.clone(),
                )
            };

            if let Some(app) = app_handle {
                if trigger_mode == "click" {
                    let _ = app.emit("mbutton-triggered", ());
                } else if trigger_mode == "long_press" {
                    *MBUTTON_PRESS_TIME.lock().unwrap() = Some(std::time::SystemTime::now());
                    *MBUTTON_TRIGGERED.lock().unwrap() = false;

                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(delay));
                        let press_time = MBUTTON_PRESS_TIME.lock().unwrap();
                        if let Some(t) = *press_time {
                            if let Ok(elapsed) = t.elapsed() {
                                if elapsed >= std::time::Duration::from_millis(delay) {
                                    let mut triggered = MBUTTON_TRIGGERED.lock().unwrap();
                                    if !*triggered {
                                        *triggered = true;
                                        let _ = app.emit("mbutton-triggered", ());
                                    }
                                }
                            }
                        }
                    });
                }
            }
        } else if msg == WM_MBUTTONUP {
            let _ = MBUTTON_PRESS_TIME.lock().unwrap().take();
        }
    }
    CallNextHookEx(None, code, w_param, l_param)
}

#[cfg(target_os = "windows")]
static HOOK_THREAD_ID: Mutex<Option<u32>> = Mutex::new(None);

#[command]
pub async fn set_mbutton_listener_active<R: Runtime>(
    app_handle: AppHandle<R>,
    active: bool,
    trigger_mode: String,
    delay: u64,
) {
    #[cfg(target_os = "windows")]
    {
        let app_handle_clone = unsafe {
            &*(&app_handle as *const AppHandle<R> as *const AppHandle<tauri::Wry>)
        }
        .clone();
        let main_hwnd = app_handle_clone
            .get_webview_window(MAIN_WINDOW_LABEL)
            .and_then(|window| window.hwnd().ok())
            .map(|hwnd| SendableHwnd(HWND(hwnd.0 as *mut _)));

        {
            let mut config = MBUTTON_CONFIG.lock().unwrap();
            config.app_handle = Some(app_handle_clone);
            config.main_hwnd = main_hwnd;
            config.trigger_mode = trigger_mode.clone();
            config.delay = delay;
        }

        if active {
            let mut thread_id_guard = HOOK_THREAD_ID.lock().unwrap();
            if thread_id_guard.is_none() {
                let (tx, rx) = std::sync::mpsc::channel();
                std::thread::spawn(move || unsafe {
                    let tid = GetCurrentThreadId();
                    let _ = tx.send(tid);

                    let h_instance = windows::Win32::System::LibraryLoader::GetModuleHandleW(None)
                        .unwrap_or_default();
                    match SetWindowsHookExW(WH_MOUSE_LL, Some(global_mbutton_proc), h_instance, 0) {
                        Ok(hook) => {
                            {
                                *GLOBAL_MOUSE_HOOK.lock().unwrap() = Some(SendableHhook(hook));
                            }

                            let mut msg: MSG = std::mem::zeroed();
                            // GetMessageW returns standard BOOL. We check for .0 > 0 (since WM_QUIT is 0 and error is -1)
                            while GetMessageW(
                                &mut msg,
                                windows::Win32::Foundation::HWND(std::ptr::null_mut()),
                                0,
                                0,
                            )
                            .0 > 0
                            {
                                // Pump messages
                            }

                            let hook_to_remove = GLOBAL_MOUSE_HOOK.lock().unwrap().take();
                            if let Some(h) = hook_to_remove {
                                let _ = UnhookWindowsHookEx(h.0);
                            }
                        }
                        Err(e) => {
                            eprintln!("[EcoPaste] Failed to set global middle button mouse hook: {:?}", e);
                        }
                    }
                });

                if let Ok(tid) = rx.recv() {
                    *thread_id_guard = Some(tid);
                }
            }
        } else {
            let mut thread_id_guard = HOOK_THREAD_ID.lock().unwrap();
            if let Some(tid) = thread_id_guard.take() {
                unsafe {
                    let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        #[derive(serde::Serialize, Clone)]
        struct MButtonListenerPayload {
            active: bool,
            trigger_mode: String,
            delay: u64,
        }
        let payload = MButtonListenerPayload {
            active,
            trigger_mode,
            delay,
        };
        let _ = app_handle.emit("mbutton_listener_state", payload);
    }
}
