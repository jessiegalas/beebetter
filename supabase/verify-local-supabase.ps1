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

$files = Get-ChildItem -LiteralPath $PSScriptRoot -File -Filter '*.sql' |
  Where-Object { $_.Name -match '^\d{3}_.+\.sql$' } |
  Sort-Object Name

foreach ($file in $files) {
  Write-Host "Applying $($file.Name)"
  & psql $DatabaseUrl -X -v ON_ERROR_STOP=1 -f $file.FullName
  if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($file.Name)" }
}

Write-Host "Verified $($files.Count) migrations against local Supabase PostgreSQL."
