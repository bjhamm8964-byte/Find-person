const DB_NAME = "find-person-private-v1";
const STORE_NAME = "payload";
function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
let TODAY = localDateKey();
const STATUS_ORDER = ["在班", "请假", "宿舍", "医务室", "办公室", "校内活动", "离校", "未知", "待确认"];
const IMPRESSION_OPTIONS = ["主动执行","提醒后完成","需反复确认","直接交代有效","宜单独交代","当众提醒易抵触","状态稳定","容易分心","情绪波动","劳动积极","组织能力","同伴影响明显"];
const DISCIPLINE_TYPES = ["课堂","作业","宿舍","卫生","安全","其他"];
const DISCIPLINE_LEVELS = ["轻微","一般","严重"];
const CADRE_ROLES = ["班长","副班长","学习委员","劳动委员","纪律委员","体育委员","生活委员","课代表"];
const DUTY_ROLES = [
  { id: "floor", label: "教室走廊委员", description: "扫拖、擦窗扶手与收尾" },
  { id: "zone1", label: "1号区委员", description: "1号区点名与验收" },
  { id: "zone2", label: "2号区委员", description: "2号区点名与验收" },
];
const placeholderImage = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="40" fill="#dce9df"/><circle cx="100" cy="76" r="38" fill="#6c8c7d"/><path d="M35 185c5-45 31-69 65-69s60 24 65 69" fill="#6c8c7d"/></svg>`);

const state = {
  studentsPack: null, duty: null, dorm: null, seating: null, whereabouts: {}, leaves: {},
  history: {}, autoArchive: true, management: {}, dutyOps: { commissioners: {}, days: {}, debts: {} },
  mode: "find", query: "", genderFilter: "all", findLayout: localStorage.getItem("find-person-layout") === "grid" ? "grid" : "cards", seatingEdit: false, seatingPerspective: "teacher", currentPerson: null, pendingPhoto: null,
  impressionDraft: [], disciplineTypeDraft: "课堂", disciplineLevelDraft: "轻微",
  commissionerRole: "floor", dutyAction: null, dutyActionSelection: new Set(),
  viewerNames: [], viewerIndex: 0,
  picked: new Set(JSON.parse(localStorage.getItem("find-person-picked") || "[]")),
};
const $ = (id) => document.getElementById(id);
const ids = [
  "setup","app","studentSetupFile","seatingSetupPrintFile","dataButton","dataDialog","dataStatus","dutyDataStatus","dormDataStatus","seatingDataStatus","managementDataStatus","studentFile","dutyFile","dormFile","seatingFile","managementFile","exportStudents","exportDuty","exportDorm","exportSeating","exportManagement","forgetData",
  "searchPanel","searchInput","clearSearch","searchHint","genderFilters","findView","seatingView","dutyView","dormView","whereView","batchView","studentRail","resultTitle","resultCount","layoutToggle","browseTip","batchCount","seatingDate","seatingCount","seatingBoard","seatingNotice","seatingEditToggle","seatingExportQuick","seatingPrintFile","seatingPrintButton","seatingPerspectiveToggle","seatingPrintTitle","seatingPrintMeta","seatingPrintInstruction",
  "dateLabel","dutyTitle","daySelect","dutyWeekNotice","dutyList","dutyTeamButton","commissionerStrip","dutyDebtList","commissionerDialog","commissionerRoleButtons","commissionerSearch","clearCommissioner","commissionerCandidates","dutyActionDialog","dutyActionEyebrow","dutyActionTitle","dutyActionHint","dutyActionCandidates","saveDutyAction","dormTitle","dormCount","dormList","whereDate","whereSummary","whereGroups","resetWhere","autoArchive","archiveStatus","saveToday","openHistory","exportTodayDuty","exportHistory","historyDialog","historyDay","historySummary","historyRecords","historyExport",
  "pickedList","batchNote","copyBatch","clearBatch","personDialog","personHero","personName","personPhoto","personPinyin","personRole","personDorm","personPrev","personNext","personPick","togglePersonEditor","personEditor","closePersonEditor","personStatus","personStatusButtons","leaveUntilWrap","leaveUntil","personNote","personPhotoFile","savePerson",
  "personManagement","closeManagement","managementTitle","managementSummaryView","impressionSummary","managementNote","leaveCount","awayCount","disciplineCount","disciplineLevel","advancementLevel","latestDiscipline","toggleCadre","editImpression","addDiscipline","cadreEditor","cadreRoleButtons","cadreRoleInput","removeCadre","cancelCadre","saveCadre","impressionEditor","impressionButtons","managementNoteInput","cancelImpression","saveImpression","disciplineEditor","disciplineTypeButtons","disciplineSeverityButtons","disciplineFact","cancelDiscipline","saveDiscipline","toast"
];
const els = Object.fromEntries(ids.map((id) => [id, $(id)]));

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function dbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result ?? null); req.onerror = () => reject(req.error);
  });
}
async function dbSet(key, value) {
  if (value === undefined) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite"); tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}
async function clearDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite"); tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}

function parseDataJS(text) {
  const match = text.match(/^\s*(?:window\.)?(FIND_PERSON_[A-Z_]+)\s*=\s*([\s\S]*?)\s*;?\s*$/);
  if (!match) throw new Error("不是有效的找人数据包");
  return { variable: match[1], payload: JSON.parse(match[2]) };
}
function validateStudents(payload) {
  if (!Array.isArray(payload.students) || !payload.students.length) throw new Error("学生总库缺少 students");
  const names = payload.students.map((s) => s.name);
  if (new Set(names).size !== names.length) throw new Error("学生总库存在重复姓名");
}
function validateDuty(payload) { if (!payload?.days || typeof payload.days !== "object") throw new Error("值日数据缺少 days"); }
function validateDorm(payload) { if (!Array.isArray(payload?.rooms)) throw new Error("宿舍数据缺少 rooms"); }
function validateSeating(payload) {
  if (!Array.isArray(payload?.groups) || payload.groups.length !== 4) throw new Error("座位数据应包含四个座位组");
  const names = payload.groups.flatMap((group) => (group.rows || []).flat()).filter(Boolean);
  if (!names.length) throw new Error("座位数据没有学生姓名");
  if (new Set(names).size !== names.length) throw new Error("座位数据存在重复姓名");
}
function validateManagement(payload) { if (!payload?.profiles || typeof payload.profiles !== "object" || Array.isArray(payload.profiles)) throw new Error("管理记录缺少 profiles"); }

function normalizeDutyOps(value) {
  return {
    commissioners: value?.commissioners && typeof value.commissioners === "object" ? value.commissioners : {},
    days: value?.days && typeof value.days === "object" ? value.days : {},
    debts: value?.debts && typeof value.debts === "object" ? value.debts : {},
  };
}
function mergeDutyCommissioners(payload) {
  if (!payload?.commissioners) return;
  DUTY_ROLES.forEach((role) => {
    if (!(role.id in state.dutyOps.commissioners) && payload.commissioners[role.id]) state.dutyOps.commissioners[role.id] = payload.commissioners[role.id];
  });
}

async function importDataFile(file, expectedKind = "auto") {
  if (!file) return;
  try {
    const { variable, payload } = parseDataJS(await file.text());
    if (variable === "FIND_PERSON_PRIVATE_DATA") {
      validateStudents(payload);
      state.studentsPack = { version: payload.version, className: payload.className, students: payload.students };
      state.duty = payload.duty || state.duty; state.dorm = payload.dorm || state.dorm; state.seating = payload.seating || state.seating;
      mergeDutyCommissioners(state.duty); await Promise.all([dbSet("students", state.studentsPack), dbSet("duty", state.duty), dbSet("dorm", state.dorm), dbSet("seating", state.seating), dbSet("duty-ops-v1",state.dutyOps)]);
    } else if (variable === "FIND_PERSON_STUDENTS_DATA" && ["auto","students"].includes(expectedKind)) {
      validateStudents(payload); state.studentsPack = payload; await dbSet("students", payload);
    } else if (variable === "FIND_PERSON_DUTY_DATA" && ["auto","duty"].includes(expectedKind)) {
      validateDuty(payload); state.duty = payload; mergeDutyCommissioners(payload); await Promise.all([dbSet("duty", payload),dbSet("duty-ops-v1",state.dutyOps)]);
    } else if (variable === "FIND_PERSON_DORM_DATA" && ["auto","dorm"].includes(expectedKind)) {
      validateDorm(payload); state.dorm = payload; await dbSet("dorm", payload);
    } else if (variable === "FIND_PERSON_SEATING_DATA" && ["auto","seating"].includes(expectedKind)) {
      validateSeating(payload); state.seating = payload; await dbSet("seating", payload);
    } else if (variable === "FIND_PERSON_MANAGEMENT_DATA" && ["auto","management"].includes(expectedKind)) {
      validateManagement(payload); state.management = payload.profiles; if (payload.dutyOps) state.dutyOps = normalizeDutyOps(payload.dutyOps); await Promise.all([dbSet("management-v1", state.management),dbSet("duty-ops-v1",state.dutyOps)]);
    } else throw new Error("数据包类型与导入口不一致");
    state.picked = new Set([...state.picked].filter((name) => studentByName(name)));
    persistPicked(); renderAll();
    if (state.studentsPack && state.autoArchive) await saveDailySnapshot("数据更新");
    els.dataDialog.close(); toast(`已导入 ${file.name}`); return true;
  } catch (error) { toast(error.message || "导入失败"); return false; }
  finally { [els.studentSetupFile,els.seatingSetupPrintFile,els.studentFile,els.dutyFile,els.dormFile,els.seatingFile,els.seatingPrintFile,els.managementFile].forEach((input) => { input.value = ""; }); }
}

async function exportJS(variable, payload, filename) {
  if (!payload) return toast("当前没有可导出的数据");
  const file = new File([`window.${variable} = ${JSON.stringify(payload, null, 2)};\n`], filename, { type: "text/javascript" });
  return shareOrDownload(file);
}

async function shareOrDownload(file) {
  try {
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: file.name }); toast("已打开分享菜单"); return;
    }
  } catch (error) { if (error.name === "AbortError") return; }
  const url = URL.createObjectURL(file); const link = document.createElement("a");
  link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast("已导出文件");
}

function students() { return state.studentsPack?.students || []; }
function activeStudents() { return students().filter((s) => s.active !== false); }
function studentByName(name) { return students().find((s) => s.name === name); }
function imageFor(student) { return student?.image || placeholderImage; }
function normalize(value) { return String(value || "").toLowerCase().replace(/[\s'·-]/g, ""); }
function isSubsequence(needle, haystack) { let i = 0; for (const ch of haystack) if (ch === needle[i]) i += 1; return i === needle.length; }
function editDistance(a, b) {
  const row = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i += 1) { let prev = row[0]; row[0] = i; for (let j = 1; j <= b.length; j += 1) { const old = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = old; } }
  return row[b.length];
}
function scoreStudent(student, rawQuery) {
  const q = normalize(rawQuery); if (!q) return 1;
  const fields = [student.name, student.pinyin, student.initials, student.origin, student.hometown, student.household, ...(student.aliases || [])].map(normalize);
  if (fields.some((f) => f === q)) return 100;
  if (fields.some((f) => f.startsWith(q))) return 80;
  if (fields.some((f) => f.includes(q))) return 65;
  if (q.length > 1 && fields.some((f) => isSubsequence(q, f))) return 45;
  if (q.length >= 3 && fields.some((f) => Math.abs(f.length - q.length) <= 2 && editDistance(q, f) <= 2)) return 25;
  return 0;
}
function filteredStudents() {
  const candidates = activeStudents().filter((student) => state.genderFilter === "all" || (state.genderFilter === "cadre" ? profileFor(student.name).isCadre : student.gender === state.genderFilter));
  const ranked = candidates.map((student, index) => ({ student, index, score: scoreStudent(student, state.query) })).sort((a,b) => b.score - a.score || a.index - b.index);
  const confident = ranked.filter((item) => item.score >= 45);
  return (confident.length ? confident : ranked.filter((item) => item.score > 0)).map((item) => item.student);
}

function statusFor(name) {
  const leave = state.leaves[name];
  if (leave) return !leave.until || leave.until >= TODAY ? "请假" : "待确认";
  return state.whereabouts[name]?.status || "在班";
}
function noteFor(name) { return state.leaves[name]?.note || state.whereabouts[name]?.note || ""; }
function statusClass(status) { return `status-${({"在班":"in","请假":"leave","待确认":"check"}[status] || "away")}`; }
function dormFor(name) {
  for (const room of state.dorm?.rooms || []) {
    const member = room.members.find((m) => (typeof m === "string" ? m : m.name) === name);
    if (member) return { room, member: typeof member === "string" ? { name: member } : member };
  }
  return null;
}
function emptyNode(text) { const node = document.createElement("p"); node.className = "empty"; node.textContent = text; return node; }

function currentRecords() {
  return activeStudents().map((student) => ({
    name: student.name,
    status: statusFor(student.name),
    note: noteFor(student.name),
    leaveUntil: state.leaves[student.name]?.until || "",
  }));
}
function countStatuses(records = currentRecords()) {
  return records.reduce((counts, record) => {
    counts[record.status] = (counts[record.status] || 0) + 1;
    return counts;
  }, {});
}
function formatTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}
async function persistCurrentState() {
  await Promise.all([
    dbSet("where:current", state.whereabouts),
    dbSet(`where:${TODAY}`, state.whereabouts),
    dbSet("leaves", state.leaves),
  ]);
}
async function saveDailySnapshot(source = "自动留存", announce = false) {
  if (!state.studentsPack) return;
  const records = currentRecords();
  const existing = state.history[TODAY] || {};
  state.history[TODAY] = {
    date: TODAY,
    savedAt: new Date().toISOString(),
    source,
    activeCount: records.length,
    counts: countStatuses(records),
    records,
    events: Array.isArray(existing.events) ? existing.events : [],
  };
  await dbSet("attendance-history-v1", state.history);
  renderArchiveStatus();
  if (els.historyDialog.open) renderHistoryDialog(TODAY);
  if (announce) toast("今日去向已留存");
}
function renderArchiveStatus() {
  if (!els.archiveStatus) return;
  if (!state.autoArchive) {
    els.archiveStatus.textContent = "自动留存已关闭；去向仍会跨日延续，可手动保存今日。";
    return;
  }
  const entry = state.history[TODAY];
  if (!entry?.savedAt) {
    els.archiveStatus.textContent = "自动留存已开启；首次打开或状态变化时会保存今日快照。";
    return;
  }
  const present = entry.counts?.["在班"] || 0;
  els.archiveStatus.textContent = `今日最近留存 ${formatTime(entry.savedAt)} · 在班 ${present}/${entry.activeCount || 0} · 状态会跨日延续`;
}
function renderHistoryDialog(preferredDay = "") {
  const dates = Object.keys(state.history).sort().reverse();
  const selected = dates.includes(preferredDay) ? preferredDay : (dates.includes(els.historyDay.value) ? els.historyDay.value : dates[0]);
  els.historyDay.replaceChildren(...dates.map((date) => new Option(date, date)));
  els.historyRecords.replaceChildren();
  if (!selected) {
    els.historySummary.textContent = "暂无历史记录。可先点“保存今日”。";
    els.historyRecords.append(emptyNode("还没有可回溯的每日快照"));
    return;
  }
  els.historyDay.value = selected;
  const entry = state.history[selected] || {};
  const counts = entry.counts || countStatuses(entry.records || []);
  const summary = STATUS_ORDER.filter((status) => counts[status]).map((status) => `${status} ${counts[status]}`).join(" · ");
  els.historySummary.textContent = `${summary || "无学生记录"} · ${entry.savedAt ? `保存于 ${new Date(entry.savedAt).toLocaleString("zh-CN")}` : "未标注保存时间"}`;
  STATUS_ORDER.forEach((status) => {
    const records = (entry.records || []).filter((record) => record.status === status);
    if (!records.length) return;
    const section = document.createElement("section"); section.className = "history-record-group";
    const heading = document.createElement("strong"); heading.textContent = `${status} · ${records.length} 人`;
    const names = document.createElement("p"); names.textContent = records.map((record) => record.note ? `${record.name}（${record.note}）` : record.name).join("、");
    section.append(heading, names); els.historyRecords.append(section);
  });
  if (entry.events?.length) {
    const section = document.createElement("section"); section.className = "history-record-group";
    const heading = document.createElement("strong"); heading.textContent = `当日变更 · ${entry.events.length} 条`;
    const events = document.createElement("p"); events.textContent = entry.events.map((event) => `${formatTime(event.at)} ${event.name}：${event.from} → ${event.to}`).join("；");
    section.append(heading, events); els.historyRecords.append(section);
  }
}
function csvCell(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
async function exportAttendanceHistory() {
  const dates = Object.keys(state.history).sort();
  if (!dates.length) return toast("还没有可导出的去向记录");
  const rows = [["记录类型","日期","时间","姓名","状态","原状态","备注","请假至","当日在班","在读总数"]];
  dates.forEach((date) => {
    const entry = state.history[date]; const present = entry.counts?.["在班"] || 0;
    (entry.records || []).forEach((record) => rows.push(["每日快照",date,formatTime(entry.savedAt),record.name,record.status,"",record.note || "",record.leaveUntil || "",present,entry.activeCount || ""]));
    (entry.events || []).forEach((event) => rows.push(["状态变更",date,formatTime(event.at),event.name,event.to,event.from,event.note || "",event.leaveUntil || "",present,entry.activeCount || ""]));
  });
  const csv = `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  await shareOrDownload(new File([csv], `whereabouts-history-${TODAY}.csv`, { type: "text/csv;charset=utf-8" }));
}
async function exportTodayForDuty() {
  const payload = {
    version: "2026-09-17",
    className: state.studentsPack?.className || "班级",
    date: TODAY,
    generatedAt: new Date().toISOString(),
    records: currentRecords(),
  };
  await exportJS("FIND_PERSON_WHEREABOUTS_DATA", payload, `whereabouts-${TODAY}.js`);
}

