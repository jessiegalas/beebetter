const assert = require('node:assert/strict');
const { load } = require('./test-harness.cjs');
const source = require('../src/constants/design-tokens.json');
const tokens = load('src/constants/tokens.ts', { './design-tokens.json': source });
const forest = load('src/prototypes/skill-tree/forest-model.ts', { '@/constants/tokens': tokens });
const facts = load('src/lib/recommendation-facts.ts');
const questContext = load('src/lib/quest-context.ts', { './recommendation-facts': facts });
const { layoutGeneratedTree } = load('src/prototypes/skill-tree/generated-tree-layout.ts');
const { buildStudentSkillTree } = load('src/lib/student-skill-tree.ts', {
  '@/prototypes/skill-tree/forest-model': forest,
  './quest-context': questContext,
});

const now = Date.parse('2026-11-11T12:00:00Z');
const updatedAt = '2026-11-11T11:59:00Z';
const live = (id, category, status = 'active', prerequisite_quest_id = null) => ({
  id, title: id, category, status, prerequisite_quest_id, updated_at: updatedAt,
});
const snapshot = (id, quest_id, category, title) => ({ id, quest_id, category, title, completed_at: updatedAt });
const history = [
  snapshot('saved-review', 'review', 'Academics', 'Review notes'),
  snapshot('saved-deleted', null, 'Art club', 'Paint a mural'),
];
const quests = [
  live('review', 'Social', 'completed'),
  live('quiz', 'Academics', 'active', 'review'),
  live('draft', 'Art club'),
  live('submit', 'Art club', 'active', 'draft'),
  live('pending', 'Habits', 'pending'),
  live('rejected', 'Health', 'rejected'),
  live('schedule', 'Social', 'active', 'outside-history'),
];
const context = { ...facts.EMPTY_RECOMMENDATION_DATA, factsUpdatedAt: now, facts: [
  { quest_id: 'schedule', status: 'active', updated_at: updatedAt,
    prerequisite_quest_id: 'outside-history', prerequisite_status: 'completed' },
] };
const { data, leaves } = buildStudentSkillTree(quests, history, context, now);
assert.equal(data.quests.length, 8);
const byId = new Map(data.quests.map(quest => [quest.id, quest]));
assert.equal(byId.get('review').title, 'Review notes');
assert.equal(byId.get('review').domainId, 'academics');
assert.equal(leaves.get('review'), history[0]);
assert.equal(leaves.get('completion:saved-deleted'), history[1]);
assert.equal(byId.get('completion:saved-deleted').domainId, byId.get('draft').domainId);
assert.equal(byId.get('quiz').state, 'active');
assert.equal(byId.get('submit').state, 'locked');
assert.equal(byId.get('pending').state, 'pending');
assert.equal(byId.get('rejected').state, 'rejected');
assert.equal(byId.get('schedule').state, 'active');
const stale = buildStudentSkillTree(quests, history, context, now + facts.CONTEXT_MAX_AGE + 1);
assert.equal(stale.data.quests.find(quest => quest.id === 'schedule').state, 'locked');

const before = buildStudentSkillTree([live('review', 'Academics'), ...quests.slice(1)], [], context, now);
const after = buildStudentSkillTree(quests.slice(1), history.slice(0, 1), context, now);
assert.deepEqual(layoutGeneratedTree(before.data), layoutGeneratedTree(after.data));
console.log('PASS student tree joins live quests and snapshots, preserves deleted leaves and anchors, and handles prerequisite status');
