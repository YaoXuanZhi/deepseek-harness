<#
.SYNOPSIS
  DeepSeek Harness hermetic local sandbox launcher (100% relative to current directory; zero reads from ~/.dsh or ~/.agents).
  Pure 7-bit ASCII PowerShell source so Windows PowerShell 5.1 under CP936/GBK never misparses UTF-8 without BOM.

.EXAMPLE
  .\start-sandbox.ps1 -InitOnly
  .\start-sandbox.ps1
  .\start-sandbox.ps1 -Mode web -Port 3080 -NoOpen
  .\start-sandbox.ps1 -Mode desktop
  .\start-sandbox.ps1 -Mode headless -ExtraArgs "Inspect workspace files"
#>
[CmdletBinding()]
param(
  [ValidateSet('web', 'desktop', 'tui', 'headless')]
  [string]$Mode = 'web',

  [string]$SandboxDir = '.\.dsh-sandbox',

  [string]$WorkspaceDir = '',

  [ValidateSet('read-only', 'workspace-write', 'danger-full-access')]
  [string]$PermissionMode = 'workspace-write',

  [int]$Port = 0,

  [string]$BindHost = '127.0.0.1',

  [switch]$NoOpen,

  [switch]$InitOnly,

  [switch]$KeepProcessApiKeys,

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExtraArgs = @()
)

$ErrorActionPreference = 'Stop'
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
  # Non-interactive redirected handles may not support OutputEncoding setter.
}

function Expand-Unicode([string]$Escaped) {
  return [regex]::Unescape($Escaped)
}

# 1. Resolve repository root and relative sandbox paths from caller's current directory ($PWD)
$RepoRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$CallerCwd = (Get-Location).Path
$ResolvedSandbox = if ([System.IO.Path]::IsPathRooted($SandboxDir)) {
  [System.IO.Path]::GetFullPath($SandboxDir)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $CallerCwd $SandboxDir))
}

$DshHome      = Join-Path $ResolvedSandbox 'home'
$AgentsHome   = Join-Path $ResolvedSandbox 'agents'
$AgentsSkills = Join-Path $AgentsHome 'skills'
$DefaultWs    = Join-Path $ResolvedSandbox 'workspace'
$ElectronData = Join-Path $ResolvedSandbox 'electron-data'
$TempDir      = Join-Path $ResolvedSandbox 'tmp'

$ResolvedWorkspace = if ([string]::IsNullOrWhiteSpace($WorkspaceDir)) {
  $DefaultWs
} elseif ([System.IO.Path]::IsPathRooted($WorkspaceDir)) {
  [System.IO.Path]::GetFullPath($WorkspaceDir)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $CallerCwd $WorkspaceDir))
}

foreach ($dir in @($DshHome, $AgentsHome, $AgentsSkills, $ResolvedWorkspace, $ElectronData, $TempDir)) {
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
}

