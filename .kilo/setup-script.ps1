# Kilo Agent Manager — Setup Script (Windows)
# Runs ONCE when a worktree is created.
# Env vars: WORKTREE_PATH, REPO_PATH

$ErrorActionPreference = "Stop"
Write-Host "=== Setup: $env:WORKTREE_PATH ==="

Set-Location -LiteralPath $env:WORKTREE_PATH

# 1. Install dependencies via pnpm (fast — uses global content-addressable store)
Write-Host "[1/3] pnpm install..."
pnpm install
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

# 2. Copy database from main repo (each worktree gets its own copy)
Write-Host "[2/3] Copying database..."
if (-not (Test-Path "data")) {
    New-Item -ItemType Directory -Path "data" | Out-Null
}
if (-not (Test-Path "data/ai-master.db")) {
    Copy-Item -LiteralPath "$env:REPO_PATH\data\ai-master.db" -Destination "data\ai-master.db"
    Write-Host "  DB copied from main repo"
} else {
    Write-Host "  DB already exists, skipping"
}

# 3. Generate Prisma client
Write-Host "[3/3] pnpm prisma generate..."
pnpm prisma generate
if ($LASTEXITCODE -ne 0) { throw "prisma generate failed" }

Write-Host "=== Setup complete ==="
