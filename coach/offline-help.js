/* offline-help.js — Hammy's Offline Quick Help
   DETERMINISTIC local guidance. This is NOT an AI response and is never presented as one.
   Used only when the device is offline, the Worker can't be reached, or the user explicitly
   opens Offline Quick Help. window.HammyOfflineHelp.answer(message, context) -> {reply, options, safety}. */
(function(){
  "use strict";
  const M = s => String(s||"").toLowerCase();
  const any = (s,arr) => arr.some(w => s.indexOf(w) >= 0);

  function todayLine(c){
    c = c || {};
    if(c.restDay) return "Today is your rest day — recovery counts as part of the plan.";
    if(c.walkDay) return "Today is your walk + mobility day.";
    if(c.scheduledWorkout) return `Today is ${c.selectedWorkout || c.scheduledWorkout}${c.focus?" — "+c.focus:""}${c.exercises&&c.exercises.length?" ("+c.exercises.join(", ")+")":""}.`;
    return "";
  }

  const INTENTS = [
    { k:["can't do","cant do","instead of","substitute","swap","replace","alternative","no step","no chair","without a","don't have a","dont have a"], safety:"normal",
      fn:(s,c)=>{
        if(any(s,["step-up","step up","stepup"])) return "No step-ups? Easy swap. Try reverse lunges or floor glute bridges — same muscles. A low, solid surface (bottom stair) works for step-ups too. Keep the reps and backpack the same.";
        if(any(s,["hip thrust","hipthrust"])) return "Swap for a floor glute bridge (or single-leg for more): feet flat, squeeze your glutes up, pause 1 sec at the top. Add the backpack across your hips when bodyweight feels easy.";
        if(any(s,["rdl","romanian","deadlift"])) return "Swap the RDL for a single-leg RDL or a slow hip hinge — hips back, flat back, light backpack. Feel it in glutes and hamstrings.";
        if(any(s,["split squat","lunge"])) return "Use a supported reverse lunge — hold a wall or chair, step back, push through the front foot. Same job, easier balance.";
        if(any(s,["push","pushup"])) return "Make push-ups easier by raising your hands higher (wall → counter → low table). Lower the surface as you get stronger.";
        if(any(s,["row"])) return "No backpack? Fill a water jug and do one-arm rows, supporting your other hand on a chair; pull to your hip.";
        return "Quick swaps: step-up → reverse lunge or floor bridge · hip thrust → floor glute bridge · RDL → single-leg RDL · split squat → supported reverse lunge · push-up → raise your hands higher. Same plan, different tools.";
      } },
    { k:["hurt","pain","sharp","knee","joint","back pain","wrist"], safety:"caution",
      fn:(s,c)=>"Sharp or joint pain = stop that move today (that's not the good kind of sore). Try a smaller range, lighter/no backpack, and slower reps. If it keeps hurting, swap to a pain-free exercise and rest the area — and if it's strong or lingers, get it checked. I'm a hamster, not a doctor. 🐹" },
    { k:["15 min","short on time","only have","no time","quick workout","10 min","20 min"], safety:"normal",
      fn:(s,c)=>{ const moves=(c.exercises&&c.exercises.length)?c.exercises.slice(0,2).join(" and "):"your two main lifts"; return `Short on time? Do a 2-minute warm-up, then ${moves}, 2 solid sets each. Showing up short beats skipping.`; } },
    { k:["sore","soreness","achy","stiff"], safety:"normal",
      fn:(s,c)=>"Sore muscles are normal — they're rebuilding. If you're really sore, do an easy walk + gentle mobility, water, and 7+ hours sleep. Legs toast but arms fine? Do upper body instead. No panic — one shifted day changes nothing." },
    { k:["missed","skipped","fell behind"], safety:"normal",
      fn:(s,c)=>"No panic — one missed day changes nothing. Don't double up; just do today's session. If you like, slot the missed one onto a walk or rest day later this week." },
    { k:["out of chicken","no chicken","instead of chicken","no protein"], safety:"normal",
      fn:(s,c)=>"Keep ~30–40 g protein: 3 eggs + milk · 1 cup Greek yogurt · canned tuna/salmon · beans + rice · cottage cheese or deli. Your body wants the protein, not specifically chicken." },
    { k:["can't cook","cant cook","no cook","no-cook","too tired to cook"], safety:"normal",
      fn:(s,c)=>"No cooking needed: Greek yogurt + fruit + nuts · hard-boiled eggs + cheese · canned tuna/chicken + crackers · milk · rotisserie chicken or deli. Add a starch and some fruit/veg and you're on plan." },
    { k:["eat out","eating out","restaurant","menu","order","takeout"], safety:"normal",
      fn:(s,c)=>"Order like your plate at home: a grilled/baked protein (palm or two), a carb (rice/potato — cupped handful), veg/salad, sauces on the side, water. Skip fried/breaded/creamy most of the time. One meal out changes nothing." },
    { k:["potato","rice","plantain","starch","swap potato"], safety:"normal",
      fn:(s,c)=>"Easy swap — ½ plantain ≈ ½ cup mashed potatoes ≈ ⅓–½ cup cooked rice. Keep the same measured portion. Variety is good; the carbs do the same job." },
    { k:["protein target","hit protein","enough protein","how much protein","more protein"], safety:"normal",
      fn:(s,c)=>"Aim ~115–125 g across 3 feedings (≈35–40 g each): breakfast 3 eggs + yogurt, lunch 1½–2 palms chicken, evening yogurt + milk. Short? Add a cup of Greek yogurt or a couple eggs." },
    { k:["calorie","eat less","eat more","deficit","portion","how much should i eat"], safety:"normal",
      fn:(s,c)=>{ if(any(s,["didn't work out","didnt work out","rest day","no workout"])) return "Don't eat less just because you didn't train — your body still needs protein to recover, and one rest day barely moves the math. Eat your normal portions. Adjust from the weekly trend."; return "Your plan is ~1,850–1,950 cal, a starting estimate. The real tool is consistent measured portions: palms, cups, fists. Run it 14 days, then adjust from your weekly weight, energy, and how clothes fit."; } },
    { k:["weight","scale","not changing","not losing","plateau","stuck"], safety:"normal",
      fn:(s,c)=>"Use the weekly average, not a single morning — water and food swing it 1–2 lb daily. If the weekly average is truly flat for 2–3 weeks and the goal is loss, check protein, portions, steps, and sleep first; then trim ~100–150 cal (cut oil/sauce, not protein). Muscle gain can stall the scale while photos improve." },
    { k:["water","hydrate","hydration","drink","how much water"], safety:"normal",
      fn:(s,c)=>"About 6–8 cups a day: 1 on waking, 1 with each meal, 1 around your workout. A gallon isn't necessary. A bit more if it's hot or you're sweating." },
    { k:["sleep","tired","exhausted","recover","recovery","no energy"], safety:"normal",
      fn:(s,c)=>"Recovery is where results happen — aim for 7+ hours, keep Sunday a true rest day, and don't stack hard sessions back-to-back. If you're wiped, go easy today and let your body catch up." },
    { k:["motivat","give up","giving up","quit","consistency","discourag","keep going"], safety:"normal",
      fn:(s,c)=>"Hammy's got you. 🐹 You don't need perfect — you need to keep showing up, and you are. Pick the next small win: today's workout, one good meal, your water. Stack those and the results come." },
  ];

  window.HammyOfflineHelp = {
    label: "Hammy's Offline Quick Help",
    answer: function(message, context){
      const s = M(message);
      const c = context || {};
      let best = null, bestScore = 0;
      for(const it of INTENTS){
        const score = it.k.reduce((n,w)=> n + (s.indexOf(w) >= 0 ? (w.length>6?2:1) : 0), 0);
        if(score > bestScore){ bestScore = score; best = it; }
      }
      if(best && bestScore > 0) return { reply: best.fn(s, c), options: [], safety: best.safety, source: "offline" };
      const t = todayLine(c);
      return { reply: `I can give quick offline tips on workouts, swaps, soreness, meals, protein, eating out, sleep, and your weight.\n${t?t+"\n":""}For a full answer, reconnect to chat with Hammy. What do you need a quick tip on?`, options: [], safety: "normal", source: "offline" };
    }
  };
})();
