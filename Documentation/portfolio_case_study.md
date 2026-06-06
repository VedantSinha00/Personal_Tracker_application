# Personal Tracker — A Portfolio Case Study

## Problem

I was burning out — not from doing too much, but from not being able to see what I was actually doing. Juggling academics, two projects, an internship search, and personal systems simultaneously, I had no way to track where my time and energy were going, which meant I had no way to optimize any of it. My system was diaries and post-it notes: good, but fragmented, offline, and impossible to cross-reference.

The obvious answer was Notion, but the kind of inter-system flexibility I needed — where my weekly intentions, time blocks, habits, tasks, and reflections could all live together and influence each other — wasn't something any existing tool supported without heavy compromise. So I built a single HTML file with localStorage just to experiment. It kept growing until it became this.

---

## Build

The stack evolved in layers. Supabase came in as a way to skip building a backend entirely — I wanted to focus on product behavior, not infrastructure. The localStorage + Supabase dual-layer came next: localStorage for instant startup (the app loads from local cache while cloud sync runs in the background), Supabase for persistence across devices. I made that call for performance reasons without fully understanding the architectural pattern at the time. Looking back, it was the right design for exactly the reason I'd hoped.

Electron came last. Once the web version was stable and I was using it daily, I wanted it as a real desktop app. Not for technical reasons — I wanted to pin it to my taskbar. That turned out to be a non-trivial conversion, but getting there was one of the more satisfying milestones of the project.

The features I actually use, in rough order of importance:

- **Block logging + stopwatch** — the core of everything: log what you worked on, for how long, with intent and a note
- **Stack** — categorized to-do lists organized by area (projects, internship, academics, etc.)
- **Backlog** — deliberate deprioritization: things that matter but not this week
- **Daily journal** — a short close-out at the end of each day
- **Habits** — simple daily tracking against a weekly target
- **Weekly review** — where lessons get recorded (the actual analysis happens outside the app, in Claude)
- **Insights** — long-period data visualization; the least developed part

Three serious data-loss bugs shipped and got fixed across roughly 130 commits over 10 weeks. The clearest one: habits were being overwritten with app defaults on every re-login. The bug was in the sync pipeline. On a fresh session, the app would optimistically render default habits before the cloud loaded, then push those defaults back to Supabase, destroying the real data. Fixing it meant tracing the full hydration sequence and adding guards at three separate points in the pipeline.

The security hardening came from a different direction entirely. I was learning about Supabase RLS for another project and realized I had never implemented it here. That turned into a dedicated PR: Content Security Policy, HTML escaping across all renderers, deep-link CSRF guards, RLS policies. It was learning through a real codebase, on something I actually used.

---

## Learn

The most surprising thing I learned about building products is how decomposable complexity actually is. The systems running this app (dual-layer sync, hydration sequencing, carry-forward logic) look complicated from the outside. But every one of them was built from the ground up, one layer at a time, and that changes how it looks entirely. What I understand now that I didn't before: complicated systems aren't monolithic, they're just a lot of small things that interact. If you understand the foundation and how it grows, the whole thing becomes legible.

About myself: I've learned to trust the process of being stuck. Every problem that felt unsolvable, every bug I couldn't trace, every system I couldn't picture, eventually got resolved when I stayed with it long enough. That's not naive optimism at this point, it's just an observed pattern. I've stopped treating difficulty as a signal that something is beyond me.

On building with AI, this is the one that changed the most. I used to think "building" meant being able to recall syntax, hold logic in your head, know where the semicolons go. That made it feel gatekept. It isn't anymore. The gap between people who can code and people who can't has genuinely thinned.

But here's what I noticed working around other people doing the same: vibe coding without a mental model produces vague prompts, which produce wrong code, which produces confusion. The people who get the most out of AI-assisted building are the ones who understand, even loosely, what the code is doing and why. Not to write it themselves, but to articulate the problem precisely enough that the agent has almost no room to misinterpret. That's the skill that transferred. Not syntax. Not recall. The ability to think in systems and describe them exactly.

---

## Result

After 10 weeks of daily use, the core thing it changed is cognitive load. I no longer hold my systems in my head. The weekly intentions, the time logs, the habits, the backlog, the review — they all live somewhere outside my brain, which means my brain is free for the actual work. That sounds abstract until you've experienced the alternative. Burnout, for me, was never about doing too much. It was about carrying too much. This fixed that.

It's a personal tool, not a product, and that distinction mattered a lot during the build. Because I was never designing for someone else, I never had to compromise. Every system, every feature, every UX quirk is exactly what I needed and nothing more. That freedom produced something more genuinely useful to me than any generalized productivity app could have been.

For it to become a product, two things would have to change. First, the core systems would need to be generalized — right now they're shaped entirely around how I think about my week, which won't map cleanly onto how someone else does. Second, onboarding would need a complete rethink. The app is complex, and I've always known exactly where everything is and how it works. A new user wouldn't. The UX is optimized for me, which is fine for a personal tool and a real problem for anything else.

That's not a failure. It was never meant to be a product. It was meant to solve a specific problem for one person, and it does.
