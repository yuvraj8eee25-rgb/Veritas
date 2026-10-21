-- Reject invalid rubric scores at the database write boundary. This covers both
-- grade_classroom_submission_idempotent and the legacy classroom_command RPC.
begin;

create or replace function public.cw_assert_valid_rubric_scores(
  p_assignment_id uuid,
  p_score numeric,
  p_scores jsonb
) returns void
language plpgsql security definer set search_path=public,extensions as $$
declare
  rubric_value jsonb;
  rubric_item jsonb;
  category_name text;
  category_score numeric;
  score_total numeric:=0;
begin
  if p_score is null or jsonb_typeof(p_scores) is distinct from 'object' then
    raise exception 'Invalid score or rubric scores';
  end if;

  select rubric into rubric_value
  from public.classroom_assignments
  where id=p_assignment_id;
  if not found or jsonb_typeof(rubric_value) is distinct from 'array' then
    raise exception 'Assignment rubric is unavailable';
  end if;

  for rubric_item in select value from jsonb_array_elements(rubric_value) loop
    category_name:=rubric_item->>'name';
    if category_name is null
       or jsonb_typeof(p_scores->category_name) is distinct from 'number' then
      raise exception 'Complete every rubric category with a numeric score';
    end if;
    category_score:=(p_scores->>category_name)::numeric;
    if category_score<0 or category_score>(rubric_item->>'max')::numeric then
      raise exception 'Rubric score is outside its allowed range';
    end if;
    score_total:=score_total+category_score;
  end loop;

  if score_total<>p_score then
    raise exception 'Score must equal rubric total';
  end if;
end;
$$;

create or replace function public.cw_validate_grade_draft_row()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare
  assignment_value uuid;
begin
  select assignment_id into assignment_value
  from public.classroom_submissions where id=new.submission_id;
  perform public.cw_assert_valid_rubric_scores(
    assignment_value,
    (new.data->>'score')::numeric,
    new.data->'rubric_scores'
  );
  return new;
end;
$$;

create or replace function public.cw_validate_submission_grade_row()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
begin
  if new.score is not null or new.graded_at is not null then
    perform public.cw_assert_valid_rubric_scores(
      new.assignment_id,new.score,new.rubric_scores
    );
  end if;
  return new;
end;
$$;

drop trigger if exists classroom_grade_drafts_validate_scores on public.classroom_grade_drafts;
create trigger classroom_grade_drafts_validate_scores
before insert or update of data on public.classroom_grade_drafts
for each row execute function public.cw_validate_grade_draft_row();

drop trigger if exists classroom_submissions_validate_scores on public.classroom_submissions;
create trigger classroom_submissions_validate_scores
before insert or update of score,graded_at,rubric_scores on public.classroom_submissions
for each row execute function public.cw_validate_submission_grade_row();

revoke all on function public.cw_assert_valid_rubric_scores(uuid,numeric,jsonb) from public,anon,authenticated;
revoke all on function public.cw_validate_grade_draft_row() from public,anon,authenticated;
revoke all on function public.cw_validate_submission_grade_row() from public,anon,authenticated;

commit;
notify pgrst, 'reload schema';
