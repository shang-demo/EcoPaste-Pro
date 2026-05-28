use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub fn set_win_v_takeover(active: bool) {
    #[cfg(target_os = "windows")]
    win32_hook::WIN_V_TAKEOVER_ACTIVE.store(active, Ordering::Relaxed);
}

#[cfg(target_os = "windows")]
fn get_double_click_time() -> Duration {
    unsafe {
        #[link(name = "user32")]
        extern "system" {
            fn GetDoubleClickTime() -> u32;
        }
        let time = GetDoubleClickTime();
        if time > 0 {
            Duration::from_millis(time as u64)
        } else {
            Duration::from_millis(400)
        }
    }
}

#[cfg(target_os = "windows")]
mod win32_hook {
    use super::*;
    use std::sync::Mutex;

    type HHOOK = *mut std::ffi::c_void;
    type HINSTANCE = *mut std::ffi::c_void;
    type HWND = *mut std::ffi::c_void;
    type WPARAM = usize;
    type LPARAM = isize;
    type LRESULT = isize;
    type HOOKPROC =
        Option<unsafe extern "system" fn(code: i32, w_param: WPARAM, l_param: LPARAM) -> LRESULT>;

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct KBDLLHOOKSTRUCT {
        vk_code: u32,
        scan_code: u32,
        flags: u32,
        time: u32,
        dw_extra_info: usize,
    }

    const WH_KEYBOARD_LL: i32 = 13;
    const WM_KEYDOWN: u32 = 0x0100;
    const WM_SYSKEYDOWN: u32 = 0x0104;
    const WM_KEYUP: u32 = 0x0101;
    const WM_SYSKEYUP: u32 = 0x0105;

    const VK_LCONTROL: u32 = 0xA2;
    const VK_RCONTROL: u32 = 0xA3;
    const VK_LMENU: u32 = 0xA4;
    const VK_RMENU: u32 = 0xA5;
    const VK_LSHIFT: u32 = 0xA0;
    const VK_RSHIFT: u32 = 0xA1;
    const VK_LWIN: u32 = 0x5B;
    const VK_RWIN: u32 = 0x5C;

    #[repr(C)]
    struct MSG {
        hwnd: HWND,
        message: u32,
        w_param: WPARAM,
        l_param: LPARAM,
        time: u32,
        pt: [i32; 2],
    }

    #[link(name = "user32")]
    extern "system" {
        fn SetWindowsHookExW(
            id_hook: i32,
            lpfn: HOOKPROC,
            hmod: HINSTANCE,
            dw_thread_id: u32,
        ) -> HHOOK;
        fn UnhookWindowsHookEx(hhk: HHOOK) -> i32;
        fn CallNextHookEx(hhk: HHOOK, n_code: i32, w_param: WPARAM, l_param: LPARAM) -> LRESULT;
        fn GetMessageW(
            lp_msg: *mut MSG,
            hwnd: HWND,
            w_msg_filter_min: u32,
            w_msg_filter_max: u32,
        ) -> i32;
    }

    pub static WIN_V_TAKEOVER_ACTIVE: AtomicBool = AtomicBool::new(false);
    static APP_HANDLE: Mutex<Option<AppHandle>> = Mutex::new(None);
    static STATE: Mutex<Option<(u32, SystemTime)>> = Mutex::new(None);

