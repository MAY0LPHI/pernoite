const ACTIVE_KEY = "vtr_active_session_id";

export function setActiveSession(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}
export function getActiveSession() {
  return localStorage.getItem(ACTIVE_KEY);
}