function profileFor(name) {
  const profile = state.management[name] || {};
  return {
    impressionTags: Array.isArray(profile.impressionTags) ? profile.impressionTags.filter((tag) => IMPRESSION_OPTIONS.includes(tag)).slice(0,3) : [],
    workNote: String(profile.workNote || ""),
    isCadre: profile.isCadre === true,
    cadreRole: String(profile.cadreRole || "").trim().slice(0,20),
    discipline: Array.isArray(profile.discipline) ? profile.discipline : [],
    advancement: profile.advancement || null,
    updatedAt: profile.updatedAt || "",
  };
}
function whereaboutsCounts(name) {
  let leave = 0; let away = 0;
  Object.values(state.history).forEach((entry) => {
    (entry?.events || []).forEach((event) => {
      if (event.name !== name || event.from === event.to) return;
      if (event.to === "请假") leave += 1;
      if (event.to === "离校") away += 1;
    });
  });
  if (leave === 0 && statusFor(name) === "请假") leave = 1;
  if (away === 0 && statusFor(name) === "离校") away = 1;
  return { leave, away };
}
function highestDisciplineLevel(records) {
  return records.reduce((highest, record) => DISCIPLINE_LEVELS.indexOf(record.level) > DISCIPLINE_LEVELS.indexOf(highest) ? record.level : highest, "");
}
function setManagementView(view = "summary") {
  els.managementSummaryView.classList.toggle("hidden", view !== "summary");
  els.cadreEditor.classList.toggle("hidden", view !== "cadre");
  els.impressionEditor.classList.toggle("hidden", view !== "impression");
  els.disciplineEditor.classList.toggle("hidden", view !== "discipline");
}
function renderManagementSummary() {
  const name = state.currentPerson; if (!name) return;
  const profile = profileFor(name); const counts = whereaboutsCounts(name); const discipline = profile.discipline;
  els.managementTitle.textContent = `${name} · 管理摘要`;
  els.toggleCadre.textContent = profile.isCadre ? (profile.cadreRole || "编辑班干") : "设为班干";
  els.toggleCadre.classList.toggle("selected", profile.isCadre);
  els.impressionSummary.replaceChildren();
  if (profile.impressionTags.length) profile.impressionTags.forEach((tag) => { const chip = document.createElement("span"); chip.className = "impression-chip"; chip.textContent = tag; els.impressionSummary.append(chip); });
  else { const empty = document.createElement("span"); empty.className = "impression-empty"; empty.textContent = "尚未添加第一印象"; els.impressionSummary.append(empty); }
  els.managementNote.textContent = profile.workNote ? `工作提示：${profile.workNote}` : "";
  els.leaveCount.textContent = counts.leave; els.awayCount.textContent = counts.away; els.disciplineCount.textContent = discipline.length;
  els.disciplineLevel.textContent = highestDisciplineLevel(discipline) || "无";
  els.advancementLevel.textContent = profile.advancement?.label || "待段考数据";
  const latest = [...discipline].sort((a,b) => String(b.at).localeCompare(String(a.at)))[0];
  const latestDate = latest?.at ? localDateKey(new Date(latest.at)) : "";
  els.latestDiscipline.textContent = latest ? `最近记录：${latestDate} · ${latest.type} · ${latest.level}${latest.fact ? ` · ${latest.fact}` : ""}` : "暂无违纪记录";
}
function renderCadreRolePicker() {
  const current = els.cadreRoleInput.value.trim();
  els.cadreRoleButtons.replaceChildren();
  CADRE_ROLES.forEach((role) => {
    const button = document.createElement("button"); button.type = "button"; button.className = `quick-option${role === current ? " selected" : ""}`; button.textContent = role;
    button.addEventListener("click", () => { els.cadreRoleInput.value = role; renderCadreRolePicker(); });
    els.cadreRoleButtons.append(button);
  });
}
function openCadreEditor() {
  const profile = profileFor(state.currentPerson); els.cadreRoleInput.value = profile.cadreRole;
  els.removeCadre.classList.toggle("hidden", !profile.isCadre); renderCadreRolePicker(); setManagementView("cadre");
}
async function saveCadre() {
  const name = state.currentPerson; if (!name) return;
  const profile = profileFor(name); profile.isCadre = true; profile.cadreRole = els.cadreRoleInput.value.trim() || "班干"; profile.updatedAt = new Date().toISOString(); state.management[name] = profile;
  await dbSet("management-v1",state.management); renderManagementSummary(); setManagementView("summary"); showViewerRole(name); renderStudents(); renderDataStatus(); toast(`已保存 ${name} · ${profile.cadreRole}`);
}
async function removeCadreRole() {
  const name = state.currentPerson; if (!name) return;
  const profile = profileFor(name); profile.isCadre = false; profile.cadreRole = ""; profile.updatedAt = new Date().toISOString(); state.management[name] = profile;
  await dbSet("management-v1",state.management); renderManagementSummary(); setManagementView("summary"); showViewerRole(name); renderStudents(); renderDataStatus(); toast(`已取消 ${name} 的班干身份`);
}
function renderImpressionPicker() {
  els.impressionButtons.replaceChildren();
  IMPRESSION_OPTIONS.forEach((tag) => {
    const button = document.createElement("button"); button.type = "button"; button.className = `quick-option${state.impressionDraft.includes(tag) ? " selected" : ""}`; button.textContent = tag;
    button.addEventListener("click", () => {
      if (state.impressionDraft.includes(tag)) state.impressionDraft = state.impressionDraft.filter((item) => item !== tag);
      else if (state.impressionDraft.length >= 3) return toast("第一印象最多选择 3 个");
      else state.impressionDraft.push(tag);
      renderImpressionPicker();
    });
    els.impressionButtons.append(button);
  });
}
function renderSinglePicker(container, options, selected, onSelect) {
  container.replaceChildren();
  options.forEach((value) => {
    const button = document.createElement("button"); button.type = "button"; button.dataset.value = value; button.className = `quick-option${value === selected ? " selected" : ""}`; button.textContent = value;
    button.addEventListener("click", () => onSelect(value)); container.append(button);
  });
}
function renderDisciplinePickers() {
  renderSinglePicker(els.disciplineTypeButtons, DISCIPLINE_TYPES, state.disciplineTypeDraft, (value) => { state.disciplineTypeDraft = value; renderDisciplinePickers(); });
  renderSinglePicker(els.disciplineSeverityButtons, DISCIPLINE_LEVELS, state.disciplineLevelDraft, (value) => { state.disciplineLevelDraft = value; renderDisciplinePickers(); });
}
function openManagementSummary() {
  els.personEditor.classList.add("hidden"); renderManagementSummary(); setManagementView("summary"); els.personManagement.classList.remove("hidden");
}
async function saveImpression() {
  const name = state.currentPerson; if (!name) return;
  const profile = profileFor(name); profile.impressionTags = [...state.impressionDraft]; profile.workNote = els.managementNoteInput.value.trim(); profile.updatedAt = new Date().toISOString(); state.management[name] = profile;
  await dbSet("management-v1", state.management); renderManagementSummary(); setManagementView("summary"); renderDataStatus(); toast("第一印象已保存");
}
async function saveDiscipline() {
  const name = state.currentPerson; if (!name) return;
  const profile = profileFor(name); profile.discipline.push({ id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, at: new Date().toISOString(), type: state.disciplineTypeDraft, level: state.disciplineLevelDraft, fact: els.disciplineFact.value.trim() }); profile.updatedAt = new Date().toISOString(); state.management[name] = profile;
  await dbSet("management-v1", state.management); els.disciplineFact.value = ""; renderManagementSummary(); setManagementView("summary"); renderDataStatus(); toast("违纪记录已保存");
}
function managementExportPayload() { return { version: 3, updatedAt: new Date().toISOString(), profiles: state.management, dutyOps: state.dutyOps }; }
function dutyExportPayload() { return state.duty ? { ...state.duty, commissioners: { ...state.dutyOps.commissioners } } : null; }