# 2. Initialize local configuration templates on first run (existing files are never overwritten)
$EnvFile         = Join-Path $DshHome '.env'
$CredentialsFile = Join-Path $DshHome '.credentials.yaml'
$HomePatchFile   = Join-Path $DshHome 'cordis.patch.yml'
$AgentsMdFile    = Join-Path $AgentsHome 'AGENTS.md'
$Utf8NoBom       = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path -LiteralPath $EnvFile)) {
  $envLines = @(
    '# ============================================================================',
    (Expand-Unicode '# DeepSeek Harness \u672c\u5730\u6c99\u76d2\u73af\u5883\u53d8\u91cf\u4e0e\u6a21\u578b\u5bc6\u94a5\u914d\u7f6e\uff08\u4ec5\u5bf9\u5f53\u524d\u6c99\u76d2\u76ee\u5f55\u751f\u6548\uff09'),
    '# Path: .dsh-sandbox/home/.env',
    '# ============================================================================',
    '',
    (Expand-Unicode '# 1) DeepSeek \u5b98\u65b9\u6216\u517c\u5bb9\u7f51\u5173\u5bc6\u94a5\u4e0e\u5730\u5740\uff08\u53d6\u6d88\u6ce8\u91ca\u5e76\u586b\u5165 Key \u5373\u53ef\u751f\u6548\uff09'),
    '# DEEPSEEK_API_KEY=sk-your-deepseek-key',
    '# DEEPSEEK_BASE_URL=https://api.deepseek.com',
    '',
    (Expand-Unicode '# 2) \u81ea\u5b9a\u4e49 OpenAI \u517c\u5bb9 / Kimi / \u672c\u5730\u7f51\u5173\u5bc6\u94a5\uff08\u914d\u5408\u540c\u76ee\u5f55 cordis.patch.yml \u4f7f\u7528\uff09'),
    '# CUSTOM_LLM_API_KEY=sk-your-custom-gateway-key',
    '# OPENAI_API_KEY=sk-your-openai-key',
    '# ANTHROPIC_API_KEY=sk-ant-your-key',
    '',
    (Expand-Unicode '# 3) \u53ef\u9009\u7f51\u7edc\u4ee3\u7406\uff08\u4ec5\u5f71\u54cd\u5f53\u524d\u6c99\u76d2\u8fdb\u7a0b\uff09'),
    '# HTTPS_PROXY=http://127.0.0.1:7890',
    '# HTTP_PROXY=http://127.0.0.1:7890',
    '# NO_PROXY=127.0.0.1,localhost',
    ''
  ) -join "`n"
  [System.IO.File]::WriteAllText($EnvFile, $envLines, $Utf8NoBom)
}

if (-not (Test-Path -LiteralPath $CredentialsFile)) {
  $credLines = @(
    (Expand-Unicode '# \u672c\u5730\u6c99\u76d2\u53d7\u7ba1\u51ed\u636e\u4ed3\uff08Web/Desktop \u754c\u9762\u300c\u8bbe\u7f6e -> \u6a21\u578b\u300d\u4fdd\u5b58\u7684 API Key \u4e5f\u4f1a\u5199\u5165\u6b64\u5904\uff09'),
    'version: 1',
    'refs: {}',
    ''
  ) -join "`n"
  [System.IO.File]::WriteAllText($CredentialsFile, $credLines, $Utf8NoBom)
}

if (-not (Test-Path -LiteralPath $HomePatchFile)) {
  $patchLines = @(
    '# ============================================================================',
    (Expand-Unicode '# DeepSeek Harness \u672c\u5730\u6c99\u76d2\u6a21\u578b\u4e0e\u5168\u5c40\u8986\u76d6\u914d\u7f6e (Cordis Patch)'),
    '# Path: .dsh-sandbox/home/cordis.patch.yml',
    '#',
    (Expand-Unicode '# - \u4fdd\u6301 `[]` \u65f6\uff0c\u53ef\u76f4\u63a5\u5728 Web / Desktop \u300c\u8bbe\u7f6e -> \u6a21\u578b\u300d\u754c\u9762\u53ef\u89c6\u5316\u6dfb\u52a0\u6a21\u578b\uff08\u81ea\u52a8\u4fdd\u5b58\u5728\u672c\u6c99\u76d2\u76ee\u5f55\uff09\u3002'),
    (Expand-Unicode '# - \u82e5\u9700\u7eaf\u6587\u4ef6\u5316\u58f0\u660e OpenAI \u517c\u5bb9\u7f51\u5173\uff08Kimi / OneAPI / vLLM / Ollama\uff09\uff0c\u5220\u9664 `[]` \u5e76\u53d6\u6d88\u4e0b\u65b9\u6ce8\u91ca\uff1a'),
    '# ============================================================================',
    '[]',
    '',
    '# - id: llm-pi-ai',
    '#   config:',
    '#     providers:',
    '#       local-gateway:',
    (Expand-Unicode '#         displayName: \u672c\u5730\u6c99\u76d2\u6a21\u578b\u7f51\u5173'),
    '#         api: openai-completions',
    '#         baseURL: https://api.moonshot.cn/v1',
    '#         apiKeyEnv: CUSTOM_LLM_API_KEY',
    '#         models:',
    '#           - id: kimi-k2.5',
    '#             name: Kimi K2.5',
    '#             contextWindow: 262144',
    '#             maxTokens: 32768',
    '#',
    '# - id: agent-default-model',
    '#   config:',
    '#     provider: local-gateway',
    '#     model: kimi-k2.5',
    ''
  ) -join "`n"
  [System.IO.File]::WriteAllText($HomePatchFile, $patchLines, $Utf8NoBom)
}