    unsafe extern "system" fn hook_proc(code: i32, w_param: WPARAM, l_param: LPARAM) -> LRESULT {
        if code >= 0 {
            let msg = w_param as u32;
            if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN || msg == WM_KEYUP || msg == WM_SYSKEYUP {
                let kbd = *(l_param as *const KBDLLHOOKSTRUCT);
                let vk = kbd.vk_code;

                // Win+V Takeover Logic
                if vk == 0x56 && WIN_V_TAKEOVER_ACTIVE.load(Ordering::Relaxed) {
                    #[link(name = "user32")]
                    extern "system" {
                        fn GetAsyncKeyState(v_key: i32) -> i16;
                        fn keybd_event(b_vk: u8, b_scan: u8, dw_flags: u32, dw_extra_info: usize);
                    }
                    let lwin_down = (GetAsyncKeyState(0x5B) as u16 & 0x8000) != 0;
                    let rwin_down = (GetAsyncKeyState(0x5C) as u16 & 0x8000) != 0;
                    if lwin_down || rwin_down {
                        if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
                            keybd_event(0xE8, 0, 0, 0);
                            keybd_event(0xE8, 0, 2, 0);

                            if let Some(app_handle) = &*APP_HANDLE.lock().unwrap() {
                                let _ = app_handle.emit("win_v_takeover_trigger", ());
                            }
                        }
                        return 1;
                    }
                }

                if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
                    let modifier_str = match vk {
                        VK_LCONTROL | VK_RCONTROL => Some("Double_Control"),
                        VK_LMENU | VK_RMENU => Some("Double_Alt"),
                        VK_LSHIFT | VK_RSHIFT => Some("Double_Shift"),
                        VK_LWIN | VK_RWIN => Some("Double_Command"),
                        _ => None,
                    };

                    if let Some(mod_str) = modifier_str {
                        let mut state = STATE.lock().unwrap();
                        let now = SystemTime::now();
                        let threshold = get_double_click_time();

                        if let Some((last_vk, last_time)) = *state {
                            if last_vk == vk {
                                if let Ok(elapsed) = now.duration_since(last_time) {
                                    if elapsed <= threshold && elapsed.as_millis() > 50 {
                                        if let Some(app_handle) = &*APP_HANDLE.lock().unwrap() {
                                            let _ = app_handle.emit("double_modifier_trigger", mod_str);
                                        }
                                        *state = None;
                                        return CallNextHookEx(
                                            std::ptr::null_mut(),
                                            code,
                                            w_param,
                                            l_param,
                                        );
                                    }
                                }
                            }
                        }
                        *state = Some((vk, now));
                    } else {
                        *STATE.lock().unwrap() = None;
                    }
                }
            }
        }
        CallNextHookEx(std::ptr::null_mut(), code, w_param, l_param)
    }

    pub fn start_listener(app_handle: AppHandle) {
        *APP_HANDLE.lock().unwrap() = Some(app_handle);

        std::thread::spawn(move || unsafe {
            let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), std::ptr::null_mut(), 0);

            if !hook.is_null() {
                let mut msg = std::mem::zeroed();
                while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
                    // Pump messages
                }
                UnhookWindowsHookEx(hook);
            }
        });
    }
}

#[cfg(target_os = "windows")]
pub fn start_double_modifier_listener(app_handle: AppHandle) {
    win32_hook::start_listener(app_handle);
}

#[cfg(not(target_os = "windows"))]
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
#[cfg(not(target_os = "windows"))]
use std::sync::Mutex;

#[cfg(not(target_os = "windows"))]
static MBUTTON_ACTIVE: AtomicBool = AtomicBool::new(false);
#[cfg(not(target_os = "windows"))]
static MBUTTON_TRIGGER_MODE: Mutex<String> = Mutex::new(String::new());
#[cfg(not(target_os = "windows"))]
static MBUTTON_DELAY: AtomicU64 = AtomicU64::new(500);

#[cfg(not(target_os = "windows"))]
static MBUTTON_PRESS_TIME: Mutex<Option<SystemTime>> = Mutex::new(None);
#[cfg(not(target_os = "windows"))]
static MBUTTON_TRIGGERED: AtomicBool = AtomicBool::new(false);

#[cfg(not(target_os = "windows"))]
#[derive(serde::Deserialize, Clone, Debug)]
struct MButtonListenerPayload {
    active: bool,
    trigger_mode: String,
    delay: u64,
}

