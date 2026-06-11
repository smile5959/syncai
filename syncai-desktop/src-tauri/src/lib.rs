use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewWindowBuilder,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // static export는 rooms/__placeholder__/ 만 pre-build됨.
            // 실제 room 경로 네비게이션 시 Next.js가 /rooms/<id>/__next.*.txt 를 fetch하는데
            // 해당 파일이 없어 실패. fetch를 가로채서 __placeholder__ 경로로 리다이렉트.
            let spa_script = r#"(function() {
  var origFetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    try {
      var url = input instanceof Request ? input.url : String(input);
      if (url.startsWith('tauri://') || (url.startsWith('/') && !url.startsWith('//'))) {
        var newUrl = url.replace(
          /(\/rooms\/)([^\/]+)(\/(?:__next|index)[^?#]*)/,
          function(match, prefix, id, suffix) {
            return id !== '__placeholder__' ? prefix + '__placeholder__' + suffix : match;
          }
        );
        if (newUrl !== url) { return origFetch(newUrl, init); }
      }
    } catch(e) {}
    return origFetch(input, init);
  };
})();"#;

            let window = WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("/".into()))
                .title("SyncAI")
                .inner_size(1440.0, 900.0)
                .min_inner_size(900.0, 600.0)
                .resizable(true)
                .initialization_script(spa_script)
                .build()?;

            window.open_devtools();

            // 시스템 트레이 설정
            let show = MenuItem::with_id(app, "show", "SyncAI 열기", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
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
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("SyncAI 실행 오류");
}
