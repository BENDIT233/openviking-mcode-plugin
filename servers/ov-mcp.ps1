# OpenViking MCP stdio relay for MiniMax Code (Windows).
#
# The MiniMax Plugin MCP reader requires a PATH-resolved `command` with no path
# separator and non-absolute `args`, so `cmd /c ...` cannot be declared (the
# `/c` flag is rejected as an absolute stdio argument). MiniMax Code also ships
# no standalone node.exe on PATH.
#
# This relay therefore starts the plugin's Node-ESM MCP proxy through the
# MiniMax Code Electron binary in ELECTRON_RUN_AS_NODE mode and lets the child
# inherit our stdin/stdout/stderr handles directly (no PowerShell pipeline), so
# the JSON-RPC stream passes through untouched.

$ErrorActionPreference = 'Stop'

$env:ELECTRON_RUN_AS_NODE = '1'
$env:OPENVIKING_INTEGRATION_ID = 'openviking-memory'
$env:OPENVIKING_INTEGRATION_VERSION = '0.1.1'

$runtimeCandidates = @(
  (Join-Path $env:ProgramFiles 'MiniMax Code\MiniMax Code.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\MiniMax Code\MiniMax Code.exe')
)
$runtime = $runtimeCandidates |
  Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
  Select-Object -First 1
if (-not $runtime) { $runtime = 'node' }

$proxy = Join-Path $PSScriptRoot 'mcp-proxy.mjs'

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $runtime
$psi.Arguments = '"' + $proxy + '"'
$psi.UseShellExecute = $false

$child = New-Object System.Diagnostics.Process
$child.StartInfo = $psi
$null = $child.Start()
$child.WaitForExit()

exit $child.ExitCode
