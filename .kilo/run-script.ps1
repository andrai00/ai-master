# Kilo Agent Manager — Run Script (Windows)
# Runs when user clicks "Run" on a worktree.
# Env vars: WORKTREE_PATH, REPO_PATH

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $env:WORKTREE_PATH

# --- Self-heal: dependencies ---
if (-not (Test-Path "node_modules")) {
    Write-Host "node_modules missing, running pnpm install..."
    pnpm install
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }
}

# --- Self-heal: database ---
if (-not (Test-Path "data")) {
    New-Item -ItemType Directory -Path "data" | Out-Null
}
if (-not (Test-Path "data/ai-master.db")) {
    Write-Host "DB missing, copying from main repo..."
    Copy-Item -LiteralPath "$env:REPO_PATH\data\ai-master.db" -Destination "data\ai-master.db"
}

# --- Prisma client ---
if (-not (Test-Path "node_modules\.prisma")) {
    Write-Host "Generating Prisma client..."
    pnpm prisma generate
    if ($LASTEXITCODE -ne 0) { throw "prisma generate failed" }
}

# --- Derive unique port from worktree name ---
$name = Split-Path -Leaf $env:WORKTREE_PATH
$hash = 0
foreach ($c in $name.ToCharArray()) {
    $hash = ($hash * 31 + [int]$c) % 9973
}
$port = 3001 + ($hash % 99)

Write-Host "Starting Next.js on port $port (worktree: $name)"
pnpm next dev -p $port
