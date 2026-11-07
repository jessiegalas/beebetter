const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/lib/progression.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
vm.runInThisContext('(function(exports){' + source + '\n})')(mod.exports);
const {
  ACHIEVEMENTS,
  CORE_BRANCHES,
  branchProgressList,
  calculateLevel,
  countReachedMilestones,
  evaluateAchievements,
  milestoneWindow,
  nextMilestone,
} = mod.exports;
let count = 0;
function test(name, run) { run(); count++; console.log('PASS ' + name); }
const unlockedIds = stats => evaluateAchievements(stats).filter(item => item.unlocked).map(item => item.id);
const windowXp = totalXp => milestoneWindow(totalXp).map(item => item.xp);

test('level calculation preserves the existing 100 XP formula', () => {
  assert.deepEqual(calculateLevel(0), { level: 1, currentLevelXp: 0, xpForNextLevel: 100, progressPercent: 0 });
  assert.deepEqual(calculateLevel(99), { level: 1, currentLevelXp: 99, xpForNextLevel: 100, progressPercent: 99 });
  assert.deepEqual(calculateLevel(100), { level: 2, currentLevelXp: 0, xpForNextLevel: 100, progressPercent: 0 });
  assert.deepEqual(calculateLevel(250), { level: 3, currentLevelXp: 50, xpForNextLevel: 100, progressPercent: 50 });
  assert.deepEqual(calculateLevel(-40), { level: 1, currentLevelXp: 0, xpForNextLevel: 100, progressPercent: 0 });
});

test('early milestone window matches the previous Skill Tree ladder', () => {
  assert.deepEqual(windowXp(0), [25, 50, 75, 100, 125, 150]);
  assert.deepEqual(windowXp(25), [25, 50, 75, 100, 125, 150]);
  assert.deepEqual(windowXp(90), [25, 50, 75, 100, 125, 150]);
});

test('milestone window advances beyond 150 XP without a cap', () => {
  assert.deepEqual(windowXp(150), [100, 125, 150, 200, 300, 400]);
  assert.deepEqual(windowXp(250), [125, 150, 200, 300, 400, 500]);
  const distant = milestoneWindow(1_000_000_000);
  assert.equal(distant.length, 6);
  assert.ok(distant.every((item, index) => index === 0 || item.xp > distant[index - 1].xp));
  assert.ok(distant.at(-1).xp > 1_000_000_000);
});

test('reached counts and next milestone stay consistent with level boundaries', () => {
  const cases = [[0, 0], [24, 0], [25, 1], [99, 3], [100, 4], [149, 5], [150, 6], [199, 6], [200, 7], [250, 7], [300, 8]];
  for (const [xp, expected] of cases) assert.equal(countReachedMilestones(xp), expected);
  assert.equal(nextMilestone(0).xp, 25);
  assert.equal(nextMilestone(100).xp, 125);
  assert.equal(nextMilestone(149).xp, 150);
  assert.equal(nextMilestone(150).xp, 200);
  assert.equal(nextMilestone(250).xp, 300);
  assert.ok(nextMilestone(1_000_000_000).xp > 1_000_000_000);
  for (const xp of [0, 25, 100, 150, 200, 250, 4000]) {
    const next = nextMilestone(xp);
    assert.ok(next.xp > xp);
    assert.ok(milestoneWindow(xp).some(item => item.id === next.id));
  }
});

test('milestone labels and levels derive from the same definitions', () => {
  const window = milestoneWindow(375);
  assert.equal(window.length, 6);
  assert.equal(new Set(window.map(item => item.id)).size, 6);
  for (const item of window) {
    assert.equal(item.label, item.xp + ' XP');
    assert.equal(item.level, calculateLevel(item.xp).level);
  }
  assert.deepEqual(window.map(item => item.xp), [150, 200, 300, 400, 500, 600]);
});

