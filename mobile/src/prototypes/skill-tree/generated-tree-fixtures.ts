import type { TreeData, TreeQuest } from './generated-tree-layout';

const core = [
  { id: 'academics', title: 'Academics' }, { id: 'habits', title: 'Habits' },
  { id: 'health', title: 'Health' }, { id: 'social', title: 'Social' },
];
const time = '2026-11-11T00:00:00Z';
const quest = (id: string, title: string, overrides: Partial<TreeQuest> = {}): TreeQuest => ({
  id, title, domainId: 'academics', state: 'active', createdAt: time, ...overrides,
});
const mixed: TreeData = {
  domains: [...core, { id: 'creative', title: 'Creative projects' }],
  lines: [
    { id: 'midterms', domainId: 'academics', title: 'Midterm prep' },
    { id: 'thesis', domainId: 'academics', title: 'Thesis' },
    { id: 'studio', domainId: 'creative', title: 'Studio practice' },
  ],
  quests: [
    quest('review', 'Review chapters 1–3', { lineId: 'midterms' }),
    quest('quiz', 'Take practice quiz', { lineId: 'midterms', state: 'locked', prerequisiteId: 'review' }),
    quest('outline', 'Outline the introduction and methodology before meeting my thesis adviser', { lineId: 'thesis' }),
    quest('sources', 'Organize references', { lineId: 'thesis', state: 'completed' }),
    // The only projection of this quest is its saved completion.
    quest('deleted-original', 'Read a chapter', { lineId: 'midterms', state: 'completed' }),
    quest('email', 'Email my adviser'),
    quest('rehearse', 'Rehearse my research presentation', { lineId: 'thesis', state: 'locked', prerequisiteId: 'quiz' }),
    quest('water', 'Fill my water bottle', { domainId: 'health' }),
    quest('run', 'Log a morning walk', { domainId: 'health', state: 'pending' }),
    quest('desk', 'Tidy my desk', { domainId: 'habits', state: 'rejected' }),
    quest('call', 'Call a friend', { domainId: 'social', state: 'completed' }),
    quest('poster', 'Sketch a presentation poster', { domainId: 'creative', lineId: 'studio', state: 'locked', prerequisiteId: 'outline' }),
  ],
};

export const generatedTreeFixtures: { label: string; data: TreeData }[] = [
  { label: 'Empty tree', data: { domains: core, lines: [], quests: [] } },
  { label: 'One quest', data: { domains: core.slice(0, 1), lines: [], quests: [quest('read', 'Read lecture notes')] } },
  { label: 'Mixed tree', data: mixed },
  { label: 'Crowded domain', data: {
    domains: mixed.domains, lines: mixed.lines, quests: [...mixed.quests, ...Array.from({ length: 54 }, (_, index) =>
      quest('practice-' + String(index).padStart(2, '0'), 'Practice exercise ' + (index + 1), { lineId: 'thesis' }))],
  } },
];