#[cfg(not(target_os = "windows"))]
pub fn start_double_modifier_listener(app_handle: AppHandle) {
    use rdev::{Button, EventType, Key};
    use tauri::Listener;

    let app_handle_clone = app_handle.clone();
    let _ = app_handle.listen("mbutton_listener_state", |event| {
        if let Ok(payload) = serde_json::from_str::<MButtonListenerPayload>(event.payload()) {
            MBUTTON_ACTIVE.store(payload.active, Ordering::Relaxed);
            *MBUTTON_TRIGGER_MODE.lock().unwrap() = payload.trigger_mode;
            MBUTTON_DELAY.store(payload.delay, Ordering::Relaxed);
        }
    });

    let app_handle = app_handle_clone;

    std::thread::spawn(move || {
        let threshold = Duration::from_millis(400); // 400ms default
        let mut last_key: Option<(Key, SystemTime)> = None;

        if let Err(_error) = rdev::listen(move |event| {
            // 1. Process Middle Mouse Button Events
            if MBUTTON_ACTIVE.load(Ordering::Relaxed) {
                match event.event_type {
                    EventType::ButtonPress(Button::Middle) => {
                        *MBUTTON_PRESS_TIME.lock().unwrap() = Some(SystemTime::now());
                        MBUTTON_TRIGGERED.store(false, Ordering::Relaxed);

                        let (trigger_mode, delay) = {
                            let mode = MBUTTON_TRIGGER_MODE.lock().unwrap().clone();
                            let d = MBUTTON_DELAY.load(Ordering::Relaxed);
                            (mode, d)
                        };

                        if trigger_mode == "long_press" {
                            let app = app_handle.clone();
                            std::thread::spawn(move || {
                                std::thread::sleep(Duration::from_millis(delay));
                                let press_time = MBUTTON_PRESS_TIME.lock().unwrap();
                                if let Some(t) = *press_time {
                                    if let Ok(elapsed) = t.elapsed() {
                                        if elapsed >= Duration::from_millis(delay) {
                                            if !MBUTTON_TRIGGERED.load(Ordering::Relaxed) {
                                                MBUTTON_TRIGGERED.store(true, Ordering::Relaxed);
                                                let _ = app.emit("mbutton-triggered", ());
                                            }
                                        }
                                    }
                                }
                            });
                        }
                    }
                    EventType::ButtonRelease(Button::Middle) => {
                        let press_time = MBUTTON_PRESS_TIME.lock().unwrap().take();
                        let triggered = MBUTTON_TRIGGERED.load(Ordering::Relaxed);

                        let trigger_mode = MBUTTON_TRIGGER_MODE.lock().unwrap().clone();

                        if !triggered && trigger_mode == "click" {
                            if let Some(t) = press_time {
                                if let Ok(elapsed) = t.elapsed() {
                                    if elapsed < Duration::from_millis(300) {
                                        let _ = app_handle.emit("mbutton-triggered", ());
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }

            // 2. Keyboard Events (Original logic)
            if let EventType::KeyPress(key) = event.event_type {
                let now = SystemTime::now();

                let modifier_str = match key {
                    Key::ControlLeft | Key::ControlRight => Some("Double_Control"),
                    Key::Alt | Key::AltGr => Some("Double_Alt"),
                    Key::ShiftLeft | Key::ShiftRight => Some("Double_Shift"),
                    Key::MetaLeft | Key::MetaRight => Some("Double_Command"),
                    _ => None,
                };

                if let Some(mod_str) = modifier_str {
                    if let Some((last_k, last_time)) = last_key {
                        if last_k == key {
                            if let Ok(elapsed) = now.duration_since(last_time) {
                                if elapsed <= threshold && elapsed.as_millis() > 50 {
                                    let _ = app_handle.emit("double_modifier_trigger", mod_str);
                                    last_key = None;
                                    return;
                                }
                            }
                        }
                    }
                    last_key = Some((key, now));
                } else {
                    last_key = None;
                }
            }
        }) {
            eprintln!("Error starting rdev double-modifier listener");
        }
    });
}
