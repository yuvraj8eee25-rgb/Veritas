# School participation and moderation

Veritas is for teens (13–17) and adults. It collects a self-declared age band, not a date of birth or proof of identity. Age declarations and classroom coach roles are not independently verified. These controls do not establish legal compliance or replace school supervision. Unknown-age accounts and teens cannot enter public matchmaking. Adults must explicitly opt in. Personal private rooms require both partners to declare an adult age band. Teen live sessions use published private-debate assignments, with classroom membership checked on creation and join. A teacher should assign a private debate rather than a public live-debate assignment for teen cohorts.

Preferences are enforced in database RPCs, including candidate selection, so changing a browser control cannot bypass them. Opting out removes a waiting public queue entry. Existing debates can still be resumed; preferences do not erase transcripts or end a match already started. Adults who opted in can be matched only with other opted-in adults. Block lists remain active in both directions.

Teachers choose participants, topics, deadlines, attachments and whether students can post discussion replies. Structured peer reviews use the existing assignment discussion; peers see cohort-member aliases, while teachers can identify authors and moderate posts. This does not automatically share a learner's private submission with peers. There is no pre-publication review queue for peer posts, so teachers should close replies when supervision is unavailable.

## Report review

Assign an authorized operator to review the private queue in the Supabase dashboard. No automatic email/push alert is sent. The service-role key belongs only in trusted server/admin environments.

```sql
select id, reporter_id, debate_id, reason, detail, status, created_at
from public.debate_reports
where status in ('open','reviewing')
order by created_at;
```

Review the reported debate and evidence with the minimum necessary access. Mark a case `reviewing` when assigned; document the outcome in a restricted case system before marking it `resolved`. A report itself does not automatically penalize or remove a player. If account action is necessary, verify the facts and use an authorized Auth/admin workflow. Never fabricate a resolution or promise an operator response time that has not been staffed.

Blocking prevents future public matches with that opponent. It does not hide an existing shared debate, block assignment-room access, or substitute for an urgent school safeguarding process. Learners can view and undo their own blocks in Profile.

## Release requirements outside code

Before a broad school launch, set an operator contact, monitoring responsibility and retention policy; verify audio/text provider retention and school approval; test real teacher/student invitations and files; and run a supervised two-account debate plus microphone-denial/mobile playback checks. Account deletion requests have a separate runbook in account-data-operations.md.