function persistPicked() { localStorage.setItem("find-person-picked", JSON.stringify([...state.picked])); els.batchCount.textContent = state.picked.size ? String(state.picked.size) : ""; }
function togglePick(name) {
  const adding = !state.picked.has(name); adding ? state.picked.add(name) : state.picked.delete(name);
  if (state.mode === "batch" && adding) { state.query = ""; els.searchInput.value = ""; }
  persistPicked(); renderStudents(); renderPicked(); toast(adding ? `已加入 ${name}` : `已移除 ${name}`);
}

function studentCard(student) {
  const status = statusFor(student.name); const card = document.createElement("button"); card.type = "button";
  card.className = `student-card${state.picked.has(student.name) ? " picked" : ""}${student.image ? "" : " placeholder"}`;
  card.setAttribute("aria-label", `${student.name}，${status}`);
  const meta = [student.pinyin, student.origin].filter(Boolean).join(" · ");
  card.innerHTML = `<img alt="${student.name}" src="${imageFor(student)}"><span class="gender-chip">${student.gender || "学生"}</span>${status !== "在班" ? `<span class="status-chip ${statusClass(status)}">${status}</span>` : ""}<span class="pick-mark">✓</span><span class="card-copy"><span class="card-name">${student.name}</span><span class="card-pinyin">${meta}</span></span>`;
  card.addEventListener("click", () => state.mode === "batch" ? togglePick(student.name) : openPerson(student.name, filteredStudents().map((item) => item.name))); return card;
}
function renderStudents() {
  if (!state.studentsPack) return; const list = filteredStudents();
  const batchSearch = state.mode === "batch";
  els.findView.classList.toggle("hidden", state.mode !== "find" && !(batchSearch && state.query));
  els.layoutToggle.classList.toggle("hidden", state.mode !== "find");
  els.studentRail.classList.toggle("grid-view", batchSearch || state.findLayout === "grid");
  els.layoutToggle.textContent = state.findLayout === "grid" ? "大图滑动" : "网格一览";
  els.browseTip.textContent = state.findLayout === "grid" ? "点照片查看详情" : "左右滑动查看 · 点头像可标记请假、去向或补照片";
  els.browseTip.classList.toggle("hidden", batchSearch);
  const genderLabel = state.genderFilter === "男" ? "男生" : state.genderFilter === "女" ? "女生" : state.genderFilter === "cadre" ? "班干" : "全班同学";
  els.resultTitle.textContent = batchSearch ? "搜索结果" : (state.query ? `搜索“${state.query}”` : genderLabel); els.resultCount.textContent = `${list.length} 人`;
  els.genderFilters.querySelectorAll("[data-gender]").forEach((button) => { const active = button.dataset.gender === state.genderFilter; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
  els.searchHint.textContent = batchSearch ? (state.query ? "轻点照片加入，随后自动返回已选名单" : "输入姓名或拼音添加；未搜索时只显示已选人员") : "支持姓名、全拼、首字母、生源地和少量拼写误差";
  els.studentRail.replaceChildren();
  if (!list.length) { els.studentRail.append(emptyNode("没有找到，试试更短的拼音或首字母")); return; }
  list.forEach((student) => els.studentRail.append(studentCard(student)));
}

function seatingNames() {
  return (state.seating?.groups || []).flatMap((group) => (group.rows || []).flat()).filter(Boolean);
}
function renderSeating() {
  els.seatingBoard.replaceChildren();
  if (!state.seating) {
    els.seatingDate.textContent = "尚未导入"; els.seatingCount.textContent = "";
    els.seatingNotice.textContent = "请在数据管理中导入 seating-data.js";
    els.seatingBoard.append(emptyNode("暂无座位表")); return;
  }
  const studentView = state.seatingPerspective === "student";
  const allNames = seatingNames(); const matchedNames = allNames.filter((name) => studentByName(name));
  const unmatched = state.studentsPack ? allNames.filter((name) => !studentByName(name)) : [];
  els.seatingDate.textContent = state.seating.dateLabel || state.seating.date || "已导入座位表";
  els.seatingCount.textContent = `${allNames.length} 个座位`;
  els.seatingPrintTitle.textContent = studentView ? `${state.seating.className || state.studentsPack?.className || "班级"}自习纪律记录` : `${state.seating.className || state.studentsPack?.className || "班级"}临时座位表`;
  els.seatingPrintMeta.textContent = studentView ? "日期：____年____月____日　自习：第____节　记录人：________" : `调整日期：${state.seating.dateLabel || state.seating.date || "未注明"}　座位方向：讲台在下方`;
  els.seatingPrintInstruction.textContent = studentView ? "请在吵闹区域画圈；只圈位置，不写原因。" : "";
  els.seatingPerspectiveToggle.textContent = studentView ? "教师视角" : "学生视角";
  els.seatingPerspectiveToggle.classList.toggle("active", studentView);
  els.seatingPerspectiveToggle.setAttribute("aria-pressed", String(studentView));
  els.seatingEditToggle.textContent = state.seatingEdit ? "完成调整" : "调整座位";
  els.seatingEditToggle.classList.toggle("active", state.seatingEdit);
  els.seatingEditToggle.disabled = studentView;
  els.seatingBoard.classList.toggle("editing", state.seatingEdit);
  els.seatingBoard.classList.toggle("student-perspective", studentView);
  els.seatingNotice.textContent = studentView ? "学生视角：打印后交给纪律委员圈出吵闹区域" : unmatched.length ? `${unmatched.length} 个姓名未匹配名册，请核对座位表` : state.seatingEdit ? "按住姓名拖到另一座位即可互换，修改自动保存在本机" : state.studentsPack ? "点击姓名查看详情 · 红框表示当前不在班" : "座位表已就绪，可直接打印或另存为 PDF";
  const back = document.createElement("div"); back.className = `seating-stage${studentView ? " student-stage-front" : ""}`; back.textContent = studentView ? "讲台（教室前方）" : "教室后方"; els.seatingBoard.append(back);
  const groups = document.createElement("div"); groups.className = "seating-groups";
  const displayGroups = state.seating.groups.map((group, groupIndex) => ({ group, groupIndex }));
  if (studentView) displayGroups.reverse();
  displayGroups.forEach(({ group, groupIndex }) => {
    const card = document.createElement("section"); card.className = "seating-group"; card.setAttribute("aria-label", `第${groupIndex + 1}大组`);
    const title = document.createElement("h3"); title.textContent = `第${groupIndex + 1}大组`; card.append(title);
    const pair = document.createElement("div"); pair.className = "seating-pair";
    const displayRows = (group.rows || []).map((row, rowIndex) => ({ row, rowIndex }));
    if (studentView) displayRows.reverse();
    displayRows.forEach(({ row, rowIndex }) => {
      const displaySeats = [
        { name: row?.[0] || "", columnIndex: 0 },
        { name: row?.[1] || "", columnIndex: 1 },
      ];
      if (studentView) displaySeats.reverse();
      displaySeats.forEach(({ name, columnIndex }) => pair.append(seatNode(name, groupIndex, rowIndex, columnIndex, matchedNames)));
    });
    card.append(pair); groups.append(card);
  });
  const front = document.createElement("div"); front.className = `seating-front${studentView ? " seating-rear" : ""}`; front.innerHTML = `<span>${studentView ? "教室后方" : "讲台"}</span>`;
  els.seatingBoard.append(groups, front);
}

function seatNode(name, groupIndex, rowIndex, columnIndex, matchedNames) {
  const student = studentByName(name); const status = name ? statusFor(name) : ""; const button = document.createElement("button"); button.type = "button";
  button.className = name ? `seat-person gender-${student?.gender === "女" ? "female" : student?.gender === "男" ? "male" : "unknown"}${status !== "在班" ? " seat-away" : ""}` : "seat-empty";
  button.dataset.group = groupIndex; button.dataset.row = rowIndex; button.dataset.column = columnIndex;
  if (!name) { button.setAttribute("aria-label", "空座位"); button.innerHTML = "<span>空位</span>"; return button; }
  button.setAttribute("aria-label", `${name}，${status}`);
  button.innerHTML = `<strong>${name}</strong>${status !== "在班" ? `<span>${status}</span>` : ""}`;
  button.addEventListener("click", () => { if (!state.seatingEdit && state.seatingPerspective !== "student") openPerson(name, matchedNames); });
  button.addEventListener("pointerdown", startSeatDrag);
  return button;
}

function seatPosition(node) { return [Number(node.dataset.group), Number(node.dataset.row), Number(node.dataset.column)]; }
function seatValue([groupIndex,rowIndex,columnIndex]) { return state.seating.groups[groupIndex].rows[rowIndex][columnIndex] || ""; }
function setSeatValue([groupIndex,rowIndex,columnIndex], value) { state.seating.groups[groupIndex].rows[rowIndex][columnIndex] = value; }
function startSeatDrag(event) {
  if (state.seatingPerspective === "student" || !state.seatingEdit || !event.currentTarget.classList.contains("seat-person")) return;
  event.preventDefault(); const source = event.currentTarget; const startX = event.clientX; const startY = event.clientY; let target = null;
  source.classList.add("dragging");
  const targetAt = (clientX,clientY) => { source.style.pointerEvents = "none"; const found = document.elementFromPoint(clientX,clientY)?.closest("[data-group][data-row][data-column]"); source.style.pointerEvents = ""; return found; };
  const move = (moveEvent) => {
    source.style.transform = `translate(${moveEvent.clientX-startX}px,${moveEvent.clientY-startY}px) scale(1.04)`;
    const next = targetAt(moveEvent.clientX,moveEvent.clientY);
    if (target !== next) { target?.classList.remove("drop-target"); target = next; target?.classList.add("drop-target"); }
  };
  const finish = async (endEvent) => {
    document.removeEventListener("pointermove",move); document.removeEventListener("pointerup",finish); document.removeEventListener("pointercancel",finish); source.classList.remove("dragging"); source.style.transform = "";
    target = target || targetAt(endEvent.clientX,endEvent.clientY); target?.classList.remove("drop-target");
    if (!target || target === source) return;
    const from = seatPosition(source); const to = seatPosition(target); const sourceName = seatValue(from); setSeatValue(from,seatValue(to)); setSeatValue(to,sourceName);
    state.seating.updatedAt = new Date().toISOString(); await dbSet("seating",state.seating); renderSeating(); renderDataStatus(); toast("座位已互换，可导出新版 JS");
  };
  document.addEventListener("pointermove",move); document.addEventListener("pointerup",finish); document.addEventListener("pointercancel",finish);
}

function weekdayKey(date = new Date()) { return ["周日","周一","周二","周三","周四","周五","周六"][date.getDay()]; }
function startOfWeek(date = new Date()) { const d = new Date(date); const delta = d.getDay() === 0 ? -6 : 1 - d.getDay(); d.setDate(d.getDate() + delta); return localDateKey(d); }
function dutyTaskKey(group) { return group?.taskId || group?.task || ""; }
function dutyRoleForTask(groupOrTask) {
  const group = typeof groupOrTask === "string" ? { task: groupOrTask } : (groupOrTask || {});
  if (["classroom_sweep","classroom_mop","window_rails","cleanup_tools"].includes(group.taskId)) return "floor";
  if (["zone1_sweep_ceiling","zone1_mop","zone1_trash"].includes(group.taskId)) return "zone1";
  if (group.taskId === "zone2_tongs_trash") return "zone2";
  const task = group.task || "";
  if (/^教室扫地|^教室拖地/.test(task)) return "floor";
  if (/^教室擦拭|^走廊|擦窗|垃圾|工具/.test(task)) return "floor";
  if (/^1号区/.test(task)) return "zone1";
  if (/^2号区/.test(task)) return "zone2";
  return null;
}
function dutyDayKey(day) { return `${state.duty?.weekStart || TODAY}:${day}`; }
function ensureDutyDay(day) {
  const key = dutyDayKey(day);
  if (!state.dutyOps.days[key]) state.dutyOps.days[key] = { substitutions: [], inspections: [] };
  if (!Array.isArray(state.dutyOps.days[key].substitutions)) state.dutyOps.days[key].substitutions = [];
  if (!Array.isArray(state.dutyOps.days[key].inspections)) state.dutyOps.days[key].inspections = [];
  return state.dutyOps.days[key];
}
function debtFor(name) {
  if (!state.dutyOps.debts[name]) state.dutyOps.debts[name] = { makeup: 0, redo: 0, substituteCount: 0 };
  return state.dutyOps.debts[name];
}
async function persistDutyOps() { await dbSet("duty-ops-v1", state.dutyOps); }
function renderCommissioners() {
  els.commissionerStrip.replaceChildren();
  DUTY_ROLES.forEach((role) => {
    const name = state.dutyOps.commissioners[role.id] || ""; const button = document.createElement("button"); button.type = "button"; button.className = `commissioner-card${name ? "" : " vacant"}`;
    button.innerHTML = `<strong>${role.label}</strong><span>${name || "未设置"}</span>`;
    button.addEventListener("click", () => openCommissionerDialog(role.id)); els.commissionerStrip.append(button);
  });
}
function renderCommissionerRoles() {
  els.commissionerRoleButtons.replaceChildren();
  DUTY_ROLES.forEach((role) => {
    const current = state.dutyOps.commissioners[role.id] || "未设置"; const button = document.createElement("button"); button.type = "button"; button.className = `role-option${state.commissionerRole === role.id ? " selected" : ""}`;
    button.innerHTML = `<strong>${role.label}</strong><span>${current} · ${role.description}</span>`;
    button.addEventListener("click", () => { state.commissionerRole = role.id; renderCommissionerRoles(); renderCommissionerCandidates(); }); els.commissionerRoleButtons.append(button);
  });
}
function commissionerSearchResults() {
  const query = els.commissionerSearch.value.trim();
  return activeStudents().map((student,index) => ({ student,index,score:scoreStudent(student,query) })).filter((item) => !query || item.score > 0).sort((a,b) => b.score-a.score || a.index-b.index).slice(0, query ? 16 : 60).map((item) => item.student);
}
function renderCommissionerCandidates() {
  els.commissionerCandidates.replaceChildren(); const selected = state.dutyOps.commissioners[state.commissionerRole] || "";
  commissionerSearchResults().forEach((student) => {
    const button = document.createElement("button"); button.type = "button"; button.className = `candidate-person${student.name === selected ? " selected" : ""}`;
    button.innerHTML = `<img src="${imageFor(student)}" alt=""><strong>${student.name}</strong><small>${student.pinyin || ""}</small>`;
    button.addEventListener("click", async () => { state.dutyOps.commissioners[state.commissionerRole] = student.name; await persistDutyOps(); renderCommissionerRoles(); renderCommissionerCandidates(); renderCommissioners(); renderDataStatus(); renderDuty(els.daySelect.value); toast("劳动委员已更新"); });
    els.commissionerCandidates.append(button);
  });
}
function openCommissionerDialog(roleId = "floor") {
  state.commissionerRole = roleId; els.commissionerSearch.value = ""; renderCommissionerRoles(); renderCommissionerCandidates(); els.commissionerDialog.showModal();
}
function renderDutyDebts() {
  els.dutyDebtList.replaceChildren();
  Object.entries(state.dutyOps.debts).filter(([name,debt]) => studentByName(name) && ((debt.makeup || 0) > 0 || (debt.redo || 0) > 0)).sort((a,b) => (b[1].redo || 0)-(a[1].redo || 0) || (b[1].makeup || 0)-(a[1].makeup || 0)).forEach(([name,debt]) => {
    const student = studentByName(name); const row = document.createElement("div"); row.className = "duty-debt-row";
    const action = debt.redo > 0 && statusFor(name) === "在班" ? `<button type="button">返工完成</button>` : "";
    row.innerHTML = `<img src="${imageFor(student)}" alt=""><div><strong>${name}</strong><small>${debt.makeup ? `待补位 ${debt.makeup}` : ""}${debt.makeup && debt.redo ? " · " : ""}${debt.redo ? `待返工 ${debt.redo}` : ""}</small></div>${action}`;
    row.querySelector("button")?.addEventListener("click", async () => { debt.redo = Math.max(0,(debt.redo || 0)-1); await persistDutyOps(); renderDutyDebts(); toast(`${name} 已完成一次返工`); }); els.dutyDebtList.append(row);
  });
}
function existingSubstitution(day, taskKey, absent) { return ensureDutyDay(day).substitutions.find((item) => (item.taskId || item.task) === taskKey && item.absent === absent); }
function candidateForDuty(name, groupNames) {
  const debt = debtFor(name); return { name, sameGroup: groupNames.includes(name) ? 1 : 0, makeup: debt.makeup || 0, count: debt.substituteCount || 0 };
}
function substituteCandidates(action) {
  const already = new Set(ensureDutyDay(action.day).substitutions.map((item) => item.substitute));
  return activeStudents().filter((student) => student.name !== action.absent && statusFor(student.name) === "在班" && !already.has(student.name)).map((student) => candidateForDuty(student.name,action.groupNames)).sort((a,b) => b.sameGroup-a.sameGroup || b.makeup-a.makeup || a.count-b.count || a.name.localeCompare(b.name,"zh-CN")).slice(0,20);
}
function renderDutyActionCandidates() {
  els.dutyActionCandidates.replaceChildren(); const action = state.dutyAction; if (!action) return;
  if (action.type === "substitute") {
    substituteCandidates(action).forEach((candidate,index) => {
      const student = studentByName(candidate.name); const button = document.createElement("button"); button.type = "button"; button.className = "candidate-person";
      const hint = candidate.makeup ? `欠补位 ${candidate.makeup}` : candidate.sameGroup ? "本组优先" : `已补 ${candidate.count}`;
      button.innerHTML = `<img src="${imageFor(student)}" alt=""><strong>${candidate.name}</strong><small>${index === 0 ? `推荐 · ${hint}` : hint}</small>`;
      button.addEventListener("click", () => assignDutySubstitute(candidate.name)); els.dutyActionCandidates.append(button);
    });
  } else {
    action.names.forEach((name) => {
      const student = studentByName(name); if (!student || statusFor(name) !== "在班") return; const selected = state.dutyActionSelection.has(name); const button = document.createElement("button"); button.type = "button"; button.className = `candidate-person${selected ? " selected" : ""}`;
      button.innerHTML = `<img src="${imageFor(student)}" alt=""><strong>${name}</strong><small>${selected ? "需要返工" : "通过"}</small>`;
      button.addEventListener("click", () => { selected ? state.dutyActionSelection.delete(name) : state.dutyActionSelection.add(name); renderDutyActionCandidates(); }); els.dutyActionCandidates.append(button);
    });
  }
}
function openSubstituteDialog(day, group, absent) {
  state.dutyAction = { type: "substitute", day, task: group.task, taskId: dutyTaskKey(group), absent, groupNames: group.names }; els.dutyActionEyebrow.textContent = "请假顺延 · 点人立即补位"; els.dutyActionTitle.textContent = `${group.task}缺岗`;
  els.dutyActionHint.textContent = `${absent}当前不在班。优先推荐有待补位记录、其次本组及累计补位较少的在班学生。`; els.saveDutyAction.classList.add("hidden"); renderDutyActionCandidates(); els.dutyActionDialog.showModal();
}
async function assignDutySubstitute(name) {
  const action = state.dutyAction; if (!action || existingSubstitution(action.day,action.taskId,action.absent)) return;
  const day = ensureDutyDay(action.day); day.substitutions.push({ taskId: action.taskId, task: action.task, absent: action.absent, substitute: name, at: new Date().toISOString() });
  const absentDebt = debtFor(action.absent); absentDebt.makeup = (absentDebt.makeup || 0) + 1; const substituteDebt = debtFor(name); substituteDebt.substituteCount = (substituteDebt.substituteCount || 0) + 1; if (substituteDebt.makeup > 0) substituteDebt.makeup -= 1;
  await persistDutyOps(); els.dutyActionDialog.close(); renderDuty(action.day); toast(`${name} 已补位，${action.absent}顺延一次`);
}
function openInspectionDialog(day, group) {
  const taskId = dutyTaskKey(group); const substitutions = ensureDutyDay(day).substitutions.filter((item) => (item.taskId || item.task) === taskId).map((item) => item.substitute); state.dutyAction = { type: "inspection", day, task: group.task, taskId, names: [...new Set([...group.names,...substitutions])] }; state.dutyActionSelection = new Set();
  els.dutyActionEyebrow.textContent = `${DUTY_ROLES.find((role) => role.id === dutyRoleForTask(group))?.label || "劳动委员"}验收`; els.dutyActionTitle.textContent = group.task; els.dutyActionHint.textContent = "只点选需要返工的人；未点选视为通过。"; els.saveDutyAction.classList.remove("hidden"); renderDutyActionCandidates(); els.dutyActionDialog.showModal();
}
async function saveDutyInspection() {
  const action = state.dutyAction; if (!action || action.type !== "inspection") return; const day = ensureDutyDay(action.day);
  state.dutyActionSelection.forEach((name) => { if (!day.inspections.some((item) => (item.taskId || item.task) === action.taskId && item.name === name && item.result === "返工")) { day.inspections.push({ taskId: action.taskId, task: action.task, name, result: "返工", at: new Date().toISOString() }); debtFor(name).redo = Math.min(2,(debtFor(name).redo || 0) + 1); } });
  await persistDutyOps(); els.dutyActionDialog.close(); renderDuty(action.day); toast(state.dutyActionSelection.size ? `已登记 ${state.dutyActionSelection.size} 人返工` : "本组验收通过");
}
function smallPerson(student, name, status = "在班", subtext = "") {
  const person = document.createElement("button"); person.type = "button"; person.className = "duty-person";
  person.innerHTML = `<span class="mini-photo"><img alt="${name}" src="${imageFor(student)}">${status !== "在班" ? `<b class="mini-status ${statusClass(status)}">${status}</b>` : ""}</span><span>${name}</span>${subtext ? `<small>${subtext}</small>` : ""}`; return person;
}
function renderDuty(day = els.daySelect.value || weekdayKey()) {
  els.dutyList.replaceChildren(); els.daySelect.replaceChildren();
  renderCommissioners(); renderDutyDebts();
  if (!state.duty) { els.dutyWeekNotice.textContent = "请在数据管理中导入 duty-data.js"; els.dutyList.append(emptyNode("尚未导入值日安排")); return; }
  const labels = state.duty.dayOrder || Object.keys(state.duty.days); labels.forEach((label) => els.daySelect.add(new Option(label,label)));
  if (!state.duty.days[day]) day = labels.includes("周一") ? "周一" : labels[0]; els.daySelect.value = day;
  const today = new Date(); els.dateLabel.textContent = day === weekdayKey(today) ? `${today.getMonth()+1}月${today.getDate()}日 · 今天` : "手动查看"; els.dutyTitle.textContent = `${day}值日`;
  const old = state.duty.weekStart && state.duty.weekStart !== startOfWeek(today);
  els.dutyWeekNotice.textContent = `${state.duty.weekLabel || state.duty.weekStart || "当前值日表"}${old ? " · 注意：不是本周数据" : ""}`; els.dutyWeekNotice.classList.toggle("warning", Boolean(old));
  const operational = day === weekdayKey(today) && !old; const dayState = ensureDutyDay(day);
  const groups = state.duty.days[day] || [];
  if (!groups.length) { els.dutyList.append(emptyNode("当天没有设置值日名单")); return; }
  groups.forEach((group) => {
    const section = document.createElement("section"); section.className = "duty-group"; const taskId = dutyTaskKey(group); const roleId = dutyRoleForTask(group); const substitutions = dayState.substitutions.filter((item) => (item.taskId || item.task) === taskId); const assignedAbsent = new Set(substitutions.map((item) => item.absent));
    const absent = group.names.filter((name) => statusFor(name) !== "在班"); const unresolved = absent.filter((name) => !assignedAbsent.has(name));
    section.innerHTML = `<div class="duty-group-head"><h3>${group.task}</h3><div class="duty-group-tools"><span>${group.names.length} 人${absent.length ? ` · 缺 ${absent.length}` : ""}</span></div></div><div class="duty-substitutes"></div><div class="avatar-strip"></div>`;
    const tools = section.querySelector(".duty-group-tools");
    if (operational && roleId && unresolved.length) { const button = document.createElement("button"); button.type = "button"; button.className = "alert"; button.textContent = `补位 ${unresolved.length}`; button.addEventListener("click", () => openSubstituteDialog(day,group,unresolved[0])); tools.append(button); }
    if (operational && roleId) { const button = document.createElement("button"); button.type = "button"; button.textContent = "验收"; button.addEventListener("click", () => openInspectionDialog(day,group)); tools.append(button); }
    const substituteBox = section.querySelector(".duty-substitutes"); substitutions.forEach((item) => { const chip = document.createElement("span"); chip.className = "substitute-chip"; chip.textContent = `${item.substitute} 替 ${item.absent}`; substituteBox.append(chip); }); if (!substitutions.length) substituteBox.remove();
    const strip = section.querySelector(".avatar-strip");
    group.names.forEach((name) => { const person = smallPerson(studentByName(name), name, statusFor(name)); person.addEventListener("click", () => openPerson(name, group.names)); strip.append(person); });
    substitutions.filter((item) => !group.names.includes(item.substitute)).forEach((item) => { const person = smallPerson(studentByName(item.substitute),item.substitute,"补位",`替 ${item.absent}`); person.addEventListener("click", () => openPerson(item.substitute,[...group.names,...substitutions.map((entry) => entry.substitute)])); strip.append(person); });
    els.dutyList.append(section);
  });
}

function renderDorm() {
  els.dormList.replaceChildren(); const rooms = state.dorm?.rooms || [];
  els.dormCount.textContent = rooms.length ? `${rooms.length} 间 · ${rooms.reduce((n,r) => n+r.members.length,0)} 人` : "";
  if (!rooms.length) { els.dormList.append(emptyNode("请在数据管理中导入 dorm-data.js")); return; }
  rooms.forEach((room) => {
    const section = document.createElement("section"); section.className = "dorm-room";
    const absent = room.members.filter((m) => statusFor(typeof m === "string" ? m : m.name) !== "在班").length;
    section.innerHTML = `<div class="dorm-room-head"><div><h3>${room.room}</h3><p>舍长：${room.leader || "未设置"}</p></div><span>${room.members.length} 人${absent ? ` · ${absent} 人不在班` : ""}</span></div><div class="dorm-members"></div>`;
    const grid = section.querySelector(".dorm-members");
    const roomNames = room.members.map((raw) => typeof raw === "string" ? raw : raw.name);
    room.members.forEach((raw) => { const member = typeof raw === "string" ? {name:raw} : raw; const person = smallPerson(studentByName(member.name), member.name, statusFor(member.name), member.bed || ""); person.addEventListener("click", () => openPerson(member.name, roomNames)); grid.append(person); });
    els.dormList.append(section);
  });
}

function renderWhere() {
  const groups = Object.fromEntries(STATUS_ORDER.map((s) => [s, []])); activeStudents().forEach((student) => groups[statusFor(student.name)].push(student));
  els.whereDate.textContent = `${new Date().getMonth()+1}月${new Date().getDate()}日`; els.whereSummary.replaceChildren(); els.whereGroups.replaceChildren();
  STATUS_ORDER.filter((status) => groups[status].length).forEach((status) => {
    const card = document.createElement("button"); card.type = "button"; card.className = `where-card ${statusClass(status)}`; card.innerHTML = `<strong>${groups[status].length}</strong><span>${status}</span>`;
    card.addEventListener("click", () => document.getElementById(`where-${status}`)?.scrollIntoView({behavior:"smooth"})); els.whereSummary.append(card);
    const section = document.createElement("section"); section.className = "where-group"; section.id = `where-${status}`;
    section.innerHTML = `<div class="duty-group-head"><h3>${status}</h3><span>${groups[status].length} 人</span></div><div class="avatar-strip"></div>`;
    const groupNames = groups[status].map((student) => student.name);
    groups[status].forEach((student) => { const person = smallPerson(student, student.name, status); person.addEventListener("click", () => openPerson(student.name, groupNames)); section.querySelector(".avatar-strip").append(person); }); els.whereGroups.append(section);
  });
}

function renderPicked() {
  els.pickedList.replaceChildren(); if (!state.picked.size) { els.pickedList.append(emptyNode("先在上方搜索，再轻点照片加入")); return; }
  [...state.picked].forEach((name) => { const student = studentByName(name); const row = document.createElement("div"); row.className = "picked-person"; row.innerHTML = `<img alt="${name}" src="${imageFor(student)}"><div><strong>${name}</strong><small>${statusFor(name)}</small></div><button type="button" aria-label="移除${name}">×</button>`; row.querySelector("button").addEventListener("click", () => togglePick(name)); els.pickedList.append(row); });
}

function showViewerPerson(index) {
  if (!state.viewerNames.length) return;
  state.viewerIndex = Math.max(0, Math.min(index, state.viewerNames.length - 1));
  const name = state.viewerNames[state.viewerIndex]; const student = studentByName(name); if (!student) return;
  state.currentPerson = name; state.pendingPhoto = null;
  els.personManagement.classList.add("hidden"); setManagementView("summary");
  const dorm = dormFor(name); const status = statusFor(name); els.personName.textContent = name; els.personPhoto.src = imageFor(student); els.personPhoto.alt = name; els.personPinyin.textContent = student.pinyin || ""; showViewerRole(name); els.personDorm.textContent = `${status}${student.origin ? ` · ${student.origin}` : ""}${dorm ? ` · ${dorm.room.room}${dorm.member.bed ? ` · ${dorm.member.bed}` : ""}` : " · 未登记宿舍"}`;
  els.personStatus.value = status === "待确认" ? "请假" : status; els.leaveUntil.value = state.leaves[name]?.until || ""; els.personNote.value = noteFor(name); renderStatusPicker(); toggleLeaveField();
  els.personPrev.disabled = state.viewerIndex === 0; els.personNext.disabled = state.viewerIndex === state.viewerNames.length - 1;
  els.personPick.textContent = state.picked.has(name) ? "已加入点人" : "加入点人"; els.personPick.classList.toggle("picked", state.picked.has(name));
}
function showViewerRole(name) {
  const profile = profileFor(name); const label = profile.isCadre ? (profile.cadreRole || "班干") : "";
  els.personRole.textContent = label; els.personRole.classList.toggle("hidden", !label);
}
function openPerson(name, contextNames = null) {
  const student = studentByName(name); if (!student) return toast(`名册中没有 ${name}`);
  const names = [...new Set((contextNames?.length ? contextNames : activeStudents().map((item) => item.name)).filter((item) => studentByName(item)))];
  if (!names.includes(name)) names.unshift(name); state.viewerNames = names; els.personEditor.classList.add("hidden"); els.personManagement.classList.add("hidden"); showViewerPerson(names.indexOf(name)); els.personDialog.showModal();
}
function toggleLeaveField() { els.leaveUntilWrap.classList.toggle("hidden", els.personStatus.value !== "请假"); }
function renderStatusPicker() {
  els.personStatusButtons.replaceChildren();
  STATUS_ORDER.filter((status) => status !== "待确认").forEach((status) => {
    const button = document.createElement("button"); button.type = "button"; button.className = `status-option${els.personStatus.value === status ? " selected" : ""}`; button.textContent = status;
    button.addEventListener("click", async () => {
      els.personStatus.value = status; renderStatusPicker(); toggleLeaveField();
      await persistPerson(false, true);
    });
    els.personStatusButtons.append(button);
  });
}
function compressPhoto(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => { const img = new Image(); img.onerror = reject; img.onload = () => { const scale = Math.min(1, 720 / Math.max(img.width,img.height)); const canvas = document.createElement("canvas"); canvas.width = Math.round(img.width*scale); canvas.height = Math.round(img.height*scale); canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height); resolve(canvas.toDataURL("image/jpeg",.76)); }; img.src = reader.result; }; reader.readAsDataURL(file); });
}
async function persistPerson(closeAfter = true, quiet = false) {
  const name = state.currentPerson; if (!name) return; const status = els.personStatus.value; const note = els.personNote.value.trim();
  const oldStatus = statusFor(name); const oldNote = noteFor(name); const oldUntil = state.leaves[name]?.until || "";
  if (status === "请假") { state.leaves[name] = { until: els.leaveUntil.value || "", note }; delete state.whereabouts[name]; }
  else { delete state.leaves[name]; if (status === "在班" && !note) delete state.whereabouts[name]; else state.whereabouts[name] = { status, note }; }
  if (state.pendingPhoto) { studentByName(name).image = state.pendingPhoto; await dbSet("students", state.studentsPack); }
  const newUntil = status === "请假" ? (els.leaveUntil.value || "") : "";
  if (oldStatus !== status || oldNote !== note || oldUntil !== newUntil) {
    const entry = state.history[TODAY] || { date: TODAY, events: [] };
    entry.events = Array.isArray(entry.events) ? entry.events : [];
    entry.events.push({ at: new Date().toISOString(), name, from: oldStatus, to: status, note, leaveUntil: newUntil });
    state.history[TODAY] = entry;
  }
  await persistCurrentState();
  if (state.autoArchive) await saveDailySnapshot("状态变化");
  else if (oldStatus !== status || oldNote !== note || oldUntil !== newUntil) await dbSet("attendance-history-v1", state.history);
  state.pendingPhoto = null;
  if (closeAfter) els.personDialog.close();
  renderAll();
  if (!closeAfter) {
    const dorm = dormFor(name), student = studentByName(name); els.personDorm.textContent = `${statusFor(name)}${student?.origin ? ` · ${student.origin}` : ""}${dorm ? ` · ${dorm.room.room}${dorm.member.bed ? ` · ${dorm.member.bed}` : ""}` : " · 未登记宿舍"}`;
  }
  if (!quiet) toast(`已更新 ${name}`);
}
async function savePerson() { await persistPerson(true, false); }

