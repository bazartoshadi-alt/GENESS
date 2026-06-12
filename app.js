const APP_KEY = "hirova_talent_os_public_ready_v1";
const DEFAULT_PASSWORD_HASH = "ae2840305a2425def04db234a67166fe1cb6ee6807a16727edc40312d3374274";
const stages = ["جديد", "فرز أولي", "مقابلة", "عرض وظيفي", "تعيين"];
const rejectedStage = "مرفوض";
const statusLabels = { draft:"مسودة", published:"منشور", paused:"موقوف", closed:"مغلق" };
const statusClass = { draft:"status-draft", published:"status-published", paused:"status-paused", closed:"status-closed" };

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const todayISO = () => new Date().toISOString().slice(0,10);

let state = loadState();
let authed = sessionStorage.getItem("hirova_admin") === "true";
let floatingAiMode = null;

function defaultState(){
  return {
    settings:{ companyName:"Hirova", adminPasswordHash:DEFAULT_PASSWORD_HASH, calm:false },
    jobs:[{
      id:uid(), title:"مشرف مبيعات", dept:"المبيعات", location:"الساحل", type:"دوام كامل", level:"إشرافي", deadline:"",
      summary:"قيادة فريق المندوبين ومتابعة تنفيذ الخطط البيعية اليومية والشهرية بدقة عالية.",
      duties:"متابعة أداء المندوبين وتحقيق الأهداف\nتحليل التغطية البيعية وحركة السوق\nرفع التقارير اليومية والشهرية\nتنسيق العروض ومتابعة التزام نقاط البيع",
      reqs:"خبرة لا تقل عن 3 سنوات في المبيعات\nقدرة عالية على قيادة الفريق\nإتقان Excel والتقارير\nمهارات تواصل وتفاوض ممتازة",
      keywords:"مبيعات، قيادة فريق، تقارير، Excel، سوق، مندوبين", status:"published", createdAt:todayISO(), updatedAt:todayISO()
    }],
    candidates:[]
  };
}
function loadState(){
  try{ return JSON.parse(localStorage.getItem(APP_KEY)) || defaultState(); }catch{ return defaultState(); }
}
function saveState(){ localStorage.setItem(APP_KEY, JSON.stringify(state)); renderAll(); }
function syncMode(){ document.body.classList.toggle("admin-mode", !!authed); }
async function sha256(text){ const data = new TextEncoder().encode(text); const hash = await crypto.subtle.digest("SHA-256", data); return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join(""); }
async function verifyAdminPassword(password){ return (await sha256(password)) === (state.settings.adminPasswordHash || DEFAULT_PASSWORD_HASH); }
function toast(message){
  const stack = $("#toastStack");
  const node = document.createElement("div"); node.className = "toast"; node.textContent = message;
  stack.appendChild(node); setTimeout(()=>node.remove(), 3200);
}
function requireAdmin(){
  if(authed) return true;
  $("#loginModal").showModal();
  return false;
}
function openModal(id){
  if(["jobModal"].includes(id) && !requireAdmin()) return;
  if(id === "candidateModal"){
    fillCandidateJobSelect();
    $("#candidateModalTitle").textContent = authed ? "إضافة / تحرير مرشح" : "تقديم على شاغر";
    $("#saveCandidateBtn").textContent = authed ? "حفظ المرشح" : "إرسال الطلب";
  }
  $("#"+id).showModal();
}
function closeModal(id){ $("#"+id).close(); }

function navigate(view){
  if(["dashboard","portal"].includes(view) === false && !requireAdmin()) return;
  $$(".nav-item").forEach(b=>b.classList.toggle("active", b.dataset.view === view));
  $$(".view").forEach(v=>v.classList.remove("active"));
  const el = $("#"+view+"View"); el.classList.add("active");
  $("#pageTitle").textContent = el.dataset.title || "Hirova";
  window.scrollTo({top:0, behavior:"smooth"});
}

