# Launch Prose (dev build) against the isolated demo profile, with CDP open on :9222
# so playwright-cli can attach.  Usage:  powershell -File demo-video\launch_demo.ps1
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$demoRoot = if ($env:DEMO_ROOT) { $env:DEMO_ROOT } else { 'C:\prose-demo' }

# electron-vite must not inherit ELECTRON_RUN_AS_NODE (see scripts/dev.js)
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

Set-Location $repo
# args after `--` are forwarded to Electron.
# The occlusion flags matter: without them Chromium stops painting whenever another window
# covers Prose, which freezes screenshots and screencast video.
npx electron-vite dev --remoteDebuggingPort 9222 -- "--user-data-dir=$demoRoot\userData" `
  "--disable-features=CalculateNativeWinOcclusion" "--disable-renderer-backgrounding" "--disable-backgrounding-occluded-windows"
