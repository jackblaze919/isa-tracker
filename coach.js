/* ============================================================
   Ask Hammy — Isa's cute fitness & nutrition coach (chat widget)
   Self-contained: injects its own button + sheet, reads the tracker's
   plan + live state, answers in Hammy's voice. Works fully offline with a
   built-in plan-aware coach; optionally upgrades to open-ended AI when an
   Anthropic key is connected (owner-only, stored locally, never hardcoded).
   ============================================================ */
(function(){
  "use strict";
  if(window.__hammyCoach) return; window.__hammyCoach = true;

  /* ---------- storage ---------- */
  const NS = "isa:v1:";
  const K_CHAT = "coach_chat", K_KEY = "coach_aikey", K_MODEL = "coach_model", K_SEEN = "coach_seen";
  const lget = (k,d)=>{ try{ const v=localStorage.getItem(NS+k); return v==null?d:JSON.parse(v);}catch(e){return d;} };
  const lset = (k,v)=>{ try{ localStorage.setItem(NS+k, JSON.stringify(v)); }catch(e){} };
  const lraw = (k,d)=>{ try{ const v=localStorage.getItem(NS+k); return v==null?d:v;}catch(e){return d;} };
  // read the tracker's own namespaced values (it stores JSON via its save())
  const tget = (k,d)=>{ try{ const v=localStorage.getItem(NS+k); return v==null?d:JSON.parse(v);}catch(e){return d;} };
  const esc = s => String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  /* ---------- plan facts (mirrors the tracker's plan, so answers stay specific) ---------- */
  const PLAN = {
    protein:"115–125 g of protein a day", calories:"about 1,850–1,950 calories",
    feeds:"3 protein feedings — roughly 10 a.m., 1–2 p.m., and 6–8 p.m.",
    equip:"a sturdy backpack with books or water bottles, a stable sofa, a solid step, and a wall or chair for balance",
    starches:"mashed potatoes, plantain, and rice are interchangeable — ½ a plantain ≈ ½ cup mashed potatoes ≈ ⅓–½ cup cooked rice",
    measuring:"palms for protein (1½–2), measured cups for starches, fists for veg, and an actual spoon for oil/butter",
    progression:"when you hit the top of the rep range on every set for two sessions, add a book or bottle to the backpack and build the reps back up",
    walking:"track your steps 3 days, set the average + 1,000, then add +500 a week, building toward 7,000–8,000",
  };

  /* ---------- live context from the tracker (best-effort, all guarded) ---------- */
  function dayName(d){ const n=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]; return n[d]; }
  function ctx(){
    const c = { name:"Hammy", restDay:false, walkDay:false, woLabel:"", woFocus:"", woEx:[], warmup:null };
    // All tracker globals are read defensively — the coach works even if any are absent.
    try{
      const today = (typeof TODAY_DOW!=="undefined") ? TODAY_DOW : new Date().getDay();
      c.day = dayName(today);
      if(typeof WORKOUTS!=="undefined" && typeof SCHED!=="undefined"){
        const type = (typeof effectiveType!=="undefined") ? effectiveType(today) : SCHED[today].wo;
        const W = WORKOUTS[type] || {};
        c.woType = type; c.woLabel = W.label||""; c.woFocus = W.focus||""; c.warmup = W.warmup||null;
        c.restDay = type==="rest"; c.walkDay = type==="walk";
        if(W.ex && typeof EX!=="undefined") c.woEx = W.ex.map(id=>(EX[id]&&EX[id].name)||id);
      }
      if(typeof currentWeek!=="undefined") c.week = currentWeek();
      if(typeof stepTarget!=="undefined") c.stepTarget = parseInt(stepTarget(),10)||0;
      if(typeof gStepsActual!=="undefined") c.stepsToday = gStepsActual();
      if(typeof gSleep!=="undefined") c.sleepToday = gSleep();
      if(typeof gMeals!=="undefined") c.mealsDone = gMeals();
      if(typeof gProtein!=="undefined") c.proteinDone = gProtein();
      if(typeof gWorkout!=="undefined") c.workoutDone = gWorkout();
    }catch(e){}
    try{ if(window.IsaHamster && IsaHamster.getState){ const s=IsaHamster.getState(); if(s&&s.name) c.name=s.name; } }catch(e){}
    try{ const hist = tget("ci_history",[]); if(hist&&hist[0]&&hist[0].fields&&hist[0].fields.ci_weight) c.lastWeight = hist[0].fields.ci_weight; }catch(e){}
    return c;
  }
  function todayLine(c){
    if(c.restDay) return "Today is your rest day — recovery counts as part of the plan.";
    if(c.walkDay) return "Today is your walk + mobility day.";
    if(c.woLabel) return `Today is ${c.woLabel}${c.woFocus?" — "+c.woFocus:""}${c.woEx.length?" ("+c.woEx.join(", ")+")":""}.`;
    return "";
  }

  /* ============================================================
     LOCAL COACH — intent router + plan-aware answers (Hammy's voice)
     ============================================================ */
  const M = (s)=>s.toLowerCase();
  function any(s,arr){ return arr.some(w=> s.indexOf(w)>=0); }
  function react(cat){ // accent emoji + Hammy stage mood
    const map={workout:"💪",meal:"🥕",water:"💧",sleep:"😴",proud:"💗",caution:"⚠️",walk:"👟",think:""};
    try{ if(window.IsaHamster && IsaHamster.handleCoachMood){ const mm={workout:"workout",meal:"meal",water:"meal",sleep:"sleep",proud:"proud",caution:"caution"}[cat]; if(mm) IsaHamster.handleCoachMood(mm); } }catch(e){}
    return map[cat]||"";
  }

  // each intent: {k:[keywords], rx:optional regex, cat, fn(msg,c)->text}
  const INTENTS = [
    { k:["can't do","cant do","can not do","instead of","substitute","swap","replace","alternative","different exercise","no step","no chair","don't have a","dont have a","without a"], cat:"workout",
      fn:(m,c)=>{
        const s=M(m);
        if(any(s,["step-up","step up","stepup"])) return `No step-ups, no problem. Easy swap. 👟\nTry **reverse lunges** or **bench/floor glute bridges** instead — both hit the same muscles your step-ups do. If you have a low, solid surface (bottom stair, sturdy box), step-ups still work; just keep your whole foot on it.\nKeep the reps and the backpack the same so the work still counts.`;
        if(any(s,["hip thrust","hipthrust"])) return `Swap for a **floor glute bridge** (or single-leg bridge for more). Lie on your back, feet flat, squeeze your glutes to lift your hips, pause 1 sec at the top. Same muscles, no sofa needed. Add the backpack across your hips when bodyweight feels easy.`;
        if(any(s,["rdl","romanian","deadlift"])) return `Swap the RDL for a **single-leg RDL** or a slow **hip hinge** (hands sliding down your thighs, hips back, flat back). Light backpack, feel it in the glutes and hamstrings. Quality over weight here.`;
        if(any(s,["split squat","split-squat","lunge"])) return `Use a **supported reverse lunge** instead — hold a wall or chair, step back, push through the front foot. Easier on balance, same job.`;
        if(any(s,["push","push-up","pushup"])) return `Make push-ups easier by raising your hands higher — wall, then counter, then a low table. Lower the surface as you get stronger. Knees-down on the floor works too.`;
        if(any(s,["row"])) return `No backpack handy? Fill a water jug or grocery bag and do **one-arm rows** — support with your other hand on a chair, pull the weight to your hip. Towel rows against a sturdy door work in a pinch.`;
        if(any(s,["chair","stable","sofa","bench","balance"])) return `Let's work with what you have. Use a **wall** for balance, the **bottom stair** as a low step, and the **floor** for bridges instead of sofa hip thrusts. You don't need fancy gear — sturdy and stable is all that matters.`;
        return `Tell me which move and I'll give you a clean swap. Quick guide:\n• Step-up → reverse lunge or floor bridge\n• Hip thrust → floor glute bridge\n• RDL → single-leg RDL / slow hip hinge\n• Split squat → supported reverse lunge\n• Push-up → raise your hands higher (wall/counter)\nSame muscles, same plan — just different tools.`;
      } },
    { k:["hurt","hurts","pain","sharp","knee","back pain","wrist","shoulder pinch","joint"], cat:"caution",
      fn:(m,c)=>{
        const s=M(m);
        const part = any(s,["knee"])?"knee":any(s,["back"])?"back":any(s,["wrist"])?"wrist":any(s,["shoulder"])?"shoulder":"that spot";
        return `Let's protect your ${part}. ⚠️\n**Sharp or joint pain = stop that move today** — that's not the muscle-working kind of sore.\nTry: smaller range of motion, lighter (or no) backpack, and slower reps. For knees, keep your weight in your whole foot and don't let the knee cave in. For the back, brace your tummy and keep it flat — never round under load.\nIf it keeps hurting, swap to a pain-free exercise and rest the area. If pain is strong or lingers, it's worth getting it checked — I'm a hamster, not a doctor. 🐹`;
      } },
    { k:["15 min","15min","fifteen min","short on time","only have","not much time","quick workout","no time","busy","10 min","20 min","short version"], cat:"workout",
      fn:(m,c)=>{
        const moves = c.woEx.length? c.woEx.slice(0,2).join(" and ") : "your two main lifts (hip thrust and RDL)";
        return `Short on time? Totally fine. Tiny adjustment, same goal.\nDo a **2-minute warm-up**, then just the two big movers — ${moves} — **2 solid sets each**, resting ~60–90 sec. Skip the extras.\nA focused 15 minutes on the main lifts keeps your progress moving. Showing up short beats skipping. 💪`;
      } },
    { k:["sore","soreness","doms","aching","achy","stiff"], cat:"caution",
      fn:(m,c)=>{
        return `That sounds like a recovery day. Sore muscles are normal — it means they're rebuilding, not damaged.\nIf you're *really* sore: do an easy **walk + gentle hip mobility** today, drink water, and aim for 7+ hours sleep. Hit your protein so they repair.\nIf your legs are toast but your arms feel fine, you can do an upper-body session instead and come back to legs tomorrow. No panic — one shifted day changes nothing.`;
      } },
    { k:["missed","skipped","didn't work out yesterday","didnt work out","fell behind","behind on"], cat:"workout",
      fn:(m,c)=>{
        return `No panic — one missed day changes nothing. 💗\nDon't double up to "make up" for it. Just do **today's session** as planned. If you'd like, you can slot the missed workout onto a walk or rest day later this week.\nConsistency over the month is what matters, not any single day. You're doing great by showing up now.`;
      } },
    { k:["not doing today","skip today","change today","different workout today","switch today"], cat:"workout",
      fn:(m,c)=>{
        return `You can absolutely change today. ${todayLine(c)}\nIf you're low energy → swap to a walk + mobility day. If your legs are sore → do upper body instead. You can also pick a different workout in the **"Different workout today?"** dropdown on the Today tab and the plan will follow it. Tiny adjustment, same goal.`;
      } },
    { k:["progress","progression","add weight","heavier","get stronger","increase","plateau on","stuck on","stronger"], cat:"workout",
      fn:(m,c)=>{
        return `Here's the rule your plan uses: ${PLAN.progression}.\nStay at **2 sets** until your form feels controlled and you're finishing every session, then add a **3rd set** to the main lifts (hip thrust, RDL).\nWrite down the weight and every rep so you can see it climbing. Strength should clearly trend up over weeks. 💪`;
      } },
    { k:["walk","walking","steps","step count","10000","10,000","cardio"], cat:"walk",
      fn:(m,c)=>{
        const tgt = c.stepTarget? `Your current target is **${c.stepTarget.toLocaleString()}** steps.` : "";
        return `Walking plan, simple version: ${PLAN.walking}. ${tgt}\nKeep most of it at a pace where you can still hold a conversation. 10,000 is optional, not magic — only push higher if your energy, appetite, and joints stay happy. 👟`;
      } },
    { k:["upper body","arms","biceps","triceps","push up","pushup","row","overhead","shoulders","arm day"], cat:"workout",
      fn:(m,c)=>{
        const s=M(m);
        if(any(s,["slim","slimmer","tone","toned","thinner","smaller arm"])) return `Honest answer: you can't spot-reduce one area. The way arms look leaner is **slow overall fat loss + a bit of muscle tone**.\nYour plan already trains that — push-ups, rows, overhead press, and curls/triceps. Keep those going, stay consistent with portions and protein, and the change shows over weeks. You're on the right track. 💗`;
        return `Your upper-body day is push, pull, and arms: incline push-ups, one-arm backpack rows, overhead press, and curls/triceps (alternate curls or triceps each session). 2 sets each, leaving 1–2 reps in the tank. Wall or counter for the push-ups; lower the surface as you get stronger. 💪`;
      } },
    { k:["glute","glutes","butt","booty","leg day","lower body"], cat:"workout",
      fn:(m,c)=>{
        return `Let's keep the glutes fed. 💪 Your lower-body days build around the **backpack hip thrust** and **Romanian deadlift**, plus step-ups, split squats, lunges, and side leg raises.\nSqueeze hard at the top of every rep, control the way down, and add a little weight to the backpack when the top of the rep range feels easy. That squeeze + steady progression is what shapes them.`;
      } },
    { k:["schedule","what day","which day","week look","weekly plan","split","how often"], cat:"workout",
      fn:(m,c)=>{
        return `Your week: lower-body days Mon / Wed / Fri, upper-body Tue / Sat, an easy walk + mobility day Thu, and Sunday is rest. ${c.week?`You're on week ${c.week}.`:""}\n${todayLine(c)}\nNo hard sessions back-to-back, and keep that Sunday a real rest day.`;
      } },
    { k:["before workout","pre workout","pre-workout","eat before","before glute","before training","fuel before"], cat:"meal",
      fn:(m,c)=>{
        return `Eat a mix of carbs + protein about **1–2 hours before**. Easy options: Greek yogurt + oats + fruit, or chicken with potatoes. Short on time? A banana with yogurt, or yogurt + a little honey ~30 min before works.\nSip water leading in. You don't need anything fancy to have a good session. 🥕`;
      } },
    { k:["out of chicken","no chicken","ran out of chicken","instead of chicken","chicken substitute","no protein"], cat:"meal",
      fn:(m,c)=>{
        return `Easy swap — keep ~30–40 g of protein in the meal:\n• 3 eggs (~18 g) + 1 cup milk\n• 1 cup Greek yogurt (~18–22 g)\n• Canned tuna or salmon\n• Beans + rice together\n• Cottage cheese, or turkey/deli\nMix and match to hit the meal. Your body just wants the protein, not specifically chicken. 🥕`;
      } },
    { k:["can't cook","cant cook","no cook","no-cook","don't want to cook","dont want to cook","too tired to cook","lazy meal"], cat:"meal",
      fn:(m,c)=>{
        return `No cooking needed today — easy swap. 🥕\nGrab from these (aim ~30–40 g protein each):\n• Greek yogurt + fruit + a handful of nuts\n• Hard-boiled eggs (boil a batch ahead) + cheese\n• Canned tuna or chicken + crackers/bread\n• Milk + a protein-y snack\n• Pre-cooked rotisserie chicken or deli meat\nKeep a starch and some fruit/veg alongside and you're right on plan.`;
      } },
    { k:["eat out","eating out","restaurant","order","menu","fast food","takeout","take out","dining"], cat:"meal",
      fn:(m,c)=>{
        const photo = "If you send a photo of the menu and you've connected AI, I'll pick three good options for you.";
        return `You've got this. Order like your plate at home:\n• **Protein:** grilled, baked, or roasted chicken, fish, or steak (about a palm or two)\n• **Carb:** rice, potato, or bread (a cupped handful)\n• **Veg/salad** on the side\n• Sauces and dressings **on the side**, water to drink\nSkip the fried, breaded, and creamy stuff most of the time. One meal out changes nothing — enjoy it. 🥕\n${photo}`;
      } },
    { k:["travel","traveling","vacation","trip","airport","hotel","social","party","birthday","wedding","friends dinner"], cat:"meal",
      fn:(m,c)=>{
        return `Travel and social meals are part of life — no stress. Same simple rule: find a **protein**, add a **carb**, add **veg**, and drink water. Pack easy protein for the road (jerky, yogurt cups, nuts, protein bars).\nEnjoy the meal you're there for. One day off-routine won't undo a steady month. 💗`;
      } },
    { k:["potato","rice","plantain","starch","carb swap","swap potato","mash","beans"], cat:"meal",
      fn:(m,c)=>{
        return `Yes — easy swap. ${PLAN.starches}. Keep the same measured portion you'd use for potatoes and you're set. Variety is good; the carbs do the same job. 🥕`;
      } },
    { k:["protein target","reach protein","hit protein","enough protein","how much protein","more protein","protein today"], cat:"meal",
      fn:(m,c)=>{
        const done = c.proteinDone? " You've already ticked protein today — nice." : "";
        return `Aim for ${PLAN.protein}, spread across ${PLAN.feeds} — roughly 35–40 g each.\nA typical day: breakfast 3 eggs + yogurt, lunch 1½–2 palms of chicken, evening yogurt + milk (or eggs + milk). Falling short? Add a cup of Greek yogurt or a couple of eggs — quickest fix.${done} 💪`;
      } },
    { k:["calorie","calories","how much should i eat","eat less","eat more","deficit","portion","how much food"], cat:"meal",
      fn:(m,c)=>{
        const s=M(m);
        if(any(s,["didn't work out","didnt work out","rest day","skip","no workout","not working out"]))
          return `Nope — don't eat less just because you didn't train. No panic. 💗 Your body still needs protein and energy to recover, and one rest day barely moves the math. Eat your normal plan portions. Adjust food based on your **weekly weight trend**, not a single day.`;
        return `Your plan is ${PLAN.calories} a day — but it's a starting estimate, not a calculation. The real tool is **consistent portions**: ${PLAN.measuring}. Run the plan unchanged for 14 days, then adjust from your weekly weight, energy, strength, and how clothes fit — not from one day. 🥕`;
      } },
    { k:["weight","scale","not changing","not losing","gaining","stuck","plateau","weigh","heavier on scale"], cat:"meal",
      fn:(m,c)=>{
        const w = c.lastWeight? ` Your last logged weigh-in was ${esc(c.lastWeight)}.` : "";
        return `Take a breath — the scale is noisy. Use the **weekly average**, not any single morning; water, food, and salt swing it 1–2 lb daily.${w}\nIf your weekly average has truly been flat for 2–3 weeks and the goal is loss, first check the basics: protein near target, measured portions, steps up, sleep 7+. If all that's solid, trim ~100–150 cal/day (cut unmeasured oil/sauce or a small starch — not protein).\nAlso remember: if you're gaining a little muscle, the scale can stall while photos and how clothes fit still improve. Trust the trend. 💗`;
      } },
    { k:["recomp","tone up","build muscle and lose","lose fat and gain","body recomp","get lean"], cat:"workout",
      fn:(m,c)=>{
        return `Body recomposition — losing a little fat while building some muscle — is exactly what your plan is built for: steady strength work (glutes + upper body), enough protein, and consistent portions. It's slower on the scale but shows up in photos, strength, and how clothes fit. Patience + consistency is the whole secret. 💪`;
      } },
    { k:["water","hydrate","hydration","drink","thirsty","how much water","gallon"], cat:"water",
      fn:(m,c)=>{
        return `Hydration is easy: about **6–8 cups a day** — 1 on waking, 1 with each meal, and 1 around your workout. A full gallon isn't necessary. Add a little more if it's hot or you're sweating a lot. 💧`;
      } },
    { k:["sleep","tired","rest","recover","recovery","exhausted","no energy","fatigue"], cat:"sleep",
      fn:(m,c)=>{
        const sl = (c.sleepToday&&c.sleepToday>0)? ` You logged ${c.sleepToday} hours last night.` : "";
        return `Recovery is where the results actually happen. 😴 Aim for **7+ hours** most nights, keep Sunday a true rest day, and don't stack hard sessions back-to-back. Light walking is fine when you're sore.${sl}\nIf you're wiped out, today's a great day to go easy and let your body catch up.`;
      } },
    { k:["grocery","groceries","shopping","shop","buy","store list"], cat:"meal",
      fn:(m,c)=>{
        return `Your weekly basics: chicken, eggs, Greek yogurt, milk, potatoes, plantains, oats, rice, beans, fruit, vegetables, and cooking oil/seasonings. The full checklist lives on the **Groceries** tab. Cook protein and starch twice a week (e.g. Sun & Wed) and you're set for days. 🥕`;
      } },
    { k:["motivat","unmotivated","give up","giving up","gave up","quit","hard to keep","consistency","consistent","stay on track","discourag","want to quit","keep going","feel like quitting","losing motivation"], cat:"proud",
      fn:(m,c)=>{
        return `Hammy's got you. 🐹 You don't need to be perfect — you need to keep showing up, and you *are*. The plan works because of steady, boring consistency, not heroic days.\nPick the next small win: today's workout, one good meal, your water. Stack those and the results come. I'm proud of you. 💗`;
      } },
  ];

  function localReply(msg){
    const s = M(msg.trim());
    if(!s) return null;
    const c = ctx();
    let best=null, bestScore=0;
    for(const it of INTENTS){
      let score = it.k.reduce((n,w)=> n + (s.indexOf(w)>=0 ? (w.length>6?2:1) : 0), 0);
      if(score>bestScore){ bestScore=score; best=it; }
    }
    if(best && bestScore>0){ const acc=react(best.cat); const t=best.fn(msg,c); return (acc?acc+" ":"")+t; }
    // friendly, plan-aware fallback
    react("think");
    const t = todayLine(c);
    return `I'm here for anything about your plan — workouts, swaps, soreness, meals, protein, eating out, sleep, or your weight trend. 🐹\n${t?t+"\n":""}Try asking something like *"I can't do today's exercise"*, *"quick high-protein meal"*, or *"I'm eating out, what should I order?"* — or tap a suggestion below. What's on your mind?`;
  }

  /* ============================================================
     OPTIONAL AI MODE (Anthropic, owner-connected key, browser-direct)
     ============================================================ */
  function aiKey(){ return lraw(K_KEY,""); }
  function aiModel(){ return lraw(K_MODEL,"claude-haiku-4-5"); }
  function aiOn(){ return !!aiKey(); }
  function systemPrompt(){
    const c = ctx();
    const live = [
      `Today is ${c.day||"a day"}.`, todayLine(c),
      c.week?`She is on week ${c.week} of the plan.`:"",
      c.stepTarget?`Her daily step target is ${c.stepTarget}.`:"",
      (c.mealsDone!=null)?`Meals done today: ${c.mealsDone?"yes":"not yet"}.`:"",
      (c.proteinDone!=null)?`Protein target hit today: ${c.proteinDone?"yes":"not yet"}.`:"",
      (c.workoutDone!=null && !c.restDay)?`Workout done today: ${c.workoutDone?"yes":"not yet"}.`:"",
      c.lastWeight?`Her last logged weigh-in: ${c.lastWeight}.`:"",
    ].filter(Boolean).join(" ");
    return [
      "You are Hammy, a cute, warm hamster who is Isa's personal fitness and nutrition coach inside her tracker app. You are talking directly to Isa.",
      "PERSONALITY: warm, encouraging, calm, practical, direct, emotionally supportive, honest, knowledgeable without sounding clinical, playful but never childish or annoying.",
      "VOICE RULES: Keep answers concise and skimmable (short lines or small bullet lists). Use at most ONE short playful Hammy phrase per reply (e.g. \"Hammy's got you 🐹\", \"Easy swap.\", \"Tiny adjustment, same goal.\") — never more. Do NOT fill replies with hamster jokes.",
      "NEVER call her lazy, bad, weak, dishonest, or a failure. Never use guilt, shame, streak pressure, or punishment. One off meal or missed day is never a big deal — say so.",
      "Answer SPECIFICALLY to her plan, not generic boilerplate. You can read menu/food photos she sends and pick good options.",
      "If asked something medical/serious (sharp or persistent pain, injury), give safe general guidance and gently suggest seeing a professional — you're a hamster, not a doctor.",
      "",
      "HER PLAN: Lower-body days Mon/Wed/Fri (backpack hip thrust, Romanian deadlift, step-ups, split squats, reverse lunges, side leg raises). Upper-body Tue/Sat (incline push-ups, one-arm backpack rows, overhead press, curls/triceps). Thu = walk + mobility. Sunday = rest.",
      `NUTRITION: ${PLAN.protein}, ${PLAN.calories}, ${PLAN.feeds}. Measuring: ${PLAN.measuring}. Starches: ${PLAN.starches}.`,
      `EQUIPMENT: ${PLAN.equip}. PROGRESSION: ${PLAN.progression}. WALKING: ${PLAN.walking}. Water: ~6–8 cups/day.`,
      "Adjust food from the WEEKLY weight trend, never a single day. Sharp/joint pain = stop the move; muscle soreness is normal.",
      "",
      "LIVE CONTEXT RIGHT NOW: " + live,
    ].join("\n");
  }
  async function aiReply(history, imageDataUrl){
    const key = aiKey(); if(!key) throw new Error("no key");
    const msgs = history.slice(-12).map(m=>{
      if(m.role==="user" && m._img){
        const [meta,b64] = m._img.split(",");
        const mt = (meta.match(/data:(.*?);base64/)||[])[1] || "image/jpeg";
        return { role:"user", content:[ {type:"image", source:{type:"base64", media_type:mt, data:b64}}, {type:"text", text:m.text||"What are good options here?"} ] };
      }
      return { role: m.role==="user"?"user":"assistant", content: m.text };
    });
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{ "content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true" },
      body: JSON.stringify({ model:aiModel(), max_tokens:700, system:systemPrompt(), messages:msgs })
    });
    if(!res.ok){ const t=await res.text().catch(()=>res.status); throw new Error("AI error "+res.status+": "+String(t).slice(0,140)); }
    const data = await res.json();
    return (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n").trim() || "…";
  }

  /* ============================================================
     UI
     ============================================================ */
  function avatar(pose){ return `<svg viewBox="0 0 120 135" aria-hidden="true"><use href="#${pose||"pose-idle"}"/></svg>`; }
  let chat = lget(K_CHAT, []);   // [{role:'user'|'hammy', text, _img?, error?}]
  let attached = null;           // dataURL pending
  let busy = false;
  const el = {};

  function build(){
    // floating button
    const fab = document.createElement("button");
    fab.className = "coach-fab"+(aiOn()?" has-ai":""); fab.id="coachFab"; fab.type="button";
    fab.setAttribute("aria-label","Ask Hammy — your coach");
    fab.innerHTML = `<span class="coach-fab-dot"></span><span class="coach-fab-av">${avatar("pose-idle")}</span><span>Ask Hammy</span>`;
    document.body.appendChild(fab);

    const back = document.createElement("div"); back.className="coach-backdrop"; back.id="coachBack"; document.body.appendChild(back);

    const panel = document.createElement("div");
    panel.className="coach-panel"; panel.id="coachPanel"; panel.setAttribute("role","dialog");
    panel.setAttribute("aria-modal","true"); panel.setAttribute("aria-label","Ask Hammy coach chat");
    panel.innerHTML = `
      <div class="coach-head">
        <div class="av">${avatar("pose-idle")}</div>
        <div class="ttl"><b>Ask Hammy</b><span class="sub">Fitness, food, and plan help <span class="coach-status${aiOn()?" online":""}" id="coachStatus">${aiOn()?"AI online":"offline helper"}</span></span></div>
        <button class="hbtn" id="coachSettingsBtn" title="Coach settings" aria-label="Coach settings">⚙️</button>
        <button class="hbtn" id="coachNew" title="New chat" aria-label="New chat">🗑️</button>
        <button class="hbtn" id="coachClose" title="Close" aria-label="Close">✕</button>
        <div class="coach-settings" id="coachSettings">
          <h4>Connect AI (optional)</h4>
          <p>Hammy already helps offline with your plan. Add an Anthropic API key to unlock open-ended answers and menu-photo reading. Stored only on this device.</p>
          <label for="coachKey">Anthropic API key</label>
          <input id="coachKey" type="password" placeholder="sk-ant-..." autocomplete="off">
          <label for="coachModelSel">Model</label>
          <select id="coachModelSel">
            <option value="claude-haiku-4-5">Haiku 4.5 (fast)</option>
            <option value="claude-sonnet-4-6">Sonnet 4.6</option>
            <option value="claude-opus-4-8">Opus 4.8 (smartest)</option>
          </select>
          <div class="row"><button class="save" id="coachKeySave">Save</button><button class="clear" id="coachKeyClear">Disconnect</button></div>
          <div class="hint">Tip: leave this empty and Hammy still answers from your plan, fully offline.</div>
        </div>
      </div>
      <div class="coach-msgs" id="coachMsgs" aria-live="polite"></div>
      <div class="coach-chips" id="coachChips"></div>
      <div class="coach-attach-preview" id="coachAttachPrev" style="display:none"></div>
      <div class="coach-input">
        <input type="file" id="coachFile" accept="image/*" hidden>
        <button class="coach-iconbtn coach-attach" id="coachAttachBtn" title="Attach a photo" aria-label="Attach a photo">📎</button>
        <textarea id="coachText" rows="1" placeholder="Ask Hammy anything…" aria-label="Message Hammy"></textarea>
        <button class="coach-iconbtn coach-send" id="coachSend" title="Send" aria-label="Send" disabled>➤</button>
      </div>`;
    document.body.appendChild(panel);

    el.fab=fab; el.back=back; el.panel=panel;
    el.msgs=panel.querySelector("#coachMsgs"); el.chips=panel.querySelector("#coachChips");
    el.text=panel.querySelector("#coachText"); el.send=panel.querySelector("#coachSend");
    el.status=panel.querySelector("#coachStatus"); el.settings=panel.querySelector("#coachSettings");
    el.attachPrev=panel.querySelector("#coachAttachPrev"); el.file=panel.querySelector("#coachFile");

    wire();
    renderChips(); renderChat();
  }

  const CHIPS = ["I can't do today's exercise","I can't cook today","I'm eating out","Quick high-protein meal","I'm sore today","Give me an exercise swap"];
  function renderChips(){
    el.chips.innerHTML="";
    CHIPS.forEach(c=>{ const b=document.createElement("button"); b.className="coach-chip"; b.type="button"; b.textContent=c;
      b.addEventListener("click",()=>{ el.text.value=c; ask(); }); el.chips.appendChild(b); });
  }

  function renderChat(){
    el.msgs.innerHTML="";
    if(!chat.length){
      const w=document.createElement("div"); w.className="coach-welcome";
      w.innerHTML=`<div class="wav">${avatar("pose-idle")}</div><h3>Hi, I'm Hammy! 🐹</h3>
        <p>Your cozy fitness & food coach. Ask me about workouts, swaps, soreness, meals, protein, eating out, sleep, or your weight — anything in your plan. Tap a suggestion to start.</p>`;
      el.msgs.appendChild(w);
      return;
    }
    chat.forEach((m,i)=> el.msgs.appendChild(bubble(m,i)));
    scroll();
  }
  function bubble(m,i){
    const row=document.createElement("div"); row.className="coach-row "+(m.role==="user"?"user":"bot");
    const av = m.role==="user" ? "" : `<div class="av-sm">${avatar("pose-idle")}</div>`;
    let inner = esc(m.text||"").replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").replace(/\*(.+?)\*/g,"<i>$1</i>");
    let imgHtml = m._img? `<img src="${m._img}" alt="attached photo">` : "";
    let extra = "";
    if(m.error) extra = `<div class="coach-err">Couldn't reach AI. ${esc(m.error)}</div><button class="coach-retry" data-i="${i}">↻ Retry</button>`;
    row.innerHTML = av + `<div class="coach-bubble">${inner}${imgHtml}${extra}</div>`;
    const rb=row.querySelector(".coach-retry"); if(rb) rb.addEventListener("click",()=>retry(i));
    return row;
  }
  function scroll(){ requestAnimationFrame(()=>{ el.msgs.scrollTop=el.msgs.scrollHeight; }); }

  function typing(on){
    let t=el.msgs.querySelector(".coach-typing-row");
    if(on){ if(t) return; const row=document.createElement("div"); row.className="coach-row bot coach-typing-row";
      row.innerHTML=`<div class="av-sm">${avatar("pose-look-left")}</div><div class="coach-bubble" style="padding:4px"><div class="coach-typing"><span></span><span></span><span></span></div></div>`;
      el.msgs.appendChild(row); scroll();
      try{ if(window.IsaHamster&&IsaHamster.handleCoachMood) IsaHamster.handleCoachMood("thinking"); }catch(e){}
    } else if(t){ t.remove(); }
  }

  function saveChat(){ lset(K_CHAT, chat.slice(-40)); }

  async function ask(){
    const text=(el.text.value||"").trim();
    if((!text && !attached) || busy) return;
    busy=true; el.send.disabled=true;
    const userMsg={role:"user", text: text||"(photo)"}; if(attached){ userMsg._img=attached; }
    chat.push(userMsg); el.text.value=""; autosize(); clearAttach(); renderChat(); saveChat();
    await respond();
    busy=false; updateSendState();
  }

  async function respond(){
    typing(true);
    const minDelay = new Promise(r=>setTimeout(r, 500+Math.random()*400)); // let the typing dots breathe
    try{
      let reply;
      if(aiOn()){
        try{ reply = await aiReply(chat, chat[chat.length-1]&&chat[chat.length-1]._img); }
        catch(err){ await minDelay; typing(false);
          chat.push({role:"hammy", text:"I had trouble reaching the AI just now — but I can still help from your plan. Tap retry, or just ask me here. 🐹", error:String(err.message||err)});
          renderChat(); saveChat(); return; }
      } else {
        reply = localReply(chat.filter(m=>m.role==="user").slice(-1)[0].text);
      }
      await minDelay; typing(false);
      chat.push({role:"hammy", text:reply||"…"}); renderChat(); saveChat();
    }catch(e){ typing(false); chat.push({role:"hammy", text:"Something went sideways on my end. Try again? 🐹"}); renderChat(); saveChat(); }
  }
  async function retry(i){
    if(busy) return;
    // drop the errored hammy message and re-answer the last user turn
    if(chat[i]) chat.splice(i,1);
    renderChat(); busy=true; el.send.disabled=true; await respond(); busy=false; updateSendState();
  }

  /* attachments */
  function clearAttach(){ attached=null; el.attachPrev.style.display="none"; el.attachPrev.innerHTML=""; }
  function setAttach(dataUrl){ attached=dataUrl; el.attachPrev.style.display="block";
    el.attachPrev.innerHTML=`<img src="${dataUrl}" alt="attachment"><button type="button" id="coachAttachX" aria-label="Remove">✕</button>`;
    el.attachPrev.querySelector("#coachAttachX").addEventListener("click",clearAttach); updateSendState(); }

  function updateSendState(){ el.send.disabled = busy || (!(el.text.value||"").trim() && !attached); }
  function autosize(){ el.text.style.height="auto"; el.text.style.height=Math.min(120, el.text.scrollHeight)+"px"; }

  /* open / close */
  let lastFocus=null;
  function open(){ lastFocus=document.activeElement; el.back.classList.add("open"); el.panel.classList.add("open");
    el.fab.classList.add("hidden"); document.body.style.overflow="hidden";
    if(!lget(K_SEEN,false)) lset(K_SEEN,true);
    setTimeout(()=>el.text.focus(),300); renderChat(); }
  function close(){ el.back.classList.remove("open"); el.panel.classList.remove("open");
    el.fab.classList.remove("hidden"); document.body.style.overflow=""; el.settings.classList.remove("open");
    if(lastFocus&&lastFocus.focus) try{lastFocus.focus();}catch(e){} }

  function wire(){
    el.fab.addEventListener("click",open);
    el.panel.querySelector("#coachClose").addEventListener("click",close);
    el.back.addEventListener("click",close);
    el.panel.querySelector("#coachNew").addEventListener("click",()=>{ if(chat.length && !confirm("Start a new chat? This clears the current conversation.")) return; chat=[]; saveChat(); renderChat(); });
    // settings
    const sBtn=el.panel.querySelector("#coachSettingsBtn"), keyInp=el.panel.querySelector("#coachKey"), modelSel=el.panel.querySelector("#coachModelSel");
    sBtn.addEventListener("click",()=>{ keyInp.value=aiKey(); modelSel.value=aiModel(); el.settings.classList.toggle("open"); });
    el.panel.querySelector("#coachKeySave").addEventListener("click",()=>{
      const v=(keyInp.value||"").trim(); if(v) localStorage.setItem(NS+K_KEY,v); else localStorage.removeItem(NS+K_KEY);
      localStorage.setItem(NS+K_MODEL, modelSel.value); refreshAiState(); el.settings.classList.remove("open"); });
    el.panel.querySelector("#coachKeyClear").addEventListener("click",()=>{ localStorage.removeItem(NS+K_KEY); keyInp.value=""; refreshAiState(); el.settings.classList.remove("open"); });
    // input
    el.text.addEventListener("input",()=>{ autosize(); updateSendState(); });
    el.text.addEventListener("keydown",e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); ask(); } });
    el.send.addEventListener("click",ask);
    el.panel.querySelector("#coachAttachBtn").addEventListener("click",()=>el.file.click());
    el.file.addEventListener("change",e=>{ const f=e.target.files[0]; if(!f) return; e.target.value="";
      const r=new FileReader(); r.onload=()=>setAttach(r.result); r.readAsDataURL(f); });
    document.addEventListener("keydown",e=>{ if(e.key==="Escape" && el.panel.classList.contains("open")){ if(el.settings.classList.contains("open")) el.settings.classList.remove("open"); else close(); } });
  }
  function refreshAiState(){
    const on=aiOn();
    el.status.textContent = on?"AI online":"offline helper"; el.status.classList.toggle("online",on);
    el.fab.classList.toggle("has-ai",on);
  }

  /* ---------- boot ---------- */
  function init(){ if(!document.body) return; build(); }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();