function renderAll(){
  syncMode();
  document.body.classList.toggle("calm", !!state.settings.calm);
  renderKpis(); renderFunnel(); renderAlerts(); renderRequisitions(); renderJobs(); renderCandidates(); renderKanban(); renderAiSelectors(); renderPortal(); renderPublicJobs(); renderSettings(); renderFloatingAssistant();
}
function metric(){
  const jobs = state.jobs, c = state.candidates;
  const published = jobs.filter(j=>j.status==="published").length;
  const draft = jobs.filter(j=>j.status==="draft").length;
  const hired = c.filter(x=>x.stage==="تعيين").length;
  const avg = c.length ? Math.round(c.reduce((s,x)=>s+(x.score||0),0)/c.length) : 0;
  const activeCand = c.filter(x=>x.stage!==rejectedStage && x.stage!=="تعيين").length;
  const health = Math.min(99, Math.max(42, 78 + published*4 + hired*3 - draft*2 + (avg>70?5:0)));
  return {jobs:jobs.length,published,draft,candidates:c.length,hired,avg,activeCand,health};
}
function renderKpis(){
  const m = metric(); $("#talentHealth").textContent = m.health + "%";
  const rows = [
    ["طلبات الشواغر", m.jobs, "إجمالي الطلبات المحفوظة"],
    ["شواغر منشورة", m.published, "تظهر في بوابة التقديم"],
    ["المرشحون", m.candidates, "إجمالي الطلبات الواردة"],
    ["متوسط الملاءمة", m.avg + "%", "حسب الكلمات المفتاحية والخبرة"]
  ];
  $("#kpiGrid").innerHTML = rows.map(r=>`<article class="kpi-card"><span>${r[0]}</span><strong>${r[1]}</strong><small>${r[2]}</small></article>`).join("");
}
function renderFunnel(){
  const c = state.candidates;
  const counts = [
    ["طلبات واردة", c.length], ["فرز أولي", c.filter(x=>["فرز أولي","مقابلة","عرض وظيفي","تعيين"].includes(x.stage)).length],
    ["مقابلات", c.filter(x=>["مقابلة","عرض وظيفي","تعيين"].includes(x.stage)).length], ["عروض", c.filter(x=>["عرض وظيفي","تعيين"].includes(x.stage)).length], ["تعيين", c.filter(x=>x.stage==="تعيين").length]
  ];
  const max = Math.max(1, counts[0][1]);
  $("#funnelChart").innerHTML = counts.map(([label,val])=>`<div class="funnel-row"><strong>${label}</strong><div class="bar-shell"><div class="bar" style="width:${Math.max(8, val/max*100)}%"></div></div><span>${val}</span></div>`).join("");
}
function renderAlerts(){
  const alerts = [];
  const noKeywords = state.jobs.filter(j=>j.status==="published" && !j.keywords.trim());
  const noCandidates = state.jobs.filter(j=>j.status==="published" && !state.candidates.some(c=>c.jobId===j.id));
  if(noCandidates.length) alerts.push(["warning", `يوجد ${noCandidates.length} شاغر منشور بدون مرشحين حتى الآن. راجع الإعلان أو قنوات النشر.`]);
  if(noKeywords.length) alerts.push(["danger", `يوجد ${noKeywords.length} إعلان منشور بدون كلمات فرز ذكية؛ دقة التحليل ستكون أقل.`]);
  const top = [...state.candidates].sort((a,b)=>(b.score||0)-(a.score||0))[0];
  if(top) alerts.push(["", `أفضل مرشح حالياً: ${top.name} بنسبة ملاءمة ${top.score || 0}% لشاغر ${jobTitle(top.jobId)}.`]);
  if(!alerts.length) alerts.push(["", "لا توجد تنبيهات حرجة. النظام جاهز لاستقبال الطلبات ومتابعة خط التوظيف."]);
  $("#smartAlerts").innerHTML = alerts.map(a=>`<div class="alert ${a[0]}">${a[1]}</div>`).join("");
}
function jobTitle(id){ return state.jobs.find(j=>j.id===id)?.title || "غير محدد"; }
function jobById(id){ return state.jobs.find(j=>j.id===id); }
function renderRequisitions(){
  const q = ($("#reqSearch")?.value || "").trim().toLowerCase();
  const filter = $("#reqStatusFilter")?.value || "all";
  const list = state.jobs.filter(j=> (filter==="all"||j.status===filter) && [j.title,j.dept,j.location,j.level].join(" ").toLowerCase().includes(q));
  $("#requisitionsList").innerHTML = list.length ? list.map(jobCard).join("") : empty("لا توجد طلبات مطابقة.");
}
function renderJobs(){
  const list = state.jobs.filter(j=>j.status==="published");
  $("#jobsList").innerHTML = list.length ? list.map(jobCard).join("") : empty("لا توجد شواغر منشورة حالياً. افتح طلب شاغر واضغط تشغيل الإعلان.");
}
function jobCard(j){
  const candCount = state.candidates.filter(c=>c.jobId===j.id).length;
  return `<article class="job-card">
    <div class="meta"><span class="pill ${statusClass[j.status]}">${statusLabels[j.status]}</span><span class="pill">${j.level}</span><span class="pill">${candCount} مرشح</span></div>
    <h3>${esc(j.title)}</h3><div class="meta"><span class="pill">${esc(j.dept)}</span><span class="pill">${esc(j.location)}</span><span class="pill">${esc(j.type)}</span></div>
    <p>${esc(j.summary || "لا يوجد ملخص بعد.")}</p>
    <div class="card-actions">
      <button class="btn mini ghost" onclick="editJob('${j.id}')">تعديل</button>
      ${j.status!=="published"?`<button class="btn mini secondary" onclick="setJobStatus('${j.id}','published')">تشغيل الإعلان</button>`:`<button class="btn mini ghost" onclick="setJobStatus('${j.id}','paused')">إيقاف</button>`}
      ${j.status!=="closed"?`<button class="btn mini danger" onclick="setJobStatus('${j.id}','closed')">إغلاق</button>`:""}
      <button class="btn mini primary" onclick="applyForJob('${j.id}')">تقديم</button>
    </div>
  </article>`;
}
function empty(text){ return `<div class="empty">${text}</div>`; }
function esc(v=""){ return String(v).replace(/[&<>'"]/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[m])); }

function fillJobForm(j={}){
  $("#jobId").value = j.id || ""; $("#jobTitle").value = j.title || ""; $("#jobDept").value = j.dept || ""; $("#jobLocation").value = j.location || "";
  $("#jobType").value = j.type || "دوام كامل"; $("#jobLevel").value = j.level || "إشرافي"; $("#jobDeadline").value = j.deadline || "";
  $("#jobSummary").value = j.summary || ""; $("#jobDuties").value = j.duties || ""; $("#jobReqs").value = j.reqs || ""; $("#jobKeywords").value = j.keywords || "";
}
window.editJob = function(id){ if(!requireAdmin()) return; fillJobForm(jobById(id)); openModal("jobModal"); }
window.setJobStatus = function(id,status){ if(!requireAdmin()) return; const j=jobById(id); if(j){ j.status=status; j.updatedAt=todayISO(); saveState(); toast(status==="published"?"تم تشغيل الإعلان ونشره في البوابة.":"تم تحديث حالة الشاغر."); }}
function collectJob(status){
  const data = { id:$("#jobId").value || uid(), title:$("#jobTitle").value.trim(), dept:$("#jobDept").value.trim(), location:$("#jobLocation").value.trim(), type:$("#jobType").value, level:$("#jobLevel").value, deadline:$("#jobDeadline").value, summary:$("#jobSummary").value.trim(), duties:$("#jobDuties").value.trim(), reqs:$("#jobReqs").value.trim(), keywords:$("#jobKeywords").value.trim(), status, updatedAt:todayISO() };
  if(!data.title || !data.dept || !data.location) throw new Error("أدخل المسمى والقسم والموقع.");
  return data;
}
function saveJob(status){
  try{
    const data = collectJob(status); const i = state.jobs.findIndex(j=>j.id===data.id);
    if(i>=0) state.jobs[i] = {...state.jobs[i],...data}; else state.jobs.unshift({...data,createdAt:todayISO()});
    closeModal("jobModal"); fillJobForm(); saveState(); toast(status==="published"?"تم حفظ وتشغيل الإعلان.":"تم حفظ المسودة.");
  }catch(e){ toast(e.message); }
}

function fillCandidateJobSelect(){
  const published = state.jobs.filter(j=>j.status==="published");
  const opts = (published.length?published:state.jobs).map(j=>`<option value="${j.id}">${esc(j.title)} - ${esc(j.location)}</option>`).join("");
  $("#candidateJob").innerHTML = opts || `<option value="">لا يوجد شاغر</option>`;
}
window.applyForJob = function(id){ fillCandidateJobSelect(); $("#candidateJob").value=id; openModal("candidateModal"); }
function renderCandidates(){
  const q = ($("#candidateSearch")?.value || "").toLowerCase(); const stage = $("#candidateStageFilter")?.value || "all"; const job = $("#candidateJobFilter")?.value || "all";
  $("#candidateStageFilter").innerHTML = `<option value="all">كل المراحل</option>`+[...stages,rejectedStage].map(s=>`<option value="${s}">${s}</option>`).join(""); $("#candidateStageFilter").value = stage;
  $("#candidateJobFilter").innerHTML = `<option value="all">كل الشواغر</option>`+state.jobs.map(j=>`<option value="${j.id}">${esc(j.title)}</option>`).join(""); $("#candidateJobFilter").value = job;
  const list = state.candidates.filter(c=> (stage==="all"||c.stage===stage) && (job==="all"||c.jobId===job) && [c.name,c.phone,c.email,c.city,c.skills,c.summary,jobTitle(c.jobId)].join(" ").toLowerCase().includes(q));
  $("#candidatesTable").innerHTML = list.length ? list.map(c=>`<tr>
    <td><div class="candidate-main"><strong>${esc(c.name)}</strong><small>${esc(c.phone||"")} ${esc(c.email||"")}</small></div></td>
    <td>${esc(jobTitle(c.jobId))}</td><td>${c.exp||0} سنوات</td>
    <td><select class="input" onchange="changeCandidateStage('${c.id}', this.value)">${[...stages,rejectedStage].map(s=>`<option ${c.stage===s?"selected":""}>${s}</option>`).join("")}</select></td>
    <td><div class="score-ring" style="--pct:${c.score||0}"><span>${c.score||0}%</span></div></td>
    <td><button class="btn mini ghost" onclick="editCandidate('${c.id}')">تعديل</button> <button class="btn mini primary" onclick="quickAnalyze('${c.id}')">تحليل</button></td>
  </tr>`).join("") : `<tr><td colspan="6">${empty("لا يوجد مرشحون مطابقون.")}</td></tr>`;
}
window.changeCandidateStage = function(id, stage){ const c=state.candidates.find(x=>x.id===id); if(c){ c.stage=stage; saveState(); toast("تم تحديث مرحلة المرشح."); }}
function collectCandidate(){
  const cv = $("#candidateCv").files?.[0];
  const data = { id:$("#candidateId").value || uid(), jobId:$("#candidateJob").value, name:$("#candidateName").value.trim(), phone:$("#candidatePhone").value.trim(), email:$("#candidateEmail").value.trim(), city:$("#candidateCity").value.trim(), exp:Number($("#candidateExp").value||0), skills:$("#candidateSkills").value.trim(), summary:$("#candidateSummary").value.trim(), notes:$("#candidateNotes").value.trim(), cvName:cv?.name || $("#candidateCv").dataset.old || "", stage:"جديد" };
  if(!data.jobId || !data.name) throw new Error("اختر الشاغر واكتب اسم المرشح.");
  data.score = scoreCandidate(data, jobById(data.jobId)).score;
  return data;
}
function clearCandidateForm(){ $("#candidateForm").reset(); $("#candidateId").value=""; $("#candidateCv").dataset.old=""; }
function saveCandidate(){
  try{ const wasAdmin = authed; const data=collectCandidate(); const i=state.candidates.findIndex(c=>c.id===data.id); if(i>=0) state.candidates[i]={...state.candidates[i],...data}; else state.candidates.unshift({...data,createdAt:todayISO()}); closeModal("candidateModal"); clearCandidateForm(); saveState(); toast(wasAdmin ? "تم حفظ المرشح وحساب الملاءمة." : "تم إرسال طلبك بنجاح."); } catch(e){ toast(e.message); }
}
window.editCandidate = function(id){ if(!requireAdmin()) return; const c=state.candidates.find(x=>x.id===id); if(!c) return; fillCandidateJobSelect(); $("#candidateId").value=c.id; $("#candidateJob").value=c.jobId; $("#candidateName").value=c.name; $("#candidatePhone").value=c.phone||""; $("#candidateEmail").value=c.email||""; $("#candidateCity").value=c.city||""; $("#candidateExp").value=c.exp||0; $("#candidateSkills").value=c.skills||""; $("#candidateSummary").value=c.summary||""; $("#candidateNotes").value=c.notes||""; $("#candidateCv").dataset.old=c.cvName||""; openModal("candidateModal"); }

function scoreCandidate(c,j){
  if(!j) return {score:0, hits:[], missing:[], level:"low"};
  const text = [c.skills,c.summary,c.notes].join(" ").toLowerCase();
  const keys = (j.keywords || j.reqs || "").split(/[،,\n]/).map(x=>x.trim().toLowerCase()).filter(Boolean);
  const hits = keys.filter(k=>text.includes(k)); const missing = keys.filter(k=>!text.includes(k));
  let score = keys.length ? Math.round(hits.length/keys.length*70) : 35;
  score += Math.min(20, (Number(c.exp)||0)*4);
  if((c.summary||"").length > 120) score += 10;
  score = Math.min(98, score);
  return {score, hits, missing, level:score>=75?"good":score>=50?"mid":"low"};
}
function renderKanban(){
  $("#kanbanBoard").innerHTML = [...stages,rejectedStage].map(s=>{
    const list = state.candidates.filter(c=>c.stage===s);
    return `<div class="kanban-col" data-stage="${s}"><div class="kanban-head"><h3>${s}</h3><span class="kanban-count">${list.length}</span></div>${list.map(c=>`<div class="candidate-card" draggable="true" data-id="${c.id}"><strong>${esc(c.name)}</strong><small>${esc(jobTitle(c.jobId))}</small><small>ملاءمة ${c.score||0}%</small></div>`).join("") || `<div class="empty">لا يوجد</div>`}</div>`
  }).join("");
  $$(".candidate-card").forEach(card=> card.addEventListener("dragstart", e=> e.dataTransfer.setData("text/plain", card.dataset.id)) );
  $$(".kanban-col").forEach(col=>{
    col.addEventListener("dragover", e=>e.preventDefault());
    col.addEventListener("drop", e=>{ e.preventDefault(); const id=e.dataTransfer.getData("text/plain"); const c=state.candidates.find(x=>x.id===id); if(c){ c.stage=col.dataset.stage; saveState(); toast("تم نقل المرشح إلى " + col.dataset.stage); }});
  });
}

function renderAiSelectors(){
  const jobOpts = state.jobs.map(j=>`<option value="${j.id}">${esc(j.title)} - ${esc(j.location)}</option>`).join("");
  $("#aiJobSelect").innerHTML = jobOpts || `<option value="">لا يوجد شواغر</option>`;
  $("#aiCandidateSelect").innerHTML = state.candidates.map(c=>`<option value="${c.id}">${esc(c.name)} - ${esc(jobTitle(c.jobId))}</option>`).join("") || `<option value="">لا يوجد مرشحون</option>`;
}
function generateAd(j){
  if(!j) return "لا يوجد شاغر محدد.";
  return `تعلن ${state.settings.companyName} عن حاجتها إلى ${j.title} للعمل ضمن قسم ${j.dept} في ${j.location}.\n\nالهدف من الوظيفة:\n${j.summary || "المساهمة في تحقيق أهداف القسم وضمان تنفيذ المهام بكفاءة واحترافية."}\n\nالمهام الرئيسية:\n${bullets(j.duties)}\n\nالمؤهلات والمتطلبات:\n${bullets(j.reqs)}\n\nنوع الدوام: ${j.type}\nالمستوى الوظيفي: ${j.level}${j.deadline?`\nآخر موعد للتقديم: ${j.deadline}`:""}\n\nنبحث عن شخص منظم، مبادر، قادر على العمل ضمن فريق، ويمتلك حساً عالياً بالمسؤولية والنتائج.\n\nللتقديم يرجى تعبئة نموذج التقديم ضمن بوابة الوظائف.`;
}
function bullets(text){ const lines=(text||"").split("\n").map(x=>x.trim()).filter(Boolean); return lines.length? lines.map(x=>`• ${x}`).join("\n") : "• سيتم تحديد التفاصيل وفق الوصف الوظيفي المعتمد."; }
function analyzeCandidate(c){
  const j=jobById(c?.jobId); if(!c || !j) return "لا يوجد بيانات كافية.";
  const s=scoreCandidate(c,j); const cls = s.level==="good"?"match-good":s.level==="mid"?"match-mid":"match-low";
  return `<div class="analysis-item"><strong>نسبة الملاءمة: <span class="${cls}">${s.score}%</span></strong><br>الشاغر: ${esc(j.title)} / ${esc(j.location)}</div>
  <div class="analysis-item"><strong>نقاط قوة ظاهرة:</strong><br>${s.hits.length?s.hits.map(x=>`• ${esc(x)}`).join("<br>"):"لا توجد كلمات مفتاحية كافية ضمن النص."}</div>
  <div class="analysis-item"><strong>نقاط تحتاج تحقق:</strong><br>${s.missing.slice(0,6).length?s.missing.slice(0,6).map(x=>`• ${esc(x)}`).join("<br>"):"لا توجد فجوات واضحة من الكلمات المفتاحية."}</div>
  <div class="analysis-item"><strong>أسئلة مقابلة مقترحة:</strong><br>${interviewQuestions(j,s).map(x=>`• ${esc(x)}`).join("<br>")}</div>`;
}
function interviewQuestions(j,s){
  const base = [`احكِ عن تجربة عملية قمت فيها بإنجاز مهمة مشابهة لدور ${j.title}.`, `ما أهم مؤشر تستخدمه لقياس نجاحك في هذا الدور؟`, `كيف تتعامل مع ضغط العمل وتعدد الأولويات؟`];
  const missing = s.missing.slice(0,2).map(k=>`أعطني مثالاً يثبت خبرتك في ${k}.`);
  return [...base,...missing];
}
window.quickAnalyze = function(id){ navigate("ai"); $("#aiCandidateSelect").value=id; $("#candidateAnalysis").innerHTML = analyzeCandidate(state.candidates.find(c=>c.id===id)); }
function assistantAnswer(q){
  q=(q||"").toLowerCase(); const m=metric();
  if(q.includes("أفضل") || q.includes("افضل")){
    const top=[...state.candidates].sort((a,b)=>(b.score||0)-(a.score||0))[0]; return top?`أفضل مرشح حالياً هو ${top.name} بنسبة ${top.score||0}% لشاغر ${jobTitle(top.jobId)}. أنصح بنقله إلى مقابلة إذا لم تتم مقابلته بعد.`:"لا يوجد مرشحون بعد.";
  }
  if(q.includes("أولوي") || q.includes("اولوي") || q.includes("اليوم")){
    const unfilled=state.jobs.filter(j=>j.status==="published"&&!state.candidates.some(c=>c.jobId===j.id));
    return unfilled.length?`أولويتك اليوم: ${unfilled.length} شاغر منشور بدون مرشحين. راجع الإعلان أو زد قنوات النشر. أول شاغر: ${unfilled[0].title}.`:`أولويتك اليوم: متابعة ${m.activeCand} مرشح نشط وتحريك المرشحين المتوقفين إلى المرحلة التالية.`;
  }
  if(q.includes("مؤشر") || q.includes("تقرير")) return `تقرير سريع: ${m.jobs} شواغر، ${m.published} منشورة، ${m.candidates} مرشح، ${m.avg}% متوسط ملاءمة، ${m.hired} تعيين.`;
  return `أفهم سؤالك. حالياً عندك ${m.published} شواغر منشورة و${m.candidates} مرشح. اسألني مثلاً: "مين أفضل مرشح؟" أو "شو أولوياتي اليوم؟" أو "اعطيني تقرير".`;
}
function addChat(sender,text){ const el=document.createElement("div"); el.className=`msg ${sender}`; el.textContent=text; $("#chatLog").appendChild(el); $("#chatLog").scrollTop=99999; }


function renderPublicJobs(){
  const list = state.jobs.filter(j=>j.status==="published");
  const count = $("#publicOpenCount"); if(count) count.textContent = list.length;
  const root = $("#publicJobs"); if(!root) return;
  root.innerHTML = list.length ? list.map(j=>`<article class="job-card public-job-card"><div class="meta"><span class="pill status-published">متاح للتقديم</span><span class="pill">${esc(j.level)}</span></div><h3>${esc(j.title)}</h3><div class="meta"><span class="pill">${esc(j.dept)}</span><span class="pill">${esc(j.location)}</span><span class="pill">${esc(j.type)}</span></div><p>${esc(j.summary)}</p><button class="btn primary full" onclick="applyForJob('${j.id}')">تقديم الآن</button></article>`).join("") : empty("لا توجد شواغر متاحة حالياً.");
}

function renderPortal(){
  const list=state.jobs.filter(j=>j.status==="published");
  $("#portalJobs").innerHTML = list.length ? list.map(j=>`<article class="job-card"><div class="meta"><span class="pill status-published">متاح للتقديم</span><span class="pill">${esc(j.level)}</span></div><h3>${esc(j.title)}</h3><div class="meta"><span class="pill">${esc(j.dept)}</span><span class="pill">${esc(j.location)}</span><span class="pill">${esc(j.type)}</span></div><p>${esc(j.summary)}</p><button class="btn primary full" onclick="applyForJob('${j.id}')">تقديم الآن</button></article>`).join("") : empty("لا توجد شواغر متاحة حالياً.");
}
function renderSettings(){ $("#companyName").value=state.settings.companyName; $("#adminPassword").value=""; }
function seedDemo(){
  const demoJob={id:uid(),title:"أخصائي علاقات موظفين",dept:"الموارد البشرية",location:"دمشق",type:"دوام كامل",level:"إداري مكتبي",deadline:"",summary:"إدارة علاقات الموظفين ومتابعة الشكاوى والانضباط والتواصل الداخلي بطريقة مهنية تحفظ بيئة العمل.",duties:"متابعة شكاوى الموظفين\nإعداد تقارير علاقات الموظفين\nدعم التحقيقات الإدارية\nمتابعة الالتزام بالسياسات",reqs:"إجازة في إدارة الأعمال أو علم النفس\nخبرة لا تقل عن سنتين\nمهارات تواصل عالية\nمعرفة بقانون العمل",keywords:"علاقات موظفين، شكاوى، سياسات، قانون العمل، تواصل",status:"published",createdAt:todayISO(),updatedAt:todayISO()};
  state.jobs.unshift(demoJob);
  state.candidates.unshift({id:uid(),jobId:demoJob.id,name:"سارة الأحمد",phone:"0999999999",email:"sara@example.com",city:"دمشق",exp:3,skills:"علاقات موظفين، شكاوى، سياسات، تواصل",summary:"خبرة في متابعة شكاوى الموظفين وتنظيم ملفات التحقيق الإداري والتواصل الداخلي.",notes:"مرشحة جيدة للفرز الأولي",cvName:"sara_cv.pdf",stage:"فرز أولي",score:86,createdAt:todayISO()});
  saveState(); toast("تمت إضافة بيانات تجريبية احترافية.");
}
function exportJson(){ downloadFile(`hirova-backup-${todayISO()}.json`, JSON.stringify(state,null,2), "application/json"); }
function exportCsv(){
  const rows=[["Name","Job","Phone","Email","City","Experience","Stage","Score","Skills","Notes"]].concat(state.candidates.map(c=>[c.name,jobTitle(c.jobId),c.phone,c.email,c.city,c.exp,c.stage,c.score,c.skills,c.notes]));
  const csv=rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n"); downloadFile(`hirova-candidates-${todayISO()}.csv`, csv, "text/csv;charset=utf-8");
}
function downloadFile(name, content, type){ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([content],{type})); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
function parseCandidateText(){
  const text=$("#candidateSummary").value; if(!text.trim()) return toast("ضع نص السيرة أو الملخص أولاً.");
  const email=text.match(/[\w.-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0]; const phone=text.match(/(?:\+?\d[\d\s-]{7,}\d)/)?.[0];
  if(email) $("#candidateEmail").value=email; if(phone) $("#candidatePhone").value=phone;
  const skills=["Excel","Sales","HR","Recruitment","Leadership","Reporting","Payroll","Training","مبيعات","توظيف","قيادة","تقارير","موارد بشرية","علاقات موظفين"].filter(k=>text.toLowerCase().includes(k.toLowerCase()));
  if(skills.length) $("#candidateSkills").value = [...new Set([$("#candidateSkills").value,...skills].filter(Boolean))].join(", ");
  toast("تم استخراج البريد/الهاتف/المهارات الممكنة من النص.");
}
function importJson(file){
  const reader=new FileReader(); reader.onload=()=>{ try{ const data=JSON.parse(reader.result); if(!data.jobs || !data.candidates) throw new Error(); state=data; saveState(); toast("تم استيراد النسخة بنجاح."); }catch{ toast("ملف النسخة غير صالح."); } }; reader.readAsText(file);
}


function openFloatingAi(){
  $("#floatingAi").classList.add("open");
  renderFloatingAssistant();
}
function closeFloatingAi(){ $("#floatingAi").classList.remove("open"); }
function resetFloatingLog(message){
  const log = $("#floatingAiLog");
  if(!log) return;
  log.innerHTML = "";
  addFloatingMessage("bot", message);
}
function renderFloatingAssistant(){
  const mode = authed ? "owner" : "visitor";
  if(floatingAiMode !== mode){
    floatingAiMode = mode;
    resetFloatingLog(mode === "owner" ? "أهلاً، أنا مساعد صاحب الموقع. أقدر أعطيك أفضل مرشح، المخاطر، أسئلة مقابلة، وتقرير سريع." : "أهلاً، أنا مساعد المتقدمين. أقدر أساعدك باختيار الشاغر الأنسب، فهم طريقة التقديم، ومعرفة الشواغر المتاحة.");
  }
  $("#floatingAiTitle").textContent = mode === "owner" ? "مساعد صاحب الموقع" : "مساعد المتقدمين";
  $("#floatingAiSub").textContent = mode === "owner" ? "تحليل داخلي للمرشحين بعد دخول الإدارة" : "إرشاد عام للزوار والمتقدمين فقط";
  const chips = mode === "owner" ? ["أفضل مرشح", "مخاطر المرشحين", "أسئلة مقابلة", "تقرير سريع"] : ["ما الشواغر المتاحة؟", "ما الوظيفة الأنسب لي؟", "كيف أقدم؟", "ماذا أكتب في ملخص الخبرة؟"];
  $("#floatingAiQuick").innerHTML = chips.map(c=>`<button class="ai-chip-btn" type="button" data-ai-chip="${esc(c)}">${esc(c)}</button>`).join("");
  $$("[data-ai-chip]", $("#floatingAiQuick")).forEach(b=>b.addEventListener("click",()=>askFloatingAi(b.dataset.aiChip)));
}
function addFloatingMessage(sender,text){
  const log = $("#floatingAiLog");
  const el = document.createElement("div");
  el.className = `msg ${sender}`;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = 99999;
}
function askFloatingAi(q){
  q = (q || "").trim();
  if(!q) return;
  addFloatingMessage("user", q);
  addFloatingMessage("bot", authed ? ownerFloatingAnswer(q) : visitorFloatingAnswer(q));
}
function visitorFloatingAnswer(q){
  const text = q.toLowerCase();
  const jobs = state.jobs.filter(j=>j.status==="published");
  if(!jobs.length) return "حالياً لا توجد شواغر منشورة. يمكنك العودة لاحقاً عند فتح شواغر جديدة.";
  if(text.includes("شواغر") || text.includes("متاحة") || text.includes("وظائف")){
    return "الشواغر المتاحة حالياً: " + jobs.map(j=>`${j.title} - ${j.location}`).join("، ") + ".";
  }
  if(text.includes("كيف") || text.includes("أقدم") || text.includes("اقدم") || text.includes("تقديم")){
    return "للتقديم: اختر الشاغر المناسب، اضغط زر تقديم الآن، اكتب بياناتك الأساسية، أضف مهاراتك وملخص خبرتك، ثم أرسل الطلب. لا تحتاج أي حساب.";
  }
  if(text.includes("ملخص") || text.includes("خبرة") || text.includes("اكتب")){
    return "اكتب ملخصاً قصيراً يوضح سنوات الخبرة، أهم المهارات، آخر دور عملت به، وأبرز إنجاز مرتبط بالشاغر. مثال: لدي 3 سنوات في المبيعات، خبرة بقيادة فريق، إعداد تقارير Excel، ومتابعة العملاء.";
  }
  const tokens = text.split(/\s+|،|,/).filter(w=>w.length>2);
  const ranked = jobs.map(j=>{
    const hay = [j.title,j.dept,j.location,j.level,j.summary,j.duties,j.reqs,j.keywords].join(" ").toLowerCase();
    return {job:j, score:tokens.reduce((s,t)=>s+(hay.includes(t)?1:0),0)};
  }).sort((a,b)=>b.score-a.score);
  if(text.includes("أنسب") || text.includes("انسب") || text.includes("مناسب") || ranked[0].score>0){
    const best = ranked[0].score>0 ? ranked[0].job : jobs[0];
    return `الأنسب مبدئياً حسب كلامك قد يكون: ${best.title} في ${best.location}. راجع المتطلبات واضغط تقديم الآن إذا كانت خبرتك قريبة منها.`;
  }
  return "أستطيع مساعدتك كمتقدم فقط. اسألني عن الشواغر المتاحة، طريقة التقديم، أو اكتب خبرتك ومهاراتك لأقترح الشاغر الأقرب.";
}
function ownerFloatingAnswer(q){
  const text = q.toLowerCase();
  if(text.includes("مخاطر")){
    const low = state.candidates.filter(c=>(c.score||0)<50).length;
    const noCv = state.candidates.filter(c=>!c.cvName).length;
    const noCand = state.jobs.filter(j=>j.status==="published"&&!state.candidates.some(c=>c.jobId===j.id)).length;
    return `مخاطر حالية: ${low} مرشح بملاءمة منخفضة، ${noCv} طلب بدون سيرة ذاتية، و${noCand} شاغر منشور بدون مرشحين.`;
  }
  if(text.includes("أسئلة") || text.includes("اسئلة")){
    const top=[...state.candidates].sort((a,b)=>(b.score||0)-(a.score||0))[0];
    if(!top) return "لا يوجد مرشحون بعد لتوليد أسئلة مقابلة عليهم.";
    const j=jobById(top.jobId), s=scoreCandidate(top,j);
    return `أسئلة مقترحة لـ ${top.name}: ` + interviewQuestions(j,s).join(" | ");
  }
  return assistantAnswer(q);
}

function bind(){
  $$(".nav-item").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.view)));
  $$('[data-view-go]').forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.viewGo)));
  $$('[data-open]').forEach(b=>b.addEventListener("click",()=>openModal(b.dataset.open)));
  $("#loginBtn").addEventListener("click",async e=>{e.preventDefault(); if(await verifyAdminPassword($("#loginPassword").value)){authed=true;sessionStorage.setItem("hirova_admin","true");$("#loginPassword").value="";closeModal("loginModal");renderAll();navigate("dashboard");toast("تم فتح لوحة الإدارة.");}else toast("كلمة المرور غير صحيحة.");});
  $("#themeToggle").addEventListener("click",()=>{state.settings.calm=!state.settings.calm;saveState();});
  $("#logoutBtn")?.addEventListener("click",()=>{authed=false; sessionStorage.removeItem("hirova_admin"); renderAll(); toast("تم الخروج من لوحة الإدارة.");});
  $("#openVisitorAiBtn")?.addEventListener("click",()=>openFloatingAi());
  $("#backupBtn").addEventListener("click",exportJson); $("#exportJsonBtn").addEventListener("click",exportJson); $("#exportCandidatesBtn").addEventListener("click",exportCsv);
  $("#importJsonInput").addEventListener("change",e=> e.target.files[0] && importJson(e.target.files[0]));
  $("#resetDataBtn").addEventListener("click",()=>{ if(confirm("هل تريد مسح كل البيانات؟")){ state=defaultState(); saveState(); toast("تمت إعادة ضبط البيانات."); }});
  $("#saveSettingsBtn").addEventListener("click",async ()=>{ const newPass=$("#adminPassword").value.trim(); state.settings.companyName=$("#companyName").value.trim()||"Hirova"; if(newPass){ state.settings.adminPasswordHash = await sha256(newPass); $("#adminPassword").value=""; } saveState(); toast("تم حفظ الإعدادات.");});
  $("#seedDemoBtn").addEventListener("click",seedDemo);
  $("#saveDraftBtn").addEventListener("click",()=>saveJob("draft")); $("#publishJobBtn").addEventListener("click",()=>saveJob("published")); $("#clearJobBtn").addEventListener("click",()=>fillJobForm());
  $("#saveCandidateBtn").addEventListener("click",saveCandidate); $("#parseCandidateBtn").addEventListener("click",parseCandidateText); $("#scoreCandidateBtn").addEventListener("click",()=>{ try{ const c=collectCandidate(); toast(`نسبة الملاءمة المحسوبة: ${c.score}%`);}catch(e){toast(e.message);} });
  ["#reqSearch","#reqStatusFilter","#candidateSearch","#candidateStageFilter","#candidateJobFilter"].forEach(s=>$(s).addEventListener("input",renderAll));
  $("#generateAdBtn").addEventListener("click",()=>{$("#aiAdOutput").value=generateAd(jobById($("#aiJobSelect").value));});
  $("#analyzeCandidateBtn").addEventListener("click",()=>{$("#candidateAnalysis").innerHTML=analyzeCandidate(state.candidates.find(c=>c.id===$("#aiCandidateSelect").value));});
  $("#askAssistantBtn").addEventListener("click",()=>{ const q=$("#assistantInput").value.trim(); if(!q) return; addChat("user",q); addChat("bot",assistantAnswer(q)); $("#assistantInput").value=""; });
  $("#assistantInput").addEventListener("keydown",e=>{if(e.key==="Enter") $("#askAssistantBtn").click();});
  $("#aiFab")?.addEventListener("click",()=>openFloatingAi());
  $("#closeAiDock")?.addEventListener("click",()=>closeFloatingAi());
  $("#floatingAiSend")?.addEventListener("click",()=>{ const q=$("#floatingAiInput").value; askFloatingAi(q); $("#floatingAiInput").value=""; });
  $("#floatingAiInput")?.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); $("#floatingAiSend").click(); }});
}

bind(); renderAll(); addChat("bot","أهلاً، أنا مساعد التوظيف الخاص بالإدارة. اسألني عن الأولويات، أفضل مرشح، أو تقرير سريع.");
