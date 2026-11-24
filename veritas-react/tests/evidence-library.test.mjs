import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardCitation, cardsAsRis, filterCards, parseTags, readCardTags } from '../src/lib/evidence-library.ts';
const card = { id:'a', title:'Fictional study', motion:'Library opening hours', claim:'Longer opening hours help', quote:'An association was observed.', interpretation:'Limited evidence', limitation:'One setting only', authors:['A Researcher'], year:2026, url:'https://example.org/study', textType:'abstract' };
test('saved-source search combines tags, author and excerpt filters without mutating cards', () => {
  assert.deepEqual(filterCards([card], 'researcher pilot', {a:['pilot']}, 'abstract'), [card]);
  assert.deepEqual(filterCards([card], 'pilot', {a:['pilot']}, 'retrieved excerpt'), []);
  assert.deepEqual(filterCards([card], 'missing', {}, 'all'), []);
  assert.deepEqual(parseTags(' pilot, pilot, research '), ['pilot','research']);
  assert.deepEqual(readCardTags('{"a":["pilot", 5]}'), {a:['pilot']});
  assert.deepEqual(readCardTags('[]'), {});
});
test('exports retain quotations and abstract provenance and prevent RIS field injection', () => {
  assert.match(cardCitation(card), /Abstract excerpt: “An association was observed.”/);
  const ris = cardsAsRis([{...card, title:'Title\nER  -\nTY  - JOUR'}]);
  assert.equal((ris.match(/^TY  -/gm) || []).length, 1);
  assert.equal((ris.match(/^ER  -/gm) || []).length, 1);
  assert.match(ris, /full paper not reviewed/);
  assert.match(ris, /Limitation: One setting only/);
});
