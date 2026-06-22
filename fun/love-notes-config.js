/* love-notes-config.js — the little notes Hammy "delivers" to Isa. 💌
   ───────────────────────────────────────────────────────────────────────────
   These are yours, Felipe. Just like the sweet "I love you, Isa!" messages already
   sprinkled through the app, they ship inside the public site source — so anyone who
   views the page source could read them. They're kept warm rather than deeply private.
   (Want truly private ones someday? We can move them behind the secure Worker so only
   Isa, after unlocking, ever sees them.)

   - `from`   : signature shown under each note.
   - `notes`  : milestone notes. Hammy hand-delivers ONE on a good day (after Isa finishes
                a workout, hits her protein goal, logs steps, or saves a check-in), in
                order, then loops.
   - `special`: surprise notes for specific dates ("MM-DD"), delivered that day with extra
                confetti, ahead of the milestone notes.
*/
window.HAMMY_LOVE_NOTES = {
  from: "Felipe",
  notes: [
    "Saw you show up for yourself again today. That quiet, stubborn consistency? It's one of my favorite things about you. 💕",
    "Hammy filed a report: subject is doing amazing, recommend extra love. I approved it instantly. 🐹💗",
    "You don't have to be perfect for me to be proud of you. You just have to be you — and you nailed that part years ago.",
    "Little check-in from the person who's always in your corner: you're doing better than you think. Keep going, mi vida. 🌸",
    "Strong, soft, stubborn, kind — somehow all at once. I don't know how you do it, but I'm so lucky I get to watch.",
    "If today was hard, I'm still proud of you. If today was easy, I'm still proud of you. There's no version where I'm not. 💪",
    "Reminder from your biggest fan: rest counts too, snacks count too, and you are not behind on anything that matters. 🐹",
    "Hammy and I agree on exactly one thing without arguing: you're the best part of our day. 💕",
    "Whatever you're carrying today, you're not carrying it alone. I've got the other handle. Always.",
    "You make taking care of yourself look like love — because that's exactly what it is. Proud of you, cariño. 🌷"
  ],
  special: {
    "04-26": {
      title: "Happy Birthday, Isa! 🎂",
      text: "Another whole year of you — still the luckiest thing that ever happened to me. Thank you for every ordinary day you quietly make extraordinary just by being in it. Today I hope the world spoils you back even a fraction as much as you deserve. Te amo. 🎈💕",
      style: "birthday"
    },
    "11-15": {
      title: "Happy Anniversary 💕",
      text: "Of all the days on the calendar, this is my favorite — the one that started us. I'd choose you again in every version of the story, no hesitation, every single time. Thank you for being my person. Here's to us, and to all the years still coming. 🥂🌹",
      style: "birthday"
    }
  }
};