if (-not (Test-Path -LiteralPath $AgentsMdFile)) {
  $agentsLines = @(
    '# Sandbox Global Instructions',
    '',
    (Expand-Unicode '\u5f53\u524d\u4f1a\u8bdd\u8fd0\u884c\u5728\u72ec\u7acb\u7684\u672c\u5730\u6c99\u76d2\u73af\u5883\u4e2d\uff0c\u6240\u6709\u6301\u4e45\u5316\u6570\u636e\u4e0e\u6280\u80fd\u5747\u9694\u79bb\u5728\u5f53\u524d\u6c99\u76d2\u76ee\u5f55\u5185\u3002'),
    ''
  ) -join "`n"
  [System.IO.File]::WriteAllText($AgentsMdFile, $agentsLines, $Utf8NoBom)
}

# 3. Discover local Node.js & pnpm when launched from a bare cmd.exe / Explorer session
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $candidateDirs = @()
  if ($env:PNPM_HOME) {
    $candidateDirs += Get-ChildItem -Path (Join-Path $env:PNPM_HOME 'nodejs\*') -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      Select-Object -ExpandProperty FullName
    $candidateDirs += Join-Path $env:PNPM_HOME 'bin'
    $candidateDirs += $env:PNPM_HOME
  }
  if ($env:LOCALAPPDATA) {
    $localPnpm = Join-Path $env:LOCALAPPDATA 'pnpm'
    $candidateDirs += Get-ChildItem -Path (Join-Path $localPnpm 'nodejs\*') -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      Select-Object -ExpandProperty FullName
    $candidateDirs += Join-Path $localPnpm 'bin'
    $candidateDirs += $localPnpm
  }
  $candidateDirs += 'C:\Program Files\nodejs'
  $existingDirs = @($candidateDirs | Where-Object { $_ -and (Test-Path -LiteralPath $_) })
  if ($existingDirs.Count -gt 0) {
    $env:PATH = ($existingDirs -join ';') + ';' + $env:PATH
  }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js executable not found in PATH (requires Node.js ^24.22.3 || >=26.13.1).'
}

# 4. Pin all DSH & XDG paths to the local sandbox and strip inherited global API keys by default
$env:DSH_HOME               = $DshHome
$env:DSH_AGENTS_HOME        = $AgentsHome
$env:DSH_PERMISSION_MODE    = $PermissionMode
$env:DSH_TELEMETRY_DISABLED = '1'
$env:TEMP                   = $TempDir
$env:TMP                    = $TempDir
$env:TMPDIR                 = $TempDir
$env:XDG_CONFIG_HOME        = Join-Path $DshHome 'config'
$env:XDG_DATA_HOME          = Join-Path $DshHome 'data'
$env:XDG_STATE_HOME         = Join-Path $DshHome 'state'
$env:XDG_CACHE_HOME         = Join-Path $DshHome 'cache'

