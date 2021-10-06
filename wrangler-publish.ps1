
$M = Get-ChildItem -Path .\wrangler.toml | Select-String -Pattern '\[env\.(?<env>\w+)\]';

for ($i = 0; $i -lt $M.Matches.Length; $i++) {
  $env = $M.Matches[$i].Groups['env'].Value;
  Write-Verbose -Message "Publishing to environment [$env]..." 
  wrangler publish -e $env
}
