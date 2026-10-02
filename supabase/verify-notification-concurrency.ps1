param([Parameter(Mandatory=$true)][string]$DatabaseUrl)
$ErrorActionPreference = 'Stop'
if ([Uri]::new($DatabaseUrl).Host -notin @('localhost','127.0.0.1','::1')) { throw 'Concurrency fixtures require a disposable loopback database.' }
$psqlPath = (Get-Command psql -ErrorAction Stop).Source
$fixture = Join-Path $PSScriptRoot 'tests/quest-notifications-concurrency.sql'
& $psqlPath $DatabaseUrl -X -q -v ON_ERROR_STOP=1 -f $fixture
if ($LASTEXITCODE -ne 0) { throw 'Concurrency fixture setup failed.' }
$first = $null
try {
  $claim = "select 'claimed=' || count(*) from public.claim_quest_push_deliveries(array['44444444-4444-4444-8444-444444444444']::uuid[]);"
  $first = Start-Job -ScriptBlock {
    param($client,$url,$sql)
    & $client $url -X -Atq -v ON_ERROR_STOP=1 -c $sql
    if ($LASTEXITCODE -ne 0) { throw 'First claim transaction failed.' }
  } -ArgumentList $psqlPath,$DatabaseUrl,("begin; set local role service_role; " + $claim + " select pg_sleep(3); commit;")
  # Job startup varies by OS; wait until the first connection actually holds its leases.
  $locked = $false
  for ($attempt = 0; $attempt -lt 50; $attempt++) {
    $state = & $psqlPath $DatabaseUrl -X -Atq -c "select exists(select 1 from pg_stat_activity where query like '%select pg_sleep(3)%' and wait_event='PgSleep');"
    if ($state -eq 't') { $locked = $true; break }
    Start-Sleep -Milliseconds 100
  }
  if (-not $locked) { throw 'First claim transaction did not reach its lock barrier.' }
  $second = & $psqlPath $DatabaseUrl -X -Atq -v ON_ERROR_STOP=1 -c ("set role service_role; " + $claim)
  if ($LASTEXITCODE -ne 0) { throw 'Second claim transaction failed.' }
  if (-not (Wait-Job $first -Timeout 15)) { throw 'Concurrent claim exceeded its deadline.' }
  $firstOutput = Receive-Job $first -ErrorAction Stop
  if ($first.State -ne 'Completed' -or $firstOutput -notcontains 'claimed=2' -or $second -notcontains 'claimed=0') {
    throw "Claims overlapped or fixture was not claimed: first=$firstOutput second=$second"
  }
  $result = & $psqlPath $DatabaseUrl -X -Atq -v ON_ERROR_STOP=1 -c "select count(*)=2 and bool_and(attempts=1 and claim_id is not null) from public.quest_push_deliveries where token='ExpoPushToken[concurrent]';"
  if ($LASTEXITCODE -ne 0 -or $result -ne 't') { throw 'Concurrent claims did not retain exactly one attempt per event.' }
  Write-Host 'Concurrent service claims passed: two leased events, no overlap.'
} finally {
  if ($first) { Stop-Job $first; Remove-Job $first }
  & $psqlPath $DatabaseUrl -X -q -v ON_ERROR_STOP=1 -c "delete from auth.users where id='44444444-4444-4444-8444-444444444444';"
  if ($LASTEXITCODE -ne 0) { throw 'Disposable concurrency fixture cleanup failed.' }
}
