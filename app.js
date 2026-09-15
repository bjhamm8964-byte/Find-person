const DB_NAME = "find-person-private-v1";
const STORE_NAME = "payload";
function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
const TODAY = localDateKey();
const STATUS_ORDER = ["在班", "请假", "宿舍", "医务室", "办公室", "校内活动", "离校", "未知", "待确认"];
const placeholderImage = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="40" fill="#dce9df"/><circle cx="100" cy="76" r="38" fill="#6c8c7d"/><path d="M35 185c5-45 31-69 65-69s60 24 65 69" fill="#6c8c7d"/></svg>`);

const state = {
  studentsPack: null, duty: null, dorm: null, whereabouts: {}, leaves: {},
  mode: "find", query: "", currentPerson: null, pendingPhoto: null,
  viewerNames: [], viewerIndex: 0,
  picked: new Set(JSON.parse(localStorage.getItem("find-person-picked") || "[]")),
};
const $ = (id) => document.getElementById(id);
const ids = [
  "setup","app","studentSetupFile","dataButton","dataDialog","dataStatus","dutyDataStatus","dormDataStatus","studentFile","dutyFile","dormFile","exportStudents","exportDuty","exportDorm","forgetData",
  "searchPanel","searchInput","clearSearch","searchHint","findView","dutyView","dormView","whereView","batchView","studentRail","resultTitle","resultCount","batchCount",
  "dateLabel","dutyTitle","daySelect","dutyWeekNotice","dutyList","dormTitle","dormCount","dormList","whereDate","whereSummary","whereGroups","resetWhere",
  "pickedList","batchNote","copyBatch","clearBatch","personDialog","personHero","personName","personPhoto","personPinyin","personDorm","personPrev","personNext","personPick","togglePersonEditor","personEditor","closePersonEditor","personStatus","leaveUntilWrap","leaveUntil","personNote","personPhotoFile","savePerson","toast"
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
    req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error);
  });
}
async function dbSet(key, value) {
  if (!value) return;
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

async function importDataFile(file, expectedKind = "auto") {
  if (!file) return;
  try {
    const { variable, payload } = parseDataJS(await file.text());
    if (variable === "FIND_PERSON_PRIVATE_DATA") {
      validateStudents(payload);
      state.studentsPack = { version: payload.version, className: payload.className, students: payload.students };
      state.duty = payload.duty || state.duty; state.dorm = payload.dorm || state.dorm;
      await Promise.all([dbSet("students", state.studentsPack), dbSet("duty", state.duty), dbSet("dorm", state.dorm)]);
    } else if (variable === "FIND_PERSON_STUDENTS_DATA" && ["auto","students"].includes(expectedKind)) {
      validateStudents(payload); state.studentsPack = payload; await dbSet("students", payload);
    } else if (variable === "FIND_PERSON_DUTY_DATA" && ["auto","duty"].includes(expectedKind)) {
      validateDuty(payload); state.duty = payload; await dbSet("duty", payload);
    } else if (variable === "FIND_PERSON_DORM_DATA" && ["auto","dorm"].includes(expectedKind)) {
      validateDorm(payload); state.dorm = payload; await dbSet("dorm", payload);
    } else throw new Error("数据包类型与导入口不一致");
    state.picked = new Set([...state.picked].filter((name) => studentByName(name)));
    persistPicked(); renderAll(); els.dataDialog.close(); toast(`已导入 ${file.name}`);
  } catch (error) { toast(error.message || "导入失败"); }
  finally { [els.studentSetupFile,els.studentFile,els.dutyFile,els.dormFile].forEach((input) => { input.value = ""; }); }
}

async function exportJS(variable, payload, filename) {
  if (!payload) return toast("当前没有可导出的数据");
  const file = new File([`window.${variable} = ${JSON.stringify(payload, null, 2)};\n`], filename, { type: "text/javascript" });
  try {
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename }); toast("已打开分享菜单"); return;
    }
  } catch (error) { if (error.name === "AbortError") return; }
  const url = URL.createObjectURL(file); const link = document.createElement("a");
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast("已导出文件");
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
  const fields = [student.name, student.pinyin, student.initials, ...(student.aliases || [])].map(normalize);
  if (fields.some((f) => f === q)) return 100;
  if (fields.some((f) => f.startsWith(q))) return 80;
  if (fields.some((f) => f.includes(q))) return 65;
  if (q.length > 1 && fields.some((f) => isSubsequence(q, f))) return 45;
  if (q.length >= 3 && fields.some((f) => Math.abs(f.length - q.length) <= 2 && editDistance(q, f) <= 2)) return 25;
  return 0;
}
function filteredStudents() {
  const ranked = activeStudents().map((student, index) => ({ student, index, score: scoreStudent(student, state.query) })).sort((a,b) => b.score - a.score || a.index - b.index);
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

function persistPicked() { localStorage.setItem("find-person-picked", JSON.stringify([...state.picked])); els.batchCount.textContent = state.picked.size ? String(state.picked.size) : ""; }
function togglePick(name) { state.picked.has(name) ? state.picked.delete(name) : state.picked.add(name); persistPicked(); renderStudents(); renderPicked(); toast(state.picked.has(name) ? `已加入 ${name}` : `已移除 ${name}`); }

function studentCard(student) {
  const status = statusFor(student.name); const card = document.createElement("button"); card.type = "button";
  card.className = `student-card${state.picked.has(student.name) ? " picked" : ""}${student.image ? "" : " placeholder"}`;
  card.setAttribute("aria-label", `${student.name}，${status}`);
  card.innerHTML = `<img alt="${student.name}" src="${imageFor(student)}"><span class="gender-chip">${student.gender || "学生"}</span>${status !== "在班" ? `<span class="status-chip ${statusClass(status)}">${status}</span>` : ""}<span class="pick-mark">✓</span><span class="card-copy"><span class="card-name">${student.name}</span><span class="card-pinyin">${student.pinyin || ""}</span></span>`;
  card.addEventListener("click", () => state.mode === "batch" ? togglePick(student.name) : openPerson(student.name, filteredStudents().map((item) => item.name))); return card;
}
function renderStudents() {
  if (!state.studentsPack) return; const list = filteredStudents();
  els.resultTitle.textContent = state.query ? `搜索“${state.query}”` : "全班同学"; els.resultCount.textContent = `${list.length} 人`;
  els.searchHint.textContent = state.mode === "batch" ? "轻点卡片加入点名组" : "支持姓名、全拼、首字母和少量拼写误差";
  els.studentRail.replaceChildren();
  if (!list.length) { els.studentRail.append(emptyNode("没有找到，试试更短的拼音或首字母")); return; }
  list.forEach((student) => els.studentRail.append(studentCard(student)));
}

function weekdayKey(date = new Date()) { return ["周日","周一","周二","周三","周四","周五","周六"][date.getDay()]; }
function startOfWeek(date = new Date()) { const d = new Date(date); const delta = d.getDay() === 0 ? -6 : 1 - d.getDay(); d.setDate(d.getDate() + delta); return localDateKey(d); }
function smallPerson(student, name, status = "在班", subtext = "") {
  const person = document.createElement("button"); person.type = "button"; person.className = "duty-person";
  person.innerHTML = `<span class="mini-photo"><img alt="${name}" src="${imageFor(student)}">${status !== "在班" ? `<b class="mini-status ${statusClass(status)}">${status}</b>` : ""}</span><span>${name}</span>${subtext ? `<small>${subtext}</small>` : ""}`; return person;
}
function renderDuty(day = els.daySelect.value || weekdayKey()) {
  els.dutyList.replaceChildren(); els.daySelect.replaceChildren();
  if (!state.duty) { els.dutyWeekNotice.textContent = "请在数据管理中导入 duty-data.js"; els.dutyList.append(emptyNode("尚未导入值日安排")); return; }
  const labels = state.duty.dayOrder || Object.keys(state.duty.days); labels.forEach((label) => els.daySelect.add(new Option(label,label)));
  if (!state.duty.days[day]) day = labels.includes("周一") ? "周一" : labels[0]; els.daySelect.value = day;
  const today = new Date(); els.dateLabel.textContent = day === weekdayKey(today) ? `${today.getMonth()+1}月${today.getDate()}日 · 今天` : "手动查看"; els.dutyTitle.textContent = `${day}值日`;
  const old = state.duty.weekStart && state.duty.weekStart !== startOfWeek(today);
  els.dutyWeekNotice.textContent = `${state.duty.weekLabel || state.duty.weekStart || "当前值日表"}${old ? " · 注意：不是本周数据" : ""}`; els.dutyWeekNotice.classList.toggle("warning", Boolean(old));
  const groups = state.duty.days[day] || [];
  if (!groups.length) { els.dutyList.append(emptyNode("当天没有设置值日名单")); return; }
  groups.forEach((group) => {
    const section = document.createElement("section"); section.className = "duty-group";
    const hasLeave = group.names.some((n) => statusFor(n) === "请假");
    section.innerHTML = `<div class="duty-group-head"><h3>${group.task}</h3><span>${group.names.length} 人${hasLeave ? " · 有人请假" : ""}</span></div><div class="avatar-strip"></div>`;
    const strip = section.querySelector(".avatar-strip");
    group.names.forEach((name) => { const person = smallPerson(studentByName(name), name, statusFor(name)); person.addEventListener("click", () => openPerson(name, group.names)); strip.append(person); });
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
  const dorm = dormFor(name); const status = statusFor(name); els.personName.textContent = name; els.personPhoto.src = imageFor(student); els.personPhoto.alt = name; els.personPinyin.textContent = student.pinyin || ""; els.personDorm.textContent = `${status}${dorm ? ` · ${dorm.room.room}${dorm.member.bed ? ` · ${dorm.member.bed}` : ""}` : " · 未登记宿舍"}`;
  els.personStatus.replaceChildren(...STATUS_ORDER.filter((s) => s !== "待确认").map((s) => new Option(s,s))); els.personStatus.value = status === "待确认" ? "请假" : status; els.leaveUntil.value = state.leaves[name]?.until || TODAY; els.personNote.value = noteFor(name); toggleLeaveField();
  els.personPrev.disabled = state.viewerIndex === 0; els.personNext.disabled = state.viewerIndex === state.viewerNames.length - 1;
  els.personPick.textContent = state.picked.has(name) ? "已加入点人" : "加入点人"; els.personPick.classList.toggle("picked", state.picked.has(name));
}
function openPerson(name, contextNames = null) {
  const student = studentByName(name); if (!student) return toast(`名册中没有 ${name}`);
  const names = [...new Set((contextNames?.length ? contextNames : activeStudents().map((item) => item.name)).filter((item) => studentByName(item)))];
  if (!names.includes(name)) names.unshift(name); state.viewerNames = names; els.personEditor.classList.add("hidden"); showViewerPerson(names.indexOf(name)); els.personDialog.showModal();
}
function toggleLeaveField() { els.leaveUntilWrap.classList.toggle("hidden", els.personStatus.value !== "请假"); }
function compressPhoto(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => { const img = new Image(); img.onerror = reject; img.onload = () => { const scale = Math.min(1, 720 / Math.max(img.width,img.height)); const canvas = document.createElement("canvas"); canvas.width = Math.round(img.width*scale); canvas.height = Math.round(img.height*scale); canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height); resolve(canvas.toDataURL("image/jpeg",.76)); }; img.src = reader.result; }; reader.readAsDataURL(file); });
}
async function savePerson() {
  const name = state.currentPerson; if (!name) return; const status = els.personStatus.value; const note = els.personNote.value.trim();
  if (status === "请假") { state.leaves[name] = { until: els.leaveUntil.value || TODAY, note }; delete state.whereabouts[name]; }
  else { delete state.leaves[name]; if (status === "在班" && !note) delete state.whereabouts[name]; else state.whereabouts[name] = { status, note }; }
  if (state.pendingPhoto) { studentByName(name).image = state.pendingPhoto; await dbSet("students", state.studentsPack); }
  await Promise.all([dbSet(`where:${TODAY}`,state.whereabouts),dbSet("leaves",state.leaves)]); els.personDialog.close(); renderAll(); toast(`已更新 ${name}`);
}

function setMode(mode) {
  state.mode = mode; document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  els.findView.classList.toggle("hidden", ["duty","dorm","where"].includes(mode)); els.dutyView.classList.toggle("hidden", mode !== "duty"); els.dormView.classList.toggle("hidden", mode !== "dorm"); els.whereView.classList.toggle("hidden", mode !== "where"); els.batchView.classList.toggle("hidden", mode !== "batch"); els.searchPanel.classList.toggle("hidden", !["find","batch"].includes(mode));
  if (mode === "duty") renderDuty(); if (mode === "dorm") renderDorm(); if (mode === "where") renderWhere(); if (mode === "batch") { renderStudents(); renderPicked(); setTimeout(() => els.searchInput.focus(),50); }
}
function renderDataStatus() {
  els.dataStatus.textContent = `当前名册 · ${activeStudents().length} 名在读学生 · 照片 ${students().filter((s)=>s.image).length}/${students().length}`;
  els.dutyDataStatus.textContent = state.duty ? `${state.duty.weekLabel || state.duty.weekStart || "已导入"} · 版本 ${state.duty.version || "未标注"}` : "尚未导入";
  els.dormDataStatus.textContent = state.dorm ? `${state.dorm.rooms.length} 间宿舍 · ${state.dorm.rooms.reduce((n,r)=>n+r.members.length,0)} 人` : "尚未导入";
}
function renderAll() {
  const ready = Boolean(state.studentsPack); els.setup.classList.toggle("hidden",ready); els.app.classList.toggle("hidden",!ready); els.dataButton.classList.toggle("hidden",!ready); if (!ready) return;
  persistPicked(); renderDataStatus(); renderStudents(); renderDuty(); renderDorm(); renderWhere(); renderPicked(); setMode(state.mode);
}
let toastTimer; function toast(message) { els.toast.textContent = message; els.toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.classList.remove("show"),2200); }

document.querySelectorAll(".mode").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
els.searchInput.addEventListener("input", (e) => { state.query = e.target.value.trim(); renderStudents(); }); els.clearSearch.addEventListener("click", () => { state.query=""; els.searchInput.value=""; renderStudents(); els.searchInput.focus(); }); els.daySelect.addEventListener("change", () => renderDuty(els.daySelect.value));
els.studentSetupFile.addEventListener("change", (e) => importDataFile(e.target.files[0],"students")); els.studentFile.addEventListener("change", (e) => importDataFile(e.target.files[0],"students")); els.dutyFile.addEventListener("change", (e) => importDataFile(e.target.files[0],"duty")); els.dormFile.addEventListener("change", (e) => importDataFile(e.target.files[0],"dorm"));
els.dataButton.addEventListener("click", () => { renderDataStatus(); els.dataDialog.showModal(); }); els.exportStudents.addEventListener("click", () => exportJS("FIND_PERSON_STUDENTS_DATA",state.studentsPack,`students-data-${TODAY}.js`)); els.exportDuty.addEventListener("click", () => exportJS("FIND_PERSON_DUTY_DATA",state.duty,`duty-data-${state.duty?.weekStart || TODAY}.js`)); els.exportDorm.addEventListener("click", () => exportJS("FIND_PERSON_DORM_DATA",state.dorm,`dorm-data-${TODAY}.js`));
els.forgetData.addEventListener("click", async () => { if (!window.confirm("确定清除这台设备上的学生、值日、宿舍和状态数据吗？请先导出学生头像总库备份。")) return; await clearDB(); state.studentsPack=state.duty=state.dorm=null; state.whereabouts={}; state.leaves={}; state.picked.clear(); persistPicked(); els.dataDialog.close(); renderAll(); toast("已清除本机全部数据"); });
els.batchNote.value = localStorage.getItem("find-person-note") || ""; els.batchNote.addEventListener("input", () => localStorage.setItem("find-person-note",els.batchNote.value)); els.clearBatch.addEventListener("click", () => { state.picked.clear(); persistPicked(); renderPicked(); renderStudents(); toast("已清空点名组"); });
els.copyBatch.addEventListener("click", async () => { if (!state.picked.size) return toast("还没有选择学生"); const note=els.batchNote.value.trim(); const text=`人员：${[...state.picked].join("、")}${note?`\n事项：${note}`:""}`; try { await navigator.clipboard.writeText(text); toast("名单与备注已复制"); } catch { window.prompt("长按复制",text); } });
els.personStatus.addEventListener("change",toggleLeaveField); els.personPhotoFile.addEventListener("change", async (e) => { if (!e.target.files[0]) return; try { state.pendingPhoto=await compressPhoto(e.target.files[0]); els.personPhoto.src=state.pendingPhoto; toast("照片已处理，点保存生效"); } catch { toast("照片处理失败"); } }); els.savePerson.addEventListener("click",savePerson);
els.personPrev.addEventListener("click", () => { els.personEditor.classList.add("hidden"); showViewerPerson(state.viewerIndex - 1); });
els.personNext.addEventListener("click", () => { els.personEditor.classList.add("hidden"); showViewerPerson(state.viewerIndex + 1); });
els.personPick.addEventListener("click", () => { const index = state.viewerIndex; togglePick(state.currentPerson); showViewerPerson(index); });
els.togglePersonEditor.addEventListener("click", () => els.personEditor.classList.remove("hidden")); els.closePersonEditor.addEventListener("click", () => els.personEditor.classList.add("hidden"));
let viewerTouchX = null;
els.personHero.addEventListener("touchstart", (event) => { viewerTouchX = event.touches.length === 1 ? event.touches[0].clientX : null; }, { passive: true });
els.personHero.addEventListener("touchend", (event) => { if (viewerTouchX === null || event.changedTouches.length !== 1) return; const delta = event.changedTouches[0].clientX - viewerTouchX; viewerTouchX = null; if (Math.abs(delta) < 55) return; els.personEditor.classList.add("hidden"); showViewerPerson(state.viewerIndex + (delta < 0 ? 1 : -1)); }, { passive: true });
els.personDialog.addEventListener("keydown", (event) => { if (event.key === "ArrowLeft") showViewerPerson(state.viewerIndex - 1); if (event.key === "ArrowRight") showViewerPerson(state.viewerIndex + 1); });
els.resetWhere.addEventListener("click", async () => { if (!window.confirm("将今日临时去向全部恢复为“在班”？请假标记会保留。")) return; state.whereabouts={}; await dbSet(`where:${TODAY}`,state.whereabouts); renderAll(); toast("今日临时去向已重置，请假标记保留"); });

(async () => {
  try {
    const [studentsData,duty,dorm,legacy,where,leaves] = await Promise.all([dbGet("students"),dbGet("duty"),dbGet("dorm"),dbGet("active"),dbGet(`where:${TODAY}`),dbGet("leaves")]);
    state.studentsPack=studentsData; state.duty=duty; state.dorm=dorm; state.whereabouts=where||{}; state.leaves=leaves||{};
    if (!state.studentsPack && legacy?.students) { state.studentsPack={version:legacy.version,className:legacy.className,students:legacy.students}; state.duty=state.duty||legacy.duty||null; state.dorm=state.dorm||legacy.dorm||null; await Promise.all([dbSet("students",state.studentsPack),dbSet("duty",state.duty),dbSet("dorm",state.dorm)]); }
  } catch { toast("无法读取本机数据"); }
  renderAll(); if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
