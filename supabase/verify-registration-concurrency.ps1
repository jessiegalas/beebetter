param([Parameter(Mandatory=$true)][string]$DatabaseUrl)
$ErrorActionPreference = 'Stop'
if ([Uri]::new($DatabaseUrl).Host -notin @('localhost','127.0.0.1','::1')) {
  throw 'Registration concurrency requires an explicitly authorized disposable loopback database.'
}
$client = (Get-Command psql -ErrorAction Stop).Source
function Invoke-Sql([string]$Statement) {
  $result = & $client $DatabaseUrl -X -Atq -v ON_ERROR_STOP=1 -c $Statement
  if ($LASTEXITCODE -ne 0) { throw 'Registration concurrency SQL failed.' }
  return $result
}
function Invoke-Pair([string]$First,[string]$Second,[string]$ExpectedFirst,[string]$ExpectedSecond) {
  $job = Start-Job -ScriptBlock {
    param($exe,$url,$sql)
    & $exe $url -X -Atq -v ON_ERROR_STOP=1 -c $sql
    if ($LASTEXITCODE -ne 0) { throw 'First registration transaction failed.' }
  } -ArgumentList $client,$DatabaseUrl,("begin; set local statement_timeout='10s'; set local application_name='beebetter-registration-concurrency'; " + $First + " select pg_sleep(3); commit;")
  try {
    $barrier = $false
    for ($attempt=0; $attempt -lt 100; $attempt++) {
      if ((Invoke-Sql "select exists(select 1 from pg_stat_activity where application_name='beebetter-registration-concurrency' and wait_event='PgSleep');") -eq 't') {
        $barrier = $true; break
      }
      Start-Sleep -Milliseconds 100
    }
    if (-not $barrier) { throw 'Registration transaction did not reach its lock barrier.' }
    $secondResult = Invoke-Sql ("begin; set local statement_timeout='10s'; " + $Second + " commit;")
    if (-not (Wait-Job $job -Timeout 15)) { throw 'Registration concurrency deadline exceeded.' }
    $firstResult = Receive-Job $job -ErrorAction Stop
    if ($job.State -ne 'Completed' -or $firstResult -notcontains $ExpectedFirst -or $secondResult -notcontains $ExpectedSecond) {
      throw 'Unexpected concurrent registration outcome.'
    }
  } finally { Stop-Job $job; Remove-Job $job }
}
$previous = [string](Invoke-Sql "select id from public.academic_semesters where status='active';")
$previousId = [Guid]::Empty
if ($previous -and -not [Guid]::TryParse($previous,[ref]$previousId)) { throw 'Invalid previous semester identity.' }
$studentOne = '03500000-0000-4000-8000-000000000001'
$studentTwo = '03500000-0000-4000-8000-000000000002'
$admin = '03500000-0000-4000-8000-000000000003'
$period = '03500000-0000-4000-8000-000000000100'
$option = '03500000-0000-4000-8000-000000000101'
$draft = '03500000-0000-4000-8000-000000000200'
$draftOption = '03500000-0000-4000-8000-000000000201'
$setup = @'
begin;
do $guard$
begin
  if exists(select 1 from auth.users where id in (
    '03500000-0000-4000-8000-000000000001','03500000-0000-4000-8000-000000000002','03500000-0000-4000-8000-000000000003'))
    or exists(select 1 from public.academic_semesters where id in (
    '03500000-0000-4000-8000-000000000100','03500000-0000-4000-8000-000000000200')) then
    raise exception 'Fixture identities already exist; refusing to overwrite';
  end if;
end;
$guard$;
update public.academic_semesters set status='archived',archived_at=now() where status='active';
insert into public.academic_semesters(id,academic_year,term,status,activated_at) values
 ('03500000-0000-4000-8000-000000000100','2035-2036','Concurrency active','active',now()),
 ('03500000-0000-4000-8000-000000000200','2036-2037','Concurrency draft','draft',null);
