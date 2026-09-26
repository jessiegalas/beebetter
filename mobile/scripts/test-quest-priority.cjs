// Dependency-free test harness: compile the pure TS modules with the project's TypeScript.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  const absolute = path.resolve(__dirname, '../src/lib', file + '.ts');
  if (cache.has(absolute)) return cache.get(absolute);
  const source = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})', { filename: absolute })(
    name => load(name.replace('./', '')), module, module.exports);
  cache.set(absolute, module.exports);
  return module.exports;
}
const { prioritizeQuests, distanceMeters } = load('quest-priority');
const { parseLocalDateTime, parsePreferredTime, formatLocalDateTime } = load('quest-time');
const now = new Date(2026, 8, 25, 10, 0).getTime();
const iso = minutes => new Date(now + minutes * 60000).toISOString();
const place = { id: 'place', name: 'Saved place', latitude: 14.6, longitude: 121, radius: 100, is_active: true };
const context = { now, coords: { latitude: 14.6, longitude: 121, accuracy: 10 }, locationUpdatedAt: now, places: [place], history: [] };
const quest = (id, extra = {}) => ({
  id, title: id, owner_id: 'owner', category: 'Habits', xp: 25, status: 'active',
  created_at: iso(-10), updated_at: iso(-10), location_id: null, is_nearby: false, ...extra,
});
let count = 0;
function test(name, run) { run(); count++; console.log('PASS ' + name); }
const rank = (quests, override = {}) => prioritizeQuests(quests, { ...context, ...override });
test('location plus time beats location alone', () => {
  assert.equal(rank([quest('place', { location_id: 'place' }), quest('both', { location_id: 'place', scheduled_at: iso(40) })])[0].quest.id, 'both');
});
test('location alone is relevant, without requiring a time', () => assert.equal(rank([quest('q', { location_id: 'place' })])[0].tier, 'now'));
test('time alone is relevant without location permission', () => assert.equal(rank([quest('q', { scheduled_at: iso(0) })], { coords: null })[0].tier, 'now'));
test('no context remains available without fabricated reasons', () => {
  const item = rank([quest('q')], { coords: null })[0];
  assert.equal(item.tier, 'other'); assert.deepEqual(item.reasons, ['Fits whenever you have time']);
});
test('recommendations are unchanged when wellness context is absent', () => {
  const quests = [quest('a', { xp: 20 }), quest('b', { importance: 'high' })];
  assert.deepEqual(rank(quests).map(item => [item.quest.id, item.tier, item.score]), rank(quests, { wellness: null }).map(item => [item.quest.id, item.tier, item.score]));
});
test('recent low-capacity context gently favors a manageable quest within its tier', () => {
  const wellness = { checkIn: { check_in_date: '2026-09-25', overall_wellbeing: 2, stress_level: 4, energy_level: 2, motivation_level: 2 }, reflection: null };
  const items = rank([quest('larger', { xp: 50 }), quest('small', { xp: 20 })], { wellness });
  assert.equal(items[0].quest.id, 'small'); assert(items[0].reasons.includes('A manageable step for today'));
  assert.equal(items[0].tier, rank([quest('small', { xp: 20 })])[0].tier);
});
test('high motivation only complements high importance and does not change its tier', () => {
  const q = quest('important', { importance: 'high', xp: 50 });
  const wellness = { checkIn: { check_in_date: '2026-09-25', overall_wellbeing: 4, stress_level: 2, energy_level: 4, motivation_level: 5 }, reflection: null };
  const before = rank([q])[0]; const after = rank([q], { wellness })[0];
  assert.equal(after.tier, before.tier); assert.equal(after.score, before.score + 3); assert(after.reasons.includes('Matches the momentum you reported'));
});
test('recent reflection association is deterministic and does not read private text', () => {
  const reflection = { quest_id: 'related', period_end: '2026-09-25', planning_score: 1, follow_through_score: 2, confidence_score: 2 };
  const items = rank([quest('other'), quest('related')], { wellness: { checkIn: null, reflection } });
  assert.equal(items[0].quest.id, 'related'); assert(items[0].reasons.includes('Connects with your recent reflection'));
});
test('stale wellness context has no effect', () => {
  const wellness = { checkIn: { check_in_date: '2026-08-01', overall_wellbeing: 1, stress_level: 5, energy_level: 1, motivation_level: 1 }, reflection: { quest_id: 'q', period_end: '2026-08-01', planning_score: 1, follow_through_score: 1, confidence_score: 1 } };
  assert.equal(rank([quest('q')], { wellness })[0].score, rank([quest('q')])[0].score);
});
test('due soon can outrank location alone', () => assert.equal(rank([quest('place', { location_id: 'place' }), quest('due', { deadline_at: iso(45) })])[0].quest.id, 'due'));
test('importance changes order when context is otherwise equal', () => assert.equal(rank([quest('normal'), quest('high', { importance: 'high' })])[0].quest.id, 'high'));
test('distance contributes beyond a boolean geofence', () => {
  const farther = { ...place, id: 'farther', latitude: 14.603 };
  const items = rank([quest('near', { location_id: 'place' }), quest('farther', { location_id: 'farther' })], { places: [place, farther] });
  assert.equal(items[0].quest.id, 'near'); assert(items[1].nearby); assert(items[0].score > items[1].score);
});
test('all overlapping fences count, not just the nearest', () => {
  const items = rank([quest('a', { location_id: 'place' }), quest('b', { location_id: 'second' })], { places: [place, { ...place, id: 'second' }] });
  assert(items.every(item => item.nearby && item.tier === 'now'));
});
test('stored nearby flag is never treated as live proximity', () => assert.equal(rank([quest('q', { is_nearby: true })])[0].nearby, false));
test('stale coordinates are ignored', () => assert.equal(rank([quest('q', { location_id: 'place' })], { locationUpdatedAt: now - 360000 })[0].nearby, false));
test('inaccurate GPS is gracefully ignored', () => assert.equal(rank([quest('q', { location_id: 'place' })], { coords: { ...context.coords, accuracy: 2000 } })[0].nearby, false));
test('disabled and missing places are not claimed nearby', () => {
  assert.equal(rank([quest('q', { location_id: 'place' })], { places: [{ ...place, is_active: false }] })[0].nearby, false);
  assert.equal(rank([quest('q', { location_id: 'gone' })])[0].nearby, false);
});
test('newer geofence entry supersedes old GPS', () => assert(rank([quest('q', { location_id: 'place' })], { coords: null, locationUpdatedAt: null, geofenceEvents: { place: { inside: true, timestamp: now } } })[0].nearby));
test('geofence exit supersedes old in-fence GPS', () => assert.equal(rank([quest('q', { location_id: 'place' })], { locationUpdatedAt: now - 1000, geofenceEvents: { place: { inside: false, timestamp: now } } })[0].nearby, false));
test('stale geofence entries expire', () => assert.equal(rank([quest('q', { location_id: 'place' })], { coords: null, geofenceEvents: { place: { inside: true, timestamp: now - 360000 } } })[0].nearby, false));
test('time passing changes hierarchy without changing quests', () => {
  const q = quest('q', { scheduled_at: iso(180) });
  assert.equal(rank([q])[0].tier, 'other');
  assert.equal(rank([q], { now: now + 180 * 60000 })[0].tier, 'now');
});
test('preferred time works across midnight in device local time', () => {
  assert.equal(rank([quest('q', { preferred_time: '00:10:00' })], { now: new Date(2026, 8, 25, 23, 55).getTime() })[0].tier, 'now');
});
test('future schedule reduces immediate recommendations', () => assert.notEqual(rank([quest('q', { scheduled_at: iso(300), location_id: 'place' })])[0].tier, 'now'));
test('history uses completion time rather than edit time', () => {
  const historyQuest = quest('old', { title: 'activity', status: 'completed', completed_at: iso(-6 * 1440), updated_at: iso(0) });
  assert(rank([historyQuest, quest('new', { title: 'activity' })]).find(item => item.quest.id === 'new').reasons.includes('Not done recently'));
});
test('durable history works after original quest deletion', () => {
  const items = rank([quest('new', { title: 'activity' })], { history: [{ id: 'h', quest_id: null, title: 'activity', category: 'Habits', completed_at: iso(-7 * 1440) }] });
  assert(items[0].reasons.includes('Not done recently'));
});
test('recent matching activity decreases priority', () => {
  const q = quest('q');
  assert(rank([q], { history: [{ id: 'h', title: 'q', category: 'Habits', completed_at: iso(-20) }] })[0].score < rank([q])[0].score);
});
test('prerequisite completion changes dependent hierarchy', () => {
  const child = quest('child', { prerequisite_quest_id: 'parent', scheduled_at: iso(0) });
  assert.equal(rank([quest('parent'), child]).find(item => item.quest.id === 'child').tier, 'other');
  assert.equal(rank([quest('parent', { status: 'completed' }), child]).find(item => item.quest.id === 'child').tier, 'now');
});
test('dependency cycles and unavailable prerequisites do not crash', () => {
  const items = rank([quest('a', { prerequisite_quest_id: 'b' }), quest('b', { prerequisite_quest_id: 'a' }), quest('c', { prerequisite_quest_id: 'missing' })]);
  assert(items.every(item => item.tier === 'other')); assert.equal(items.length, 3);
});
test('completing a quest removes it from recommendations', () => assert.equal(rank([quest('q', { status: 'completed', location_id: 'place', deadline_at: iso(0) })])[0].tier, 'history'));
test('pending quests are retained for review', () => assert.equal(rank([quest('q', { status: 'pending' })])[0].tier, 'history'));
test('rejected quests remain actionable', () => assert.equal(rank([quest('q', { status: 'rejected', deadline_at: iso(0) })])[0].tier, 'now'));
test('every quest remains available with stable tie breaks', () => {
  const quests = [quest('b'), quest('a'), quest('c', { location_id: 'missing' })];
  const items = rank(quests);
  assert.equal(items.length, quests.length); assert.equal(new Set(items.map(i => i.quest.id)).size, 3);
  assert.equal(items[0].quest.id, 'a'); assert.equal(quests[0].id, 'b');
});
test('invalid timestamps do not poison scoring', () => assert(Number.isFinite(rank([quest('q', { scheduled_at: 'bad', deadline_at: 'bad', created_at: 'bad' })])[0].score)));
test('Haversine distance is in meters', () => { assert.equal(distanceMeters(place, place), 0); assert(Math.abs(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) - 111195) < 10); });
test('optional time and date roundtrip safely', () => {
  assert.equal(parseLocalDateTime(''), null); assert.equal(parsePreferredTime(''), null);
  assert.equal(formatLocalDateTime(parseLocalDateTime('2026-09-25 10:00')), '2026-09-25 10:00');
});
test('invalid dates and times are rejected', () => {
  assert.throws(() => parseLocalDateTime('2026-02-30 10:00'));
  assert.throws(() => parseLocalDateTime('2026-09-25 24:01'));
  assert.throws(() => parsePreferredTime('25:00'));
  assert.equal(parsePreferredTime('00:00'), '00:00');
});