function setMode(mode) {
  if (mode === "batch" && state.mode !== "batch") { state.query = ""; els.searchInput.value = ""; }
  state.mode = mode; document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  els.findView.classList.toggle("hidden", mode !== "find"); els.seatingView.classList.toggle("hidden", mode !== "seating"); els.dutyView.classList.toggle("hidden", mode !== "duty"); els.dormView.classList.toggle("hidden", mode !== "dorm"); els.whereView.classList.toggle("hidden", mode !== "where"); els.batchView.classList.toggle("hidden", mode !== "batch"); els.searchPanel.classList.toggle("hidden", !["find","batch"].includes(mode));
  if (mode === "seating") renderSeating(); if (mode === "duty") renderDuty(); if (mode === "dorm") renderDorm(); if (mode === "where") renderWhere(); if (mode === "find") renderStudents(); if (mode === "batch") { renderStudents(); renderPicked(); setTimeout(() => els.searchInput.focus(),50); }
}
function renderDataStatus() {
  els.dataStatus.textContent = `当前名册 · ${activeStudents().length} 名在读学生 · 照片 ${students().filter((s)=>s.image).length}/${students().length}`;
  const dutyRoleCount = DUTY_ROLES.filter((role) => state.dutyOps.commissioners[role.id]).length;
  els.dutyDataStatus.textContent = state.duty ? `${state.duty.weekLabel || state.duty.weekStart || "已导入"} · 劳动委员 ${dutyRoleCount}/4` : "尚未导入";
  els.dormDataStatus.textContent = state.dorm ? `${state.dorm.rooms.length} 间宿舍 · ${state.dorm.rooms.reduce((n,r)=>n+r.members.length,0)} 人` : "尚未导入";
  els.seatingDataStatus.textContent = state.seating ? `${state.seating.dateLabel || state.seating.date || "已导入"} · ${seatingNames().length} 个座位` : "尚未导入";
  const managed = Object.values(state.management).filter((profile) => profile?.isCadre || profile?.impressionTags?.length || profile?.workNote || profile?.discipline?.length).length;
  const incidents = Object.values(state.management).reduce((count, profile) => count + (Array.isArray(profile?.discipline) ? profile.discipline.length : 0), 0);
  const dutyDebtCount = Object.values(state.dutyOps.debts).reduce((count,debt) => count + (debt?.makeup || 0) + (debt?.redo || 0),0);
  els.managementDataStatus.textContent = `${managed} 人有管理记录 · 违纪 ${incidents} 条 · 值日待办 ${dutyDebtCount} 次 · 仅存本机`;
}
function renderAll() {
  const ready = Boolean(state.studentsPack || state.seating); els.setup.classList.toggle("hidden",ready); els.app.classList.toggle("hidden",!ready); els.dataButton.classList.toggle("hidden",!ready); if (!ready) return;
  if (!state.studentsPack && state.seating) state.mode = "seating";
  persistPicked(); renderDataStatus(); renderStudents(); renderSeating(); renderDuty(); renderDorm(); renderWhere(); renderPicked(); renderArchiveStatus(); setMode(state.mode);
}
let toastTimer; function toast(message) { els.toast.textContent = message; els.toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.classList.remove("show"),2200); }

