const fs = require('fs');
const path = require('path');

// Ported date utilities from storage.js & dailylog.js
const EPOCH = new Date(2026, 2, 23, 0, 0, 0, 0); // March 23, 2026

function getAbsWkForOffset(relativeOffset) {
  const d = new Date();
  const dy = d.getDay();
  d.setDate(d.getDate() + (dy === 0 ? -6 : 1 - dy) + relativeOffset * 7);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - EPOCH.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

const currentAbsWk = getAbsWkForOffset(0);

const categories = [
  { name: 'Project', color: '#2563a8' },
  { name: 'Intern prep', color: '#2d6a4f' },
  { name: 'Upskilling', color: '#5b4fa8' },
  { name: 'Reading', color: '#92610a' },
  { name: 'Acads', color: '#6b6760' },
  { name: 'Other', color: '#495057' }
];

const habits = [
  { id: 'run', name: 'Run', target: 3, color: '#2d6a4f' },
  { id: 'rest', name: 'Rest', target: 5, color: '#5b5ea7' },
  { id: 'code', name: 'Code 1h', target: 5, color: '#2563a8' }
];

const mockBacklog = {
  items: [
    { id: 'b1', text: 'Read Deep Work chapters 4-6', category: 'Reading' },
    { id: 'b2', text: 'Solve 20 DP problems on Leetcode', category: 'Intern prep' },
    { id: 'b3', text: 'Refactor Tailwind styles in home page', category: 'Project' }
  ],
  updated_at: new Date().toISOString()
};

const mockData = {
  wt_categories: categories,
  wt_habits: habits,
  wt_backlog: mockBacklog,
  wt_last_monday: new Date(EPOCH.getTime() + currentAbsWk * 7 * 24 * 60 * 60 * 1000).toDateString(),
  wt_exported: new Date().toISOString().slice(0, 10)
};

// Generate 5 weeks: currentAbsWk-4, currentAbsWk-3, currentAbsWk-2, currentAbsWk-1, currentAbsWk
const weeksToGenerate = [
  { offset: -4, theme: 'Acads Focus', intention: 'Prepare for mid-semester exams and draft project proposal' },
  { offset: -3, theme: 'Project Kickoff', intention: 'Bootstrap the React application and design database schema' },
  { offset: -2, theme: 'Algorithm Sprint', intention: 'Revise trees/graphs and implement authentication flow' },
  { offset: -1, theme: 'System Integration', intention: 'Connect backend APIs, handle errors, and write unit tests' },
  { offset: 0, theme: 'Optimization & Review', intention: 'Profile application performance and polish overall UI/UX' }
];

const sampleTodos = {
  'Project': [
    { text: 'Initialize Git repo and config files', done: true },
    { text: 'Set up development server & proxy', done: true },
    { text: 'Implement authentication state management', done: false },
    { text: 'Design responsive layout for main dashboard', done: false }
  ],
  'Intern prep': [
    { text: 'Solve 5 array questions', done: true },
    { text: 'Revise Operating Systems memory management', done: true },
    { text: 'Mock interview session with peer', done: false }
  ],
  'Upskilling': [
    { text: 'Watch CSS Grid advanced tutorial', done: true },
    { text: 'Read articles on WebAuthn integration', done: false }
  ],
  'Reading': [
    { text: 'Read chapter 2 of Atomic Habits', done: true }
  ],
  'Acads': [
    { text: 'Complete Math assignment 3', done: true },
    { text: 'Prepare presentation slides for CS seminar', done: false }
  ]
};

const sampleIntents = {
  'Project': [
    { intent: 'Setup Webpack / Vite config & linting rules', note: 'Configured ES modules correctly.' },
    { intent: 'Implement Supabase auth hooks', note: 'Created sign-in / sign-out handlers in auth.js.' },
    { intent: 'Debug local carry-forward task duplications', note: 'Identified that the start-timer event handler was missing UUID checks.' },
    { intent: 'Add theme toggle functionality', note: 'Used CSS custom variables and persisted state.' }
  ],
  'Intern prep': [
    { intent: 'Practice Dijkstra & Bellman-Ford algorithms', note: 'Implemented both on LeetCode.' },
    { intent: 'Review Database indexing and transaction isolation', note: 'Took notes on B-Trees vs Hash indexes.' },
    { intent: 'Review DNS and TCP handshake flows', note: 'Created quick diagrams for quick memory revision.' }
  ],
  'Upskilling': [
    { intent: 'Learn basics of WebSockets in Node.js', note: 'Built a simple chat application in local environment.' },
    { intent: 'Go through React 19 concurrent features', note: 'Tested useActionState hook.' }
  ],
  'Reading': [
    { intent: 'Read part 1 of The Pragmatic Programmer', note: 'Highly relevant ideas on keeping code dry.' }
  ],
  'Acads': [
    { intent: 'Attend Computer Networks lab class', note: 'Completed socket programming lab work.' },
    { intent: 'Review DBMS lecture slides on normalization', note: 'Worked through 3NF and BCNF problems.' }
  ]
};

weeksToGenerate.forEach(({ offset, theme, intention }) => {
  const absWk = currentAbsWk + offset;
  
  // 1. Focus map
  const focus = {};
  categories.forEach((c, idx) => {
    focus[c.name] = idx < 3 ? 'high' : 'low';
  });
  mockData[`wt_focus_${absWk}`] = focus;

  // 2. Order
  mockData[`wt_order_${absWk}`] = categories.map(c => c.name);

  // 3. Week Data
  const stack = {};
  categories.forEach(c => {
    stack[c.name] = `Focusing on ${c.name} tasks for ${theme}`;
  });

  const todos = {};
  categories.forEach(c => {
    const list = sampleTodos[c.name] || [];
    todos[c.name] = list.map((t, idx) => ({
      id: `task_${absWk}_${c.name.slice(0,3)}_${idx}`,
      text: t.text,
      done: Math.random() > 0.4 ? t.done : !t.done,
      deleted: false
    }));
  });

  const days = [];
  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  for (let dIdx = 0; dIdx < 7; dIdx++) {
    // Generate daily blocks
    const blocks = [];
    const dayHabits = {};
    
    // Habits
    habits.forEach(h => {
      // run: 3 times a week, rest: 5 times a week, code: 5 times a week
      if (h.id === 'run') {
        dayHabits[h.id] = (dIdx === 0 || dIdx === 2 || dIdx === 4); // Mon, Wed, Fri
      } else if (h.id === 'rest') {
        dayHabits[h.id] = (dIdx !== 1 && dIdx !== 3); // Rest on 5 days
      } else {
        dayHabits[h.id] = (dIdx < 5); // Code on Mon-Fri
      }
    });

    const isFullRestDay = (offset < 0 && dIdx === 6); // Sunday is full rest in past weeks

    if (!isFullRestDay) {
      // Add 1-3 blocks of work
      const numBlocks = Math.floor(Math.random() * 3) + 1;
      const slots = ['morning', 'afternoon', 'evening'];
      
      for (let b = 0; b < Math.min(numBlocks, slots.length); b++) {
        const cat = categories[Math.floor(Math.random() * 4)]; // Pick first 4 categories mostly
        const intents = sampleIntents[cat.name] || [{ intent: 'General study / review', note: '' }];
        const intentObj = intents[Math.floor(Math.random() * intents.length)];
        
        blocks.push({
          category: cat.name,
          intent: intentObj.intent,
          duration: `${[30, 45, 60, 90, 120][Math.floor(Math.random() * 5)]}m`,
          slot: slots[b],
          notes: intentObj.note,
          focusQuality: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
          source: 'manual',
          linkedTasks: []
        });
      }
    }

    days.push({
      mvd: !isFullRestDay && blocks.length >= 2,
      fullRest: isFullRestDay,
      blocks: isFullRestDay ? [] : blocks,
      habits: dayHabits,
      journal: isFullRestDay 
        ? 'Took a complete screen-free day today. Read physical book, went to park.' 
        : `Progressed well on my weekly targets today. ${blocks.map(b => b.intent).join('; ')}.`
    });
  }

  const review = {
    worked: `Completed core modules for ${theme}. Good morning focus.`,
    didnt: 'Slightly distracted in the afternoons. Wasted some time scrolling.',
    adjust: 'Work from library in the afternoons to maintain momentum.'
  };

  mockData[`wt_wk_${absWk}`] = {
    intention,
    stack,
    todos,
    days,
    review,
    __updated_at: new Date().toISOString()
  };
});

fs.writeFileSync(
  path.join(__dirname, '..', 'tracker_mock_data.json'),
  JSON.stringify(mockData, null, 2)
);

console.log('Successfully wrote mock data to tracker_mock_data.json!');
