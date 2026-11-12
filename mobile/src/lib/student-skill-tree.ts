import type { Quest } from '@/hooks/use-user-data';
import { DOMAINS } from '@/prototypes/skill-tree/forest-model';
import type { TreeData, TreeQuest } from '@/prototypes/skill-tree/generated-tree-layout';
import { questPrerequisite } from './quest-context';
import type { RecommendationData } from './recommendation-facts';
import type { CompletionRecord } from './student-workspace';

export function buildStudentSkillTree(
  quests: Quest[], history: CompletionRecord[], context: RecommendationData, now = Date.now(),
) {
  const domains = new Map(DOMAINS.map(domain => [domain.name.toLowerCase(), { id: domain.id as string, title: domain.name }]));
  const domainId = (category: string) => {
    const title = category?.trim() || 'Uncategorized';
    const key = title.toLowerCase();
    const existing = domains.get(key);
    if (existing) return existing.id;
    const id = 'category:' + key;
    domains.set(key, { id, title });
    return id;
  };
  const savedQuests = new Set<string>();
  const leaves = new Map<string, CompletionRecord>();
  const nodes: TreeQuest[] = [];
  // History lacks the original creation time. Order live and completed nodes
  // by the same quest ID so a status change does not reorder the branch.
  for (const row of history) {
    const original = row.quest_id;
    const id = original && !savedQuests.has(original) ? original : 'completion:' + row.id;
    if (original) savedQuests.add(original);
    leaves.set(id, row);
    nodes.push({ id, domainId: domainId(row.category), title: row.title, state: 'completed', createdAt: '' });
  }
  const facts = new Map(context.facts.map(fact => [fact.quest_id, fact]));
  const completed = new Set([...savedQuests, ...quests.filter(quest => quest.status === 'completed').map(quest => quest.id)]);
  for (const quest of quests) {
    if (savedQuests.has(quest.id)) continue;
    const prerequisiteId = quest.prerequisite_quest_id ?? undefined;
    const locked = quest.status === 'active' && prerequisiteId && !completed.has(prerequisiteId) &&
      questPrerequisite(quest, facts.get(quest.id), context.factsUpdatedAt, now).locked;
    nodes.push({ id: quest.id, domainId: domainId(quest.category), title: quest.title, createdAt: '',
      state: locked ? 'locked' : quest.status, prerequisiteId });
  }
  const data: TreeData = { domains: Array.from(domains.values()), lines: [], quests: nodes };
  return { data, leaves };
}
