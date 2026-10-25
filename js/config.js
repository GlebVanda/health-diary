// Настройки подключения к облаку (Supabase). Пока поля пустые, приложение работает локально, без входа и синхронизации.
//
// supabaseUrl      — адрес проекта: Supabase → Project Settings → API → Project URL
// supabaseAnonKey  — публичный ключ anon/public из того же раздела. Он рассчитан на публикацию в коде:
//                    данные защищает вход по паролю и правила доступа (RLS) в базе. Ключ service_role сюда НЕЛЬЗЯ.
// hosts            — на каких адресах включать синхронизацию, например ['glebvanda.github.io'].
//                    Пустой список — на любых. Рекомендуется указать боевой адрес: тогда превью-версии
//                    и localhost работают в локальном режиме и не трогают реальные данные.
window.HD_CONFIG = {
  supabaseUrl: 'https://qyjqtlziajdgfbbkluuy.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5anF0bHppYWpkZ2ZiYmtsdXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTAwODcsImV4cCI6MjEwODUyNjA4N30.M4xGP88yKpmXoNegYVJP_hpryrkwb8pP8g1v_sXmUkM',
  hosts: ['glebvanda.github.io'], // рабочий адрес GitHub Pages; на localhost и других адресах синхронизация выключена
};