const { DEFAULT_FILTERS, activeFilterCount, filterAllQuests, recommendedQuests } = load('quest-discovery');
test('discovery filters never affect recommended order or mutate ranking', () => {
  const items = rank([quest('due', { deadline_at: iso(15) }), quest('health', { category: 'Health' }), quest('done', { status: 'completed' })]);
  const before = items.map(item => item.quest.id);
  assert.deepEqual(filterAllQuests(items, { ...DEFAULT_FILTERS, category: 'Health' }, now).map(item => item.quest.id), ['health']);
  assert.deepEqual(recommendedQuests(items).map(item => item.quest.id), ['due', 'health']);
  assert.deepEqual(items.map(item => item.quest.id), before);
});
test('all quests includes history and combines category status and proximity', () => {
  const items = rank([quest('done', { status: 'completed', category: 'Health', location_id: 'place' }), quest('active'), quest('pending', { status: 'pending' })]);
  assert.equal(filterAllQuests(items, DEFAULT_FILTERS, now).length, 3);
  const filters = { ...DEFAULT_FILTERS, category: 'Health', status: 'completed', nearby: true };
  assert.deepEqual(filterAllQuests(items, filters, now).map(item => item.quest.id), ['done']);
  assert.equal(activeFilterCount(filters), 3);
  assert.equal(activeFilterCount(DEFAULT_FILTERS), 0);
});
test('recommendations omit review history and waiting prerequisites', () => {
  const items = rank([quest('waiting', { prerequisite_quest_id: 'missing', deadline_at: iso(-1) }), quest('pending', { status: 'pending' }), quest('done', { status: 'completed' }), quest('ready', { prerequisite_quest_id: 'done' }), quest('revision', { status: 'rejected' })]);
  assert.deepEqual(new Set(recommendedQuests(items).map(item => item.quest.id)), new Set(['ready', 'revision']));
});
test('time filters handle local today preferred times missing and invalid dates', () => {
  const items = rank([quest('today', { scheduled_at: iso(0) }), quest('daily', { preferred_time: '23:00' }), quest('future', { deadline_at: iso(2880) }), quest('none'), quest('invalid', { scheduled_at: 'invalid' })]);
  const ids = time => filterAllQuests(items, { ...DEFAULT_FILTERS, time }, now).map(item => item.quest.id).sort();
  assert.deepEqual(ids('today'), ['daily', 'today']);
  assert.deepEqual(ids('scheduled'), ['daily', 'future', 'today']);
  assert.deepEqual(ids('anytime'), ['invalid', 'none']);
});
test('overdue excludes completed and pending quests', () => {
  const items = rank(['active', 'rejected', 'completed', 'pending'].map(status => quest(status, { status, deadline_at: iso(-1) })));
  assert.deepEqual(filterAllQuests(items, { ...DEFAULT_FILTERS, time: 'overdue' }, now).map(item => item.quest.id).sort(), ['active', 'rejected']);
});
test('nearby filter does not fabricate matches without location', () => {
  const items = rank([quest('q', { location_id: 'place', is_nearby: true })], { coords: null });
  assert.equal(filterAllQuests(items, { ...DEFAULT_FILTERS, nearby: true }, now).length, 0);
  assert.equal(recommendedQuests(items).length, 1);
});

const { validateQuestDates } = load('quest-time');
test('creation rejects past starts and deadlines and invalid calendar dates', () => {
  assert.throws(() => validateQuestDates(iso(-1440), null, now), /Scheduled start cannot/);
  assert.throws(() => validateQuestDates(null, iso(-1), now), /Deadline cannot/);
  assert.throws(() => validateQuestDates('invalid', null, now), /valid date/);
  assert.throws(() => parseLocalDateTime('2026-02-30 12:00'), /valid local/);
});
test('date validation permits anytime current minute and future with ordered deadline', () => {
  validateQuestDates(null, null, now);
  validateQuestDates(iso(0), iso(1), now + 30000);
  validateQuestDates(iso(60), iso(60), now);
  assert.throws(() => validateQuestDates(iso(60), iso(30), now), /on or after/);
  assert.throws(() => validateQuestDates(iso(1), null, now + 120000), /past/);
});
console.log(count + ' context-aware tests passed.');
