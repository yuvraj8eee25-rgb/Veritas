# Account data operations

Account export and deletion requests are available in Profile. Migration 0020 adds owner-scoped export RPCs and a private operator queue. A request does not delete an account. There is no automatic email notification or promised processing deadline. Assign an operator and monitor the queue before inviting a wider audience.

## Queue review

Use the Supabase dashboard SQL editor with an authorized operator account. Never expose the service-role key in a browser. The pending queue is:

```sql
select owner_id, requested_at, updated_at
from public.account_deletion_requests
where status = 'pending'
order by requested_at;
```

Verify account ownership through the existing authenticated request and any support identity checks appropriate to the deployment. Record the case in a restricted support system. A learner can cancel a pending request; check status again immediately before processing.

## Before deletion

Offer the account record export and separate downloads of binary files. The browser export is paginated, bounded to 10,000 records per collection and approximately 20 MB, and explicitly marks incomplete collections. Use a scoped operator-assisted export if those bounds are reached. Do not give the learner another person's unrelated records. Shared debate records contain contributions from other participants; disclose this in any export review.

Inventory Supabase Auth, profile/progress, library backups, match queue, debates/private rooms, recordings and storage objects, classroom/organization ownership, assignments, grading, submissions, questions and audit history. Review external provider retention separately; do not claim removal from provider systems without evidence.

Transfer shared classroom/organization ownership or apply the agreed school retention policy before deleting records. Existing foreign-key cascades can remove shared work; classroom audit actors can prevent Auth deletion. Do not blindly cascade around these protections. Determine which shared records must be retained, anonymized or removed and document the decision. Storage files require explicit removal; deleting a database row is not proof that its blob is gone. Device storage must be removed on each device by the learner.

## Completion

Perform the reviewed deletion using an authorized server/admin workflow. Recheck ownership, storage removal, row-level access and session revocation. Record completion only after the checks pass. If the Auth user has been removed, its request row cascades away, so keep the minimal case record outside that row in a restricted system with its own retention policy. If the account still exists, operators may update status and operator_note; these fields cannot be edited by the learner and notes are excluded from exports.

Do not mark a queued request completed merely because it was viewed. A production support contact, response target and jurisdiction/school retention policy still require an operator decision.

## Verification

`app/tests/integration/account-data.sql` tests all collection branches, profile scoping, unknown collection rejection, confirmation, retry idempotency, cancellation, operator-note restrictions, raw-write denial and cross-account isolation within BEGIN/ROLLBACK. It does not exercise a destructive account deletion.
