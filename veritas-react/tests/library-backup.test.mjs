import assert from 'node:assert/strict';
import { test } from 'node:test';
import { libraryKeys, restoreLibrary, validateLibraryBackup } from '../src/lib/library-backup.ts';
test('restore only accepts known material keys for the current account', () => {
  const [study, cards, paper, reports, maps, tags] = libraryKeys('account-a');
  const payload = { [cards]: [], [reports]: [], [maps]: [], [tags]: {}, arbitrary: 'ignore', [libraryKeys('account-b')[1]]: [] };
  assert.deepEqual(validateLibraryBackup('account-a', payload).map(entry => entry.key), [cards,reports,maps,tags]);
  assert.throws(() => validateLibraryBackup('account-a', { [study]: { sessions:'bad' } }), /not been changed/);
  assert.throws(() => validateLibraryBackup('account-a', { [paper]: { name:'Invalid paper', pages:[] } }), /not been changed/);
  assert.throws(() => validateLibraryBackup('account-a', { [cards]: [{ url:'javascript:alert(1)' }] }));
});
test('a paper backup cannot restore unsupported quotations', () => {
  const key = libraryKeys('a')[2];
  const paper = { name:'Paper', totalPages:1, pages:[{page:1,text:'The study observed an association.'}], points:[{kind:'finding',page:1,quote:'A fabricated result.',text:'A claim'}], cards:[] };
  assert.throws(() => validateLibraryBackup('a', {[key]:paper}));
  paper.points[0].quote = 'The study observed an association.';
  assert.equal(validateLibraryBackup('a', {[key]:paper}).length, 1);
});
test('an interrupted storage restore rolls back touched keys and preserves unrelated data', () => {
  const values = new Map([['one','old-one'],['two','old-two'],['other','keep']]);
  let writes = 0;
  const storage = { getItem:key=>values.get(key)??null, removeItem:key=>values.delete(key), setItem:(key,value)=>{ if (++writes === 2) throw new Error('quota'); values.set(key,value); } };
  assert.throws(() => restoreLibrary(storage, [{key:'one',label:'One',value:'new-one'},{key:'two',label:'Two',value:'new-two'}]), /Previous values were restored/);
  assert.deepEqual([...values.entries()].sort(), [['one','old-one'],['other','keep'],['two','old-two']]);
});