document.querySelectorAll(".mode").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
els.searchInput.addEventListener("input", (e) => { state.query = e.target.value.trim(); renderStudents(); }); els.clearSearch.addEventListener("click", () => { state.query=""; els.searchInput.value=""; renderStudents(); els.searchInput.focus(); }); els.daySelect.addEventListener("change", () => renderDuty(els.daySelect.value));
els.genderFilters.addEventListener("click", (event) => { const button = event.target.closest("[data-gender]"); if (!button) return; state.genderFilter = button.dataset.gender; renderStudents(); });
els.layoutToggle.addEventListener("click", () => { state.findLayout = state.findLayout === "grid" ? "cards" : "grid"; localStorage.setItem("find-person-layout",state.findLayout); renderStudents(); });
els.seatingEditToggle.addEventListener("click", () => { if (!state.seating) return toast("请先导入座位表 JS"); state.seatingEdit = !state.seatingEdit; renderSeating(); });
els.seatingPerspectiveToggle.addEventListener("click", () => { if (!state.seating) return toast("请先导入座位表 JS"); state.seatingEdit = false; state.seatingPerspective = state.seatingPerspective === "student" ? "teacher" : "student"; renderSeating(); });
els.seatingExportQuick.addEventListener("click", () => exportJS("FIND_PERSON_SEATING_DATA",state.seating,`seating-data-${state.seating?.date || TODAY}.js`));
els.seatingPrintButton.addEventListener("click", () => { if (!state.seating) return toast("请先导入座位表 JS"); window.print(); });
els.seatingPrintFile.addEventListener("change", async (event) => {
  const imported = await importDataFile(event.target.files[0],"seating");
  if (!imported) return;
  setMode("seating");
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
});
els.seatingSetupPrintFile.addEventListener("change", async (event) => {
  const imported = await importDataFile(event.target.files[0],"seating");
  if (!imported) return;
  setMode("seating");
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
});
els.dutyTeamButton.addEventListener("click", () => openCommissionerDialog("floor")); els.commissionerSearch.addEventListener("input",renderCommissionerCandidates);
els.clearCommissioner.addEventListener("click", async () => { state.dutyOps.commissioners[state.commissionerRole] = null; await persistDutyOps(); renderCommissionerRoles(); renderCommissionerCandidates(); renderCommissioners(); renderDataStatus(); toast("该岗位已设为空缺，可随时换人"); });
els.saveDutyAction.addEventListener("click",saveDutyInspection);
els.studentSetupFile.addEventListener("change", (e) => importDataFile(e.target.files[0],"students")); els.studentFile.addEventListener("change", (e) => importDataFile(e.target.files[0],"students")); els.dutyFile.addEventListener("change", (e) => importDataFile(e.target.files[0],"duty")); els.dormFile.addEventListener("change", (e) => importDataFile(e.target.files[0],"dorm")); els.seatingFile.addEventListener("change", (e) => importDataFile(e.target.files[0],"seating")); els.managementFile.addEventListener("change", (e) => importDataFile(e.target.files[0],"management"));
els.dataButton.addEventListener("click", () => { renderDataStatus(); els.dataDialog.showModal(); }); els.exportStudents.addEventListener("click", () => exportJS("FIND_PERSON_STUDENTS_DATA",state.studentsPack,`students-data-${TODAY}.js`)); els.exportDuty.addEventListener("click", () => exportJS("FIND_PERSON_DUTY_DATA",dutyExportPayload(),`duty-data-${state.duty?.weekStart || TODAY}.js`)); els.exportDorm.addEventListener("click", () => exportJS("FIND_PERSON_DORM_DATA",state.dorm,`dorm-data-${TODAY}.js`)); els.exportSeating.addEventListener("click", () => exportJS("FIND_PERSON_SEATING_DATA",state.seating,`seating-data-${state.seating?.date || TODAY}.js`));
els.exportManagement.addEventListener("click", () => exportJS("FIND_PERSON_MANAGEMENT_DATA",managementExportPayload(),`management-data-${TODAY}.js`));
els.forgetData.addEventListener("click", async () => { if (!window.confirm("确定清除这台设备上的学生、值日、宿舍、座位、历史留存和管理记录吗？请先导出需要的备份。")) return; await clearDB(); state.studentsPack=state.duty=state.dorm=state.seating=null; state.whereabouts={}; state.leaves={}; state.history={}; state.management={}; state.dutyOps=normalizeDutyOps(null); state.autoArchive=true; els.autoArchive.checked=true; state.picked.clear(); persistPicked(); els.dataDialog.close(); renderAll(); toast("已清除本机全部数据"); });
els.batchNote.value = localStorage.getItem("find-person-note") || ""; els.batchNote.addEventListener("input", () => localStorage.setItem("find-person-note",els.batchNote.value)); els.clearBatch.addEventListener("click", () => { state.picked.clear(); persistPicked(); renderPicked(); renderStudents(); toast("已清空点名组"); });
els.copyBatch.addEventListener("click", async () => { if (!state.picked.size) return toast("还没有选择学生"); const note=els.batchNote.value.trim(); const text=`人员：${[...state.picked].join("、")}${note?`\n事项：${note}`:""}`; try { await navigator.clipboard.writeText(text); toast("名单与备注已复制"); } catch { window.prompt("长按复制",text); } });
els.personPhotoFile.addEventListener("change", async (e) => { if (!e.target.files[0]) return; try { state.pendingPhoto=await compressPhoto(e.target.files[0]); els.personPhoto.src=state.pendingPhoto; toast("照片已处理，点保存生效"); } catch { toast("照片处理失败"); } }); els.savePerson.addEventListener("click",savePerson);
els.personPrev.addEventListener("click", () => { els.personEditor.classList.add("hidden"); els.personManagement.classList.add("hidden"); showViewerPerson(state.viewerIndex - 1); });
els.personNext.addEventListener("click", () => { els.personEditor.classList.add("hidden"); els.personManagement.classList.add("hidden"); showViewerPerson(state.viewerIndex + 1); });
els.personPick.addEventListener("click", () => { const index = state.viewerIndex; togglePick(state.currentPerson); showViewerPerson(index); });
els.togglePersonEditor.addEventListener("click", () => { els.personManagement.classList.add("hidden"); els.personEditor.classList.remove("hidden"); }); els.closePersonEditor.addEventListener("click", () => els.personEditor.classList.add("hidden"));
els.closeManagement.addEventListener("click", () => els.personManagement.classList.add("hidden"));
els.toggleCadre.addEventListener("click", openCadreEditor);
els.cadreRoleInput.addEventListener("input", renderCadreRolePicker); els.cancelCadre.addEventListener("click", () => setManagementView("summary")); els.saveCadre.addEventListener("click", saveCadre); els.removeCadre.addEventListener("click", removeCadreRole);
els.editImpression.addEventListener("click", () => { const profile = profileFor(state.currentPerson); state.impressionDraft = [...profile.impressionTags]; els.managementNoteInput.value = profile.workNote; renderImpressionPicker(); setManagementView("impression"); });
els.cancelImpression.addEventListener("click", () => setManagementView("summary")); els.saveImpression.addEventListener("click", saveImpression);
els.addDiscipline.addEventListener("click", () => { state.disciplineTypeDraft = "课堂"; state.disciplineLevelDraft = "轻微"; els.disciplineFact.value = ""; renderDisciplinePickers(); setManagementView("discipline"); });
els.cancelDiscipline.addEventListener("click", () => setManagementView("summary")); els.saveDiscipline.addEventListener("click", saveDiscipline);
let viewerTouchX = null; let viewerLastSwipe = 0;
els.personHero.addEventListener("touchstart", (event) => { viewerTouchX = event.touches.length === 1 ? event.touches[0].clientX : null; }, { passive: true });
els.personHero.addEventListener("touchend", (event) => { if (viewerTouchX === null || event.changedTouches.length !== 1) return; const delta = event.changedTouches[0].clientX - viewerTouchX; viewerTouchX = null; if (Math.abs(delta) < 55) return; viewerLastSwipe = Date.now(); els.personEditor.classList.add("hidden"); els.personManagement.classList.add("hidden"); showViewerPerson(state.viewerIndex + (delta < 0 ? 1 : -1)); }, { passive: true });
els.personHero.addEventListener("click", (event) => { if (Date.now() - viewerLastSwipe < 350 || event.target.closest("button")) return; if (event.target !== els.personPhoto && event.target !== els.personHero) return; els.personManagement.classList.contains("hidden") ? openManagementSummary() : els.personManagement.classList.add("hidden"); });
els.personDialog.addEventListener("keydown", (event) => { if (event.key === "ArrowLeft") showViewerPerson(state.viewerIndex - 1); if (event.key === "ArrowRight") showViewerPerson(state.viewerIndex + 1); });
els.resetWhere.addEventListener("click", async () => {
  if (!window.confirm("将所有非请假的去向恢复为“在班”？请假标记会保留。")) return;
  const changed = Object.entries(state.whereabouts).filter(([,value]) => value?.status && value.status !== "在班");
  const entry = state.history[TODAY] || { date: TODAY, events: [] }; entry.events = Array.isArray(entry.events) ? entry.events : [];
  changed.forEach(([name,value]) => entry.events.push({ at: new Date().toISOString(), name, from: value.status, to: "在班", note: "批量重置", leaveUntil: "" }));
  state.history[TODAY] = entry; state.whereabouts = {};
  await persistCurrentState();
  if (state.autoArchive) await saveDailySnapshot("批量重置"); else await dbSet("attendance-history-v1", state.history);
  renderAll(); toast("非请假去向已恢复为在班");
});
els.saveToday.addEventListener("click", () => saveDailySnapshot("手动保存", true));
els.openHistory.addEventListener("click", () => { renderHistoryDialog(TODAY); els.historyDialog.showModal(); });
els.historyDay.addEventListener("change", () => renderHistoryDialog(els.historyDay.value));
els.exportTodayDuty.addEventListener("click", exportTodayForDuty);
els.exportHistory.addEventListener("click", exportAttendanceHistory); els.historyExport.addEventListener("click", exportAttendanceHistory);
els.autoArchive.addEventListener("change", async () => {
  state.autoArchive = els.autoArchive.checked; await dbSet("attendance-auto", state.autoArchive);
  if (state.autoArchive) await saveDailySnapshot("开启自动留存", true); else { renderArchiveStatus(); toast("自动留存已关闭"); }
});

