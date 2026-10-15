//! KOMO 桌面外壳（Tauri v2）。
//!
//! 承载四项桌面特性：
//! - 系统托盘：左键唤起/聚焦主窗，右键菜单退出；窗口关闭改为最小化到托盘。
//! - 开机自启：tauri-plugin-autostart（Windows 注册表 Run 键），由前端设置页开关驱动。
//! - 全局快捷键 Ctrl+Alt+K：唤起并聚焦主窗，随后 emit `komo://quick-note`，
//!   前端监听后跳转到「新建对话」入口页。
//! - 窗口状态记忆：tauri-plugin-window-state 自动恢复尺寸/位置。
//!
//! Token 存储由前端经 tauri-plugin-store 读写（见 web/src/lib/desktop），
//! 此处仅注册插件，认证逻辑不在 Rust 侧。

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// 前端监听的「快速记录」事件名。触发后 web 端跳转到新建对话入口。
const QUICK_NOTE_EVENT: &str = "komo://quick-note";
/// 全局快捷键：Ctrl+Alt+K（macOS 上 CmdOrCtrl 映射为 Cmd）。
const QUICK_NOTE_SHORTCUT: &str = "CmdOrCtrl+Alt+K";

/// 显示、取消最小化并聚焦主窗口。
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// 全局快捷键触发：唤起主窗 + 通知前端跳转「新建对话」。
fn trigger_quick_note(app: &tauri::AppHandle) {
    show_main_window(app);
    // payload 为空；前端仅关心事件本身。失败不影响窗口已唤起的结果。
    let _ = app.emit(QUICK_NOTE_EVENT, ());
}

/// 构建系统托盘：左键唤起主窗，右键菜单（显示 / 退出）。
fn setup_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "显示 KOMO", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let mut builder = TrayIconBuilder::with_id("komo-tray")
        .tooltip("KOMO — Knowledge On My Own")
        .menu(&menu)
        // 左键不弹菜单，改为直接唤起主窗（见 on_tray_icon_event）。
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // Phase 2.3：Token 存储（%APPDATA% 明文 JSON，自用威胁模型）。
        .plugin(tauri_plugin_store::Builder::new().build())
        // Phase 3：窗口尺寸/位置记忆。
        .plugin(tauri_plugin_window_state::Builder::new().build())
        // Phase 3：开机自启（前端设置页调用 enable/disable/isEnabled）。
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        // Phase 3：全局快捷键 Ctrl+Alt+K。
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        trigger_quick_note(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            // 注册全局快捷键；失败（如被其他程序占用）不阻断启动，仅告警。
            if let Err(err) = app.global_shortcut().register(QUICK_NOTE_SHORTCUT) {
                eprintln!("[komo] 注册全局快捷键 {QUICK_NOTE_SHORTCUT} 失败: {err}");
            }
            setup_tray(app.handle())?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("构建 KOMO 桌面应用失败");

    app.run(|app_handle, event| {
        // 关闭主窗改为隐藏到托盘（prevent_close + hide），保持后台常驻。
        if let tauri::RunEvent::WindowEvent {
            label,
            event: window_event,
            ..
        } = event
        {
            if label == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = window_event {
                    if let Some(win) = app_handle.get_webview_window("main") {
                        let _ = win.hide();
                    }
                    api.prevent_close();
                }
            }
        }
    });
}
