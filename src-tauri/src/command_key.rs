//! WKWebView does not consistently expose modifier-only key presses.
//! Forward local modifier transitions, leaving all original AppKit events intact.
use block2::RcBlock;
use objc2_app_kit::{NSEvent, NSEventMask, NSEventModifierFlags, NSEventType};
use std::ptr::NonNull;
use tauri::Manager;

pub fn install(app: &tauri::App) {
    let handle = app.handle().clone();
    let block = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        let native = unsafe { event.as_ref() };
        let flags = native.modifierFlags();
        let command = flags.contains(NSEventModifierFlags::Command);
        if native.r#type() != NSEventType::FlagsChanged && !command { return event.as_ptr(); }
        let other = native.r#type() != NSEventType::FlagsChanged || flags.intersects(NSEventModifierFlags::Shift | NSEventModifierFlags::Control | NSEventModifierFlags::Option);
        if let Some(window) = handle.get_webview_window("main") {
            let payload = serde_json::json!({"command": command, "other": other});
            let _ = window.eval(&format!("window.dispatchEvent(new CustomEvent('aboboo-command-modifier',{{detail:{payload}}}))"));
        }
        event.as_ptr()
    });
    // AppKit retains the monitor/block for this application process's lifetime.
    unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::FlagsChanged | NSEventMask::KeyDown | NSEventMask::LeftMouseDown | NSEventMask::RightMouseDown, &block); }
}