test('achievements preserve the five existing definitions and eligibility', () => {
  assert.deepEqual(ACHIEVEMENTS.map(item => [item.id, item.title, item.description]), [
    ['first_quest', 'First Flight', 'Complete 1 quest'],
    ['five_quests', 'Busy Worker', 'Complete 5 quests'],
    ['level_2', 'Hive Rising', 'Reach Level 2'],
    ['streak_3', 'On A Roll', 'Reach a 3-day streak'],
    ['level_5', 'Master Pollinator', 'Reach Level 5'],
  ]);
  assert.deepEqual(unlockedIds({ questsCompleted: 0, level: 1, currentStreak: 0 }), []);
  assert.deepEqual(unlockedIds({ questsCompleted: 1, level: 1, currentStreak: 0 }), ['first_quest']);
  assert.deepEqual(unlockedIds({ questsCompleted: 5, level: 1, currentStreak: 0 }), ['first_quest', 'five_quests']);
  assert.deepEqual(unlockedIds({ questsCompleted: 0, level: 2, currentStreak: 0 }), ['level_2']);
  assert.deepEqual(unlockedIds({ questsCompleted: 0, level: 4, currentStreak: 2 }), ['level_2']);
  assert.deepEqual(unlockedIds({ questsCompleted: 0, level: 1, currentStreak: 3 }), ['streak_3']);
  assert.deepEqual(unlockedIds({ questsCompleted: 5, level: 5, currentStreak: 3 }), [
    'first_quest', 'five_quests', 'level_2', 'streak_3', 'level_5',
  ]);
});

test('achievement evaluation returns status copies without mutating definitions', () => {
  const before = ACHIEVEMENTS.map(item => item.id);
  const result = evaluateAchievements({ questsCompleted: 1, level: 1, currentStreak: 0 });
  assert.equal(result.length, ACHIEVEMENTS.length);
  assert.equal(typeof result[0].unlocked, 'boolean');
  assert.equal(typeof ACHIEVEMENTS[0].unlocked, 'function');
  assert.notEqual(result[0], ACHIEVEMENTS[0]);
  assert.deepEqual(ACHIEVEMENTS.map(item => item.id), before);
});

test('branch progress always renders the four core branches in order', () => {
  assert.deepEqual([...CORE_BRANCHES], ['Academics', 'Habits', 'Social', 'Health']);
  const branches = branchProgressList();
  assert.deepEqual(branches.map(item => item.category), ['Academics', 'Habits', 'Social', 'Health']);
  assert(branches.every(item => item.xp === 0 && item.completed === 0 && item.level === 1));
});

test('branch progress merges attributed XP with completion counts and derives levels', () => {
  const branches = branchProgressList(
    { Academics: 250, Habits: 75, Social: -10 },
    { Academics: 3, Habits: 2, Social: 1, Health: 4 },
  );
  const byCategory = Object.fromEntries(branches.map(item => [item.category, item]));
  assert.equal(byCategory.Academics.xp, 250);
  assert.equal(byCategory.Academics.completed, 3);
  assert.equal(byCategory.Academics.level, 3);
  assert.equal(byCategory.Academics.category, 'Academics');
  assert.equal(byCategory.Academics.currentLevelXp, 50);
  assert.equal(byCategory.Academics.progressPercent, 50);
  assert.equal(byCategory.Habits.level, 1);
  assert.equal(byCategory.Social.xp, 0);
  assert.equal(byCategory.Social.completed, 1);
  assert.equal(byCategory.Health.xp, 0);
  assert.equal(byCategory.Health.completed, 4);
});

test('custom branches are first-class, sorted after the core branches, and appear once used', () => {
  const branches = branchProgressList(
    { Reading: 40, Fitness: 120, Unused: 0 },
    { Reading: 1, Cooking: 2, Fitness: 1 },
  );
  assert.deepEqual(branches.map(item => item.category), ['Academics', 'Habits', 'Social', 'Health', 'Cooking', 'Fitness', 'Reading']);
  const reading = branches.at(-1);
  assert.equal(reading.xp, 40);
  assert.equal(reading.completed, 1);
  assert.equal(reading.level, 1);
  assert.equal(branches.find(item => item.category === 'Fitness').level, 2);
  assert.equal(branches.some(item => item.category === 'Unused'), false);
});

console.log(count + ' progression tests passed.');
