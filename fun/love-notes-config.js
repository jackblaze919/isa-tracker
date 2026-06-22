/* love-notes-config.js — the little notes Hammy "delivers" to Isa. 💌
   ───────────────────────────────────────────────────────────────────────────
   EDIT THIS FILE to make them yours. Just like the sweet "I love you, Isa!"
   messages already sprinkled through the app, these ship inside the public site
   source — so anyone who views the page source could read them. Keep them sweet
   rather than deeply private. (Want truly private notes someday? We can move them
   behind the secure Worker so only Isa, after unlocking, ever sees them.)

   - `from`   : optional signature shown under each note. Leave "" for "— with love 💕".
   - `notes`  : milestone notes. Hammy hand-delivers ONE on a good day (after Isa
                finishes a workout, hits her protein goal, logs steps, or saves a
                check-in), in order, then loops. Add as many as you like.
   - `special`: surprise notes for specific dates (keyed "MM-DD"). Delivered that
                day with extra confetti, ahead of the milestone notes.
*/
window.HAMMY_LOVE_NOTES = {
  from: "",
  notes: [
    "Caught you taking care of yourself again. That's the thing I love most about you. 💕",
    "Proud of you today — not for the numbers, for showing up as you. 🌸",
    "Hammy and I had a meeting. Unanimous: you're amazing. 🐹💗",
    "Whatever kind of day it was, you're still my favorite person. Keep going, mi vida.",
    "Little reminder: you're strong, you're consistent, and you're loved. All three. 💪💕"
  ],
  special: {
    "04-26": {
      title: "Happy Birthday, Isa! 🎂",
      text: "Another whole year of you — still the luckiest thing that ever happened to me. I hope today feels even a fraction as good as you make every one of my days. 🎈💕",
      style: "birthday"
    }
  }
};
