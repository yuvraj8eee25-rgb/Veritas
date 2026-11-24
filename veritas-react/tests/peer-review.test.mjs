import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeDiscussionRequest, discussionRequestId, peerReviewText } from '../src/lib/peer-review.ts';
test('review scaffolds retain each specific feedback section and fit the discussion limit', () => {
  assert.throws(() => peerReviewText({claim:'x'}));
  const text = peerReviewText({claim:'Shared classroom claim',strength:'A clear line of reasoning',evidence:'The evidence establishes an association, not a cause',question:'Could a third factor explain the result?',revision:'Qualify the causal wording in the final sentence'});
  assert.match(text, /A constructive question or objection/);
  assert.match(text, /Qualify the causal wording/);
  assert.ok(text.length < 4000);
});
test('failed posts retain their request IDs independently of other drafts and accounts', () => {
  const values = new Map(); const storage = {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  let next = 0; const id = () => `id-${++next}`;
  const a = discussionRequestId(storage,'u','assignment','First post',id);
  const b = discussionRequestId(storage,'u','assignment','Second post',id);
  assert.equal(discussionRequestId(storage,'u','assignment','First post',id).id,a.id);
  completeDiscussionRequest(storage,a.key,a.id);
  assert.equal(discussionRequestId(storage,'u','assignment','Second post',id).id,b.id);
  assert.notEqual(discussionRequestId(storage,'other','assignment','Second post',id).id,b.id);
});