async function handleDayChange() {
  const current = localDateKey(); if (current === TODAY) return;
  if (state.autoArchive && state.studentsPack) await saveDailySnapshot("跨日自动留存");
  TODAY = current;
  await dbSet(`where:${TODAY}`, state.whereabouts);
  renderAll();
  if (state.autoArchive && state.studentsPack) await saveDailySnapshot("新日自动留存");
}
function scheduleDayRollover() {
  const now = new Date(); const next = new Date(now); next.setDate(next.getDate() + 1); next.setHours(0,0,2,0);
  setTimeout(async () => { await handleDayChange(); scheduleDayRollover(); }, Math.min(next - now, 2147483647));
}
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible") await handleDayChange();
  else if (state.autoArchive && state.studentsPack) await saveDailySnapshot("离开应用自动留存");
});

(async () => {
  try {
    const [studentsData,duty,dorm,seating,legacy,whereToday,whereCurrent,leaves,history,autoArchive,management,dutyOps] = await Promise.all([dbGet("students"),dbGet("duty"),dbGet("dorm"),dbGet("seating"),dbGet("active"),dbGet(`where:${TODAY}`),dbGet("where:current"),dbGet("leaves"),dbGet("attendance-history-v1"),dbGet("attendance-auto"),dbGet("management-v1"),dbGet("duty-ops-v1")]);
    state.studentsPack=studentsData; state.duty=duty; state.dorm=dorm; state.seating=seating; state.whereabouts=whereCurrent||whereToday||{}; state.leaves=leaves||{}; state.history=history||{}; state.management=management||{}; state.dutyOps=normalizeDutyOps(dutyOps); mergeDutyCommissioners(state.duty); state.autoArchive=autoArchive !== false; els.autoArchive.checked=state.autoArchive;
    if (state.duty?.commissioners) await dbSet("duty-ops-v1",state.dutyOps);
    if (!whereCurrent && whereToday) await dbSet("where:current", state.whereabouts);
    if (!state.studentsPack && legacy?.students) { state.studentsPack={version:legacy.version,className:legacy.className,students:legacy.students}; state.duty=state.duty||legacy.duty||null; state.dorm=state.dorm||legacy.dorm||null; state.seating=state.seating||legacy.seating||null; mergeDutyCommissioners(state.duty); await Promise.all([dbSet("students",state.studentsPack),dbSet("duty",state.duty),dbSet("dorm",state.dorm),dbSet("seating",state.seating),dbSet("duty-ops-v1",state.dutyOps)]); }
  } catch { toast("无法读取本机数据"); }
  renderAll();
  if (state.studentsPack && state.autoArchive) await saveDailySnapshot("打开应用");
  scheduleDayRollover();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