insert into public.student_enrollment_options(id,semester_id,course,year_level,campus,section) values
 ('03500000-0000-4000-8000-000000000101','03500000-0000-4000-8000-000000000100','BSCS','4th Year','Cavite State University Bacoor City Campus','1'),
 ('03500000-0000-4000-8000-000000000201','03500000-0000-4000-8000-000000000200','BSCS','4th Year','Cavite State University Bacoor City Campus','1');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('03500000-0000-4000-8000-000000000001','concurrency-one@example.invalid',now(),'{"signup_intent":"student_registration"}'),
 ('03500000-0000-4000-8000-000000000002','concurrency-two@example.invalid',now(),'{"signup_intent":"student_registration"}'),
 ('03500000-0000-4000-8000-000000000003','concurrency-admin@example.invalid',now(),'{"signup_intent":"admin_access_request"}');
insert into public.admin_users(id,role,is_active) values('03500000-0000-4000-8000-000000000003','admin',true);
commit;
'@
$prepared = $false
try {
  Invoke-Sql $setup | Out-Null
  $prepared = $true
  $studentRole = "set local role authenticated; select set_config('request.jwt.claim.sub','$studentOne',true);"
  $otherRole = "set local role authenticated; select set_config('request.jwt.claim.sub','$studentTwo',true);"
  $adminRole = "set local role authenticated; select set_config('request.jwt.claim.sub','$admin',true);"
  $completeOne = "select public.student_complete_registration('Concurrent Student','935000001','Build habits','$period','$option')->>'status';"
  $completeTwo = "select public.student_complete_registration('Other Student','935000002','Build habits','$period','$option')->>'status';"

  # Registration holds parent/option locks. Removal must see the committed association.
  Invoke-Pair ($studentRole + $completeOne) ($adminRole + "select public.admin_remove_semester_section('$option');") 'completed' 'archived'
  if ((Invoke-Sql "select count(*)=1 from public.student_enrollment_history where student_id='$studentOne';") -ne 't') {
    throw 'Registration/removal did not preserve exactly one history record.'
  }

  # Archival wins. Registration must recheck parent status after waiting.
  Invoke-Sql "update public.student_enrollment_options set is_active=true where id='$option';" | Out-Null
  Invoke-Pair ($adminRole + "select (public.admin_archive_semester('$period')).status;") ($otherRole + "select public.student_complete_registration('Other Student','935000002','Build habits','$period','$option')->>'code';") 'archived' 'enrollment_changed'
  if ((Invoke-Sql "select not exists(select 1 from public.students where id='$studentTwo');") -ne 't') {
    throw 'Rejected registration left a partial student.'
  }

  # Removing the last draft section wins. Activation cannot validate stale sections.
  $activationDenied = @'
do $check$
begin
  begin
    perform public.admin_activate_semester('DRAFT_ID');
  exception when others then
    if position('at least one active section' in sqlerrm)>0 then return; end if;
    raise;
  end;
  raise exception 'Activation unexpectedly succeeded';
end;
$check$;
select 'activation_denied';
'@
  Invoke-Pair ($adminRole + "select public.admin_remove_semester_section('$draftOption');") ($adminRole + $activationDenied.Replace('DRAFT_ID',$draft)) 'deleted' 'activation_denied'

  # Registration against the old period wins; activation retains its historical enrollment.
  Invoke-Sql "update public.academic_semesters set status='active',activated_at=now(),archived_at=null where id='$period'; insert into public.student_enrollment_options(id,semester_id,course,year_level,campus,section) values('$draftOption','$draft','BSCS','4th Year','Cavite State University Bacoor City Campus','1');" | Out-Null
  Invoke-Pair ($otherRole + $completeTwo) ($adminRole + "select (public.admin_activate_semester('$draft')).status;") 'completed' 'active'
  if ((Invoke-Sql "select (select count(*)=2 and bool_and(semester_id='$period') from public.students where id in ('$studentOne','$studentTwo')) and (select count(*)=2 from public.student_enrollment_history where student_id in ('$studentOne','$studentTwo'));") -ne 't') {
    throw 'Semester activation changed or duplicated enrollment facts.'
  }
  Write-Host 'Registration concurrency passed: removal, archival, empty activation, and rollover.'
} finally {
  if ($prepared) {
    $restore = if ($previous) { "update public.academic_semesters set status='active',archived_at=null where id='$previousId';" } else { '' }
    Invoke-Sql ("begin; delete from auth.users where id in ('$studentOne','$studentTwo','$admin'); delete from public.student_enrollment_options where id in ('$option','$draftOption'); delete from public.academic_semesters where id in ('$period','$draft'); " + $restore + " commit;") | Out-Null
  }
}
