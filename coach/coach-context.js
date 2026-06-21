/* coach-context.js — buildCoachContext()
   Reads ONLY sanitized, relevant current tracker values to ground Hammy's answers.
   Never reads or transmits weight history, check-ins, backups, or unrelated notes.
   Returns a small plain object that is safe to send to the Worker. No eval, no provider keys. */
(function(){
  "use strict";
  const PROTEIN_TARGET = "115–125 g/day across 3 feedings (~10am, 1–2pm, 6–8pm)";
  const CAL_ESTIMATE = "~1,850–1,950 calories (a starting estimate, not exact)";
  const EQUIPMENT = ["sturdy backpack with books/bottles", "stable sofa", "solid step", "wall/chair for balance"];
  const PRIORITIES = "Build glutes + upper-body strength, hit protein, stay consistent — adjust food from the weekly weight trend, not single days.";
  function dayName(d){ return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d]; }

  window.buildCoachContext = function buildCoachContext(){
    const c = { proteinTarget: PROTEIN_TARGET, calorieEstimate: CAL_ESTIMATE, equipment: EQUIPMENT, priorities: PRIORITIES };
    try{
      const today = (typeof TODAY_DOW !== "undefined") ? TODAY_DOW : new Date().getDay();
      c.dayName = dayName(today);
      if(typeof WORKOUTS !== "undefined" && typeof SCHED !== "undefined"){
        const scheduled = SCHED[today] && SCHED[today].wo;
        const effective = (typeof effectiveType !== "undefined") ? effectiveType(today) : scheduled;
        c.scheduledWorkout = (WORKOUTS[scheduled] && WORKOUTS[scheduled].label) || scheduled;
        if(effective && effective !== scheduled) c.selectedWorkout = (WORKOUTS[effective] && WORKOUTS[effective].label) || effective;
        const W = WORKOUTS[effective] || WORKOUTS[scheduled] || {};
        c.focus = W.focus || "";
        c.restDay = (effective || scheduled) === "rest";
        c.walkDay = (effective || scheduled) === "walk";
        if(W.ex && typeof EX !== "undefined"){
          c.exercises = W.ex.map(id => (EX[id] && EX[id].name) || id);
          if(typeof setsLabel !== "undefined"){
            try{ c.setsReps = W.ex.map(id => (EX[id] ? (EX[id].name + ": " + setsLabel(EX[id])) : id)).join(" · "); }catch(e){}
          }
        }
      }
      if(typeof MEAL_ROT !== "undefined" && typeof SCHED !== "undefined" && SCHED[today]) c.mealToday = MEAL_ROT[SCHED[today].meal];
      if(typeof currentWeek !== "undefined") c.week = currentWeek();
      if(typeof stepTarget !== "undefined"){ const t = parseInt(stepTarget(),10)||0; if(t) c.stepTarget = t; }
      if(typeof gStepsActual !== "undefined"){ const s = gStepsActual(); if(s) c.stepsToday = s; }
      if(typeof gSleep !== "undefined"){ const s = gSleep(); if(s) c.sleepToday = s; }
      if(typeof GROCERIES !== "undefined" && Array.isArray(GROCERIES)) c.foods = GROCERIES.slice(0, 16);
    }catch(e){}
    return c;
  };
})();
