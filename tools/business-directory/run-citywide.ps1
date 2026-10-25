param([ValidateSet('Build','QA','Verify','Publish','Live')][string]$Mode='Build')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if($taskRoot -ne "H:\ChatGPT\Peterborough-Map-Game-Sherbrooke"){throw 'Unexpected task workspace'}
Set-Location -LiteralPath $taskRoot
$taskNode="C:\Users\Danny's Ultimate PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$taskPython="C:\Users\Danny's Ultimate PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$env:NODE_PATH="C:\Users\Danny's Ultimate PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules"
$env:BROWSER_EXECUTABLE='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$env:CITY_QA_PROFILE=''
$env:EXPECTED_BUILD='1.6.128'
$env:PYTHONIOENCODING='utf-8'
function Check-TaskExit {if($LASTEXITCODE -ne 0){throw "Task command failed with exit $LASTEXITCODE"}}
switch($Mode){
 Build {& $taskPython tools/business-directory/combine-sources.py;Check-TaskExit; & $taskPython tools/business-directory/enrich-frontages.py;Check-TaskExit; & $taskNode tools/build-business-directory.mjs --input 'H:\ChatGPT\Peterborough-Building-References-20261024\business-signs\businesses-enriched.json';Check-TaskExit; & $taskNode scripts/normalize-release.cjs;Check-TaskExit}
 QA {& $taskNode tools/check-business-signs.cjs http://127.0.0.1:8870 release-1.6.128 --require-parity;Check-TaskExit}
 Verify {
  & $taskPython tools/business-directory/record-verification.py;Check-TaskExit
  $taskWorkflow=Get-Content -LiteralPath '.github/workflows/deploy-pages.yml' -Raw
  $taskTests=[regex]::Matches($taskWorkflow,'(?:tests|tools)/[\w.-]+\.(?:cjs|mjs)') | ForEach-Object Value | Sort-Object -Unique
  $taskTests+=@('tools/landmark-geometry.test.mjs','tools/editor-overrides.test.mjs','tools/building-archetypes.test.mjs') | Where-Object {Test-Path -LiteralPath $_}
  $taskTests=$taskTests | Sort-Object -Unique
  & $taskNode --test @taskTests *> 'test-artifacts/business-signs/production-tests.log';$taskResult=$LASTEXITCODE
  Get-Content -LiteralPath 'test-artifacts/business-signs/production-tests.log' -Tail 10
  if($taskResult -ne 0){throw 'Production checks failed'}
  & $taskNode --check city-explorer/app.js;Check-TaskExit
  git -c safe.directory=$taskRoot diff --check;Check-TaskExit
 }
 Publish {
  $taskCoverage=Get-Content -LiteralPath 'city-explorer/data/business-directory.json' -Raw | ConvertFrom-Json
  if(-not $taskCoverage.coverage.runtimeVerified){throw 'Runtime coverage has not been verified'}
  git -c safe.directory=$taskRoot fetch origin main;Check-TaskExit
  git -c safe.directory=$taskRoot merge-base --is-ancestor origin/main HEAD;Check-TaskExit
  git -c safe.directory=$taskRoot add -u;Check-TaskExit
  git -c safe.directory=$taskRoot add -- city-explorer/business-sign-layout.js city-explorer/business-signs.js city-explorer/data/business-current-overrides.json city-explorer/data/business-directory.coverage.json city-explorer/data/business-directory.json city-explorer/data/business-entrances.json docs/business-signs-coverage.md docs/superpowers/plans/2026-10-24-citywide-business-signs.md tests/business-building-match.test.mjs tests/business-sign-layout.test.mjs tests/business-sign-renderer.test.mjs tools/build-business-directory.mjs tools/business-building-match.mjs tools/business-directory tools/check-business-signs.cjs;Check-TaskExit
  git -c safe.directory=$taskRoot diff --cached --check;Check-TaskExit
  git -c safe.directory=$taskRoot commit -m 'Add source-traceable citywide business wall signs';Check-TaskExit
  git -c safe.directory=$taskRoot push origin HEAD:main;Check-TaskExit
  git -c safe.directory=$taskRoot rev-parse HEAD
 }
 Live {& $taskNode tools/business-directory/verify-live.mjs;Check-TaskExit; & $taskNode tools/check-business-signs.cjs https://edmondsonedits.github.io/Peterborough-Map-Game live-1.6.128 --require-parity;Check-TaskExit}
}
