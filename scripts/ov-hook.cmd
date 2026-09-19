@echo off
rem OpenViking hook launcher for MiniMax Code plugin hooks.
rem Usage: ov-hook.cmd <event>   (event: session-start|user-prompt-submit|uri-guard|stop|commit|post-compact)
rem Hook children inherit only an allowlisted environment, so every
rem OPENVIKING_* default this integration needs is set here.
setlocal
set "ELECTRON_RUN_AS_NODE=1"
set "OPENVIKING_HOOK_SOURCE=mcode"
set "OPENVIKING_INTEGRATION_ID=openviking-memory"
set "OPENVIKING_INTEGRATION_VERSION=0.1.0"
set "OPENVIKING_TIMEOUT_MS=7000"
set "OV_SCRIPT=%~dp0openviking-hook.mjs"
set "OV_NODE="
if exist "%ProgramFiles%\MiniMax Code\MiniMax Code.exe" set "OV_NODE=%ProgramFiles%\MiniMax Code\MiniMax Code.exe"
if not defined OV_NODE if exist "%LocalAppData%\Programs\MiniMax Code\MiniMax Code.exe" set "OV_NODE=%LocalAppData%\Programs\MiniMax Code\MiniMax Code.exe"
if defined OV_NODE goto run
set "OV_NODE=node"
:run
"%OV_NODE%" "%OV_SCRIPT%" %*
endlocal & exit /b %errorlevel%
