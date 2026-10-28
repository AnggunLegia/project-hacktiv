/**
 * ai-studymate/js/storage.js
 * LocalStorage CRUD helpers for notes, summaries, and schedule.
 */

const KEYS = {
  SUMMARIES: 'asm_summaries',
  QUIZ_HISTORY: 'asm_quiz_history',
  EXPLANATIONS: 'asm_explanations',
  SCHEDULE: 'asm_schedule',
  API_KEY: 'asm_api_key',
};

function _get(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; }
  catch { return []; }
}

function _set(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function _getObj(key, fallback = {}) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}

/* --- Summaries --- */
function getSummaries()            { return _get(KEYS.SUMMARIES); }
function saveSummary(entry)        {
  const list = getSummaries();
  list.unshift({ id: Date.now(), ...entry, ts: Date.now() });
  if (list.length > 50) list.length = 50;
  _set(KEYS.SUMMARIES, list);
  return list[0];
}
function deleteSummary(id)         { _set(KEYS.SUMMARIES, getSummaries().filter(x => x.id !== id)); }

/* --- Quiz history --- */
function getQuizHistory()          { return _get(KEYS.QUIZ_HISTORY); }
function saveQuizResult(entry)     {
  const list = getQuizHistory();
  list.unshift({ id: Date.now(), ...entry, ts: Date.now() });
  if (list.length > 50) list.length = 50;
  _set(KEYS.QUIZ_HISTORY, list);
  return list[0];
}

/* --- Explanations --- */
function getExplanations()         { return _get(KEYS.EXPLANATIONS); }
function saveExplanation(entry)    {
  const list = getExplanations();
  list.unshift({ id: Date.now(), ...entry, ts: Date.now() });
  if (list.length > 50) list.length = 50;
  _set(KEYS.EXPLANATIONS, list);
  return list[0];
}

/* --- Schedule --- */
// schedule = { Mon: [{id, text, time, color}], Tue: [...], ... }
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
function getSchedule() {
  const s = _getObj(KEYS.SCHEDULE, {});
  DAYS.forEach(d => { if (!s[d]) s[d] = []; });
  return s;
}
function addScheduleTask(day, task) {
  const s = getSchedule();
  s[day].push({ id: Date.now(), ...task });
  _set(KEYS.SCHEDULE, s);
}
function removeScheduleTask(day, id) {
  const s = getSchedule();
  s[day] = (s[day] || []).filter(t => t.id !== id);
  _set(KEYS.SCHEDULE, s);
}
function clearSchedule() { _set(KEYS.SCHEDULE, {}); }

/* --- API Key --- */
function getApiKey()           { return localStorage.getItem(KEYS.API_KEY) || ''; }
function saveApiKey(key)       { localStorage.setItem(KEYS.API_KEY, key); }

/* --- Aggregate stats --- */
function getStats() {
  return {
    summaries:    getSummaries().length,
    quizzesDone:  getQuizHistory().length,
    explanations: getExplanations().length,
    tasksThisWeek: Object.values(getSchedule()).flat().length,
  };
}

/* --- Recent activity (across all feature types, sorted by ts) --- */
function getRecentActivity(limit = 8) {
  const items = [
    ...getSummaries().map(x    => ({ type:'summary',     icon:'📝', title: x.topic || 'Summary',       desc: x.preview || '', ts: x.ts })),
    ...getExplanations().map(x => ({ type:'explanation', icon:'💡', title: x.concept || 'Explanation',  desc: x.preview || '', ts: x.ts })),
    ...getQuizHistory().map(x  => ({ type:'quiz',        icon:'🧪', title: x.topic   || 'Quiz',         desc: `Score: ${x.score}/${x.total}`, ts: x.ts })),
  ];
  items.sort((a, b) => b.ts - a.ts);
  return items.slice(0, limit);
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}