if (-not $KeepProcessApiKeys) {
  foreach ($varName in @(
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_BASE_URL',
    'DEEPSEEK_SEARCH_BASE_URL',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'MOONSHOT_API_KEY'
  )) {
    Remove-Item -Path "Env:$varName" -ErrorAction SilentlyContinue
  }
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host (Expand-Unicode '  DeepSeek Harness - \u7eaf\u672c\u5730\u6c99\u76d2\u73af\u5883 (Local Hermetic Sandbox)') -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ((Expand-Unicode '  \u8fd0\u884c\u6a21\u5f0f (Mode)       : ') + $Mode)
Write-Host ((Expand-Unicode '  \u6c99\u76d2\u6743\u9650 (Sandbox)    : ') + $PermissionMode)
Write-Host ((Expand-Unicode '  \u672c\u5730\u914d\u7f6e\u6839 (DSH_HOME) : ') + $DshHome)
Write-Host ((Expand-Unicode '  \u5bc6\u94a5\u914d\u7f6e (.env)       : ') + $EnvFile)
Write-Host ((Expand-Unicode '  \u53d7\u7ba1\u51ed\u636e (.yaml)      : ') + $CredentialsFile)
Write-Host ((Expand-Unicode '  \u6a21\u578b\u8def\u7531\u914d\u7f6e (Patch)  : ') + $HomePatchFile)
Write-Host ((Expand-Unicode '  \u5168\u5c40\u6280\u80fd\u6839 (Agents)   : ') + $AgentsHome)
Write-Host ((Expand-Unicode '  \u53d7\u9650\u5de5\u4f5c\u533a (Workspace): ') + $ResolvedWorkspace)
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

if ($InitOnly) {
  Write-Host (Expand-Unicode '\u6c99\u76d2\u76ee\u5f55\u4e0e\u672c\u5730\u914d\u7f6e\u6a21\u677f\u521d\u59cb\u5316\u5b8c\u6210 (-InitOnly)\u3002') -ForegroundColor Green
  Write-Host ((Expand-Unicode '\u8bf7\u7f16\u8f91 ') + $EnvFile + (Expand-Unicode ' \u6216 ') + $HomePatchFile + (Expand-Unicode ' \u540e\u518d\u6b21\u8fd0\u884c\u3002')) -ForegroundColor Yellow
  exit 0
}

# 5. Launch DeepSeek Harness (prefer built CLI bin, fallback to tsx ESM source loader)
$BuiltCliBin  = Join-Path $RepoRoot 'apps\cli\lib\bin.js'
$SourceCliBin = Join-Path $RepoRoot 'apps\cli\src\bin.ts'
$TsxLoaderMjs = Join-Path $RepoRoot 'node_modules\tsx\dist\esm\index.mjs'

Push-Location -LiteralPath $ResolvedWorkspace
try {
  if ($Mode -eq 'desktop') {
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
      throw 'Desktop mode requires pnpm in PATH.'
    }
    Push-Location -LiteralPath $RepoRoot
    try {
      & pnpm --filter '@deepseek-ai/dsh-desktop' run start -- "--user-data-dir=$ElectronData" @ExtraArgs
      exit $LASTEXITCODE
    } finally {
      Pop-Location
    }
  }

  $isConfigDump = $ExtraArgs | Where-Object { $_ -in @('--dump-config', '--dump-default-config', '--dump-config-schema') }
  $cliArgs = @('--profile', $Mode)
  if ($Mode -eq 'web' -and -not $isConfigDump) {
    if ($BindHost) { $cliArgs += @('--host', $BindHost) }
    if ($Port -gt 0) { $cliArgs += @('--port', [string]$Port) }
    if ($NoOpen) { $cliArgs += '--no-open' }
  }
  if ($ExtraArgs.Count -gt 0) {
    $cliArgs += $ExtraArgs
  }

  if (Test-Path -LiteralPath $BuiltCliBin) {
    & node $BuiltCliBin @cliArgs
    exit $LASTEXITCODE
  } elseif (Test-Path -LiteralPath $TsxLoaderMjs) {
    $tsxLoaderUri = ([System.Uri]::new($TsxLoaderMjs)).AbsoluteUri
    & node --import $tsxLoaderUri $SourceCliBin @cliArgs
    exit $LASTEXITCODE
  } else {
    throw ("Neither built CLI (" + $BuiltCliBin + ") nor tsx loader (" + $TsxLoaderMjs + ") was found; run pnpm install first.")
  }
} finally {
  Pop-Location
}
