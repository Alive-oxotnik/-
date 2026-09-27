# Copy every skill from .\skills into your personal Claude Code skills folder
# (%USERPROFILE%\.claude\skills), so they work in all your projects.
#   powershell -ExecutionPolicy Bypass -File install.ps1          add missing skills
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Force   also overwrite existing ones
param([switch]$Force)
$ErrorActionPreference = 'Stop'

$src = Join-Path $PSScriptRoot 'skills'
$dest = if ($env:CLAUDE_SKILLS_DIR) { $env:CLAUDE_SKILLS_DIR } else { Join-Path $HOME '.claude\skills' }
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Get-ChildItem -Path $src -Directory | ForEach-Object {
  $target = Join-Path $dest $_.Name
  if ((Test-Path $target) -and -not $Force) {
    Write-Host "skip   $($_.Name) (already exists - run with -Force to overwrite)"
    return
  }
  if (Test-Path $target) { Remove-Item -Recurse -Force $target }
  Copy-Item -Recurse -Path $_.FullName -Destination $target
  Write-Host "added  $($_.Name)"
}
Write-Host "Done: $dest. Start a new Claude Code session to use the skills."
