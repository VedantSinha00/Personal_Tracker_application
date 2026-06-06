# Personal Tracker — Retrospective Guide
*For a portfolio-ready post-build reflection on a solo project*

---

## How to use this

Do this in one sitting, 45–60 minutes max. Write rough answers first — bullet points, incomplete sentences, whatever comes out. Don't edit while you answer. The thinking matters more than the prose. Once you have raw answers, you can give them to Claude along with your codebase to shape into a portfolio case study using the **Problem / Build / Learn / Result** structure at the bottom of this doc.

---

## Section 1: The Problem

*Why this existed at all.*

- What problem were you actually trying to solve when you started this? Be specific — what was failing in your life or workflow?
- Was there a moment or frustration that triggered it, or was it more of a "let me try building something" impulse?
- How were you managing your week before this existed? What did that look like?
- Did the problem change as you built? Did you end up solving a different problem than the one you started with?

---

## Section 2: What You Built

*Honest inventory of the product.*

- If you had to describe the tracker to someone who'd never seen it in two sentences, what would you say?
- List every feature that exists. Then mark each one: (a) core — users would leave without it, (b) nice-to-have — adds value but optional, (c) built but probably unnecessary.
- Is there anything you built that you never actually use?
- What's missing that you wish existed?

**Get specific with numbers — these matter for a portfolio:**
- How many weeks have you actively used this? How many categories do you track?
- How many meaningful features shipped between v0 and the version you're reflecting on?
- How many bugs were significant enough to cause data loss or a crash?
- Roughly how many hours have you logged into the tracker itself, across all weeks?

---

## Section 3: The Build Process

*How it actually went, not how it should have gone.*

- What was the hardest part of building this — technically or otherwise?
- Where did you get stuck the longest? What unblocked you?
- What did you vibe-code without fully understanding, and does that still worry you?
- Were there decisions you made early that you had to undo or work around later?
- What would you have done in week 1 if you knew what you know now?

**On technical tradeoffs (this is the stuff portfolios are built on):**
- Why did you choose the stack you chose? What alternatives did you consider? (e.g., Electron vs. web app, localStorage + Supabase vs. pure cloud)
- What's the biggest architectural decision you made, and would you make the same call again?
- What's one place where your early design created later pain?

---

## Section 4: What You Actually Learned

*The real gains, not the resume version.*

- What's one thing about building products you now understand that you didn't before?
- What's one thing about yourself as a builder you discovered — positive or uncomfortable?
- Did using AI to build change how you think about what "building" means? How?
- What PM skill did this exercise teach you most — and which one did it fail to teach you?

---

## Section 5: Honest Assessment

*The part people usually skip.*

- If a stranger used this for a week, what would frustrate them?
- Is this a product or a personal tool? Is there a difference in your case?
- Would you be comfortable showing this codebase to a senior engineer? Why or why not?
- On a scale of 1–10, how proud are you of this? What would move it one point higher?

---

## Section 6: The Forward Look

*What this unlocks, not what it closes.*

- What would need to be true for you to want to turn this into something more serious?
- What pattern or habit from building this do you want to carry into your next project?
- What pattern do you want to explicitly leave behind?
- If you wrote a LinkedIn post about this tomorrow, what's the one insight you'd want someone to walk away with?

---

## Resources to Go Deeper

These are worth reading before or after you write your answers — they'll sharpen how you think about retrospectives as a PM skill:

- **Atlassian's retrospective guide** — practical, team-oriented but the principles apply solo: https://www.atlassian.com/team-playbook/plays/retrospective
- **Product School on PM retrospectives** — specifically for product people reflecting on their own work: https://productschool.com/blog/skills/product-manager-retrospective
- **Product Teacher on retrospectives** — good on the difference between sprint retros and project retros: https://www.productteacher.com/articles/retrospectives-for-product-managers
- **"Shape Up" by Basecamp (free)** — not a retro guide, but Chapter 6 on "cool-down" is the best thinking I've found on what reflection after shipping should actually produce: https://basecamp.com/shapeup

---

## After You Answer

Once you have rough answers, give Claude your raw notes + a summary of what the tracker does, and ask it to write a **Problem / Build / Learn / Result** case study.

**The format to request:**

```
Problem (2–3 sentences)
  What specific gap or pain this solved, and for whom (even if "for me").

Build (3–5 bullets)
  What exists in the final version. Lead with the most technically interesting decision,
  not the longest feature list. Include one real number (weeks used, bugs fixed, etc.)

Learn (2–3 bullets)
  One thing about the product space, one thing about yourself as a builder,
  one thing about building with AI. Be honest — vague positivity reads as filler.

Result (2–3 sentences)
  Concrete outcome: does it work? Do you use it? What did it change?
  What would it take to make it something more?
```

**What good looks like:**
The goal is a document where someone reading it thinks *"this person actually understands what they built and why it matters"* — not *"this person used an AI to make their project sound impressive."*

Read the draft out loud. Anything that doesn't sound like you, rewrite it yourself.
