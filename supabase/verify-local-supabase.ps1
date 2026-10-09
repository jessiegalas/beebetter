param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl
)

$uri = [Uri]$DatabaseUrl
if ($uri.Host -notin @('localhost', '127.0.0.1', '::1')) {
  throw 'Refusing to run migrations against a non-local database host.'
}
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  throw 'psql is required. Install PostgreSQL client tools first.'
}

$migrationDirectory = Join-Path $PSScriptRoot 'migrations'
$files = @(Get-ChildItem -LiteralPath $migrationDirectory -File -Filter '*.sql' |
  Where-Object { $_.Name -match '^\d{3}_.+\.sql$' } |
  Sort-Object Name)
if ($files.Count -eq 0) { throw 'No numbered migrations found; refusing to report success.' }

foreach ($file in $files) {
  Write-Host "Applying $($file.Name)"
  & psql $DatabaseUrl -X -v ON_ERROR_STOP=1 -f $file.FullName
  if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($file.Name)" }
}

Write-Host "Applied $($files.Count) migrations against local Supabase PostgreSQL."
$assertions = Join-Path $PSScriptRoot 'tests/quest-notifications.sql'
& psql $DatabaseUrl -X -v ON_ERROR_STOP=1 -f $assertions
if ($LASTEXITCODE -ne 0) { throw 'Quest notification database assertions failed.' }

foreach ($suite in @('student-registration.sql','registration-hardening.sql')) {
  & psql $DatabaseUrl -X -v ON_ERROR_STOP=1 -f (Join-Path $PSScriptRoot ('tests/' + $suite))
  if ($LASTEXITCODE -ne 0) { throw "Registration assertions failed: $suite" }
}

& (Join-Path $PSScriptRoot 'verify-notification-concurrency.ps1') -DatabaseUrl $DatabaseUrl
if ($LASTEXITCODE -ne 0) { throw 'Notification concurrency checks failed.' }
& (Join-Path $PSScriptRoot 'verify-registration-concurrency.ps1') -DatabaseUrl $DatabaseUrl
