# Kilo Agent Manager — Setup Script (Windows)
# Runs ONCE when a worktree is created.
# Env vars: WORKTREE_PATH, REPO_PATH

$ErrorActionPreference = "Stop"
Write-Host "=== Setup: $env:WORKTREE_PATH ==="

Set-Location -LiteralPath $env:WORKTREE_PATH

# 1. Install dependencies via pnpm (fast — uses global content-addressable store)
Write-Host "[1/4] pnpm install..."
pnpm install
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

# 2. Copy database from main repo (each worktree gets its own copy)
Write-Host "[2/4] Copying database..."
if (-not (Test-Path "data")) {
    New-Item -ItemType Directory -Path "data" | Out-Null
}
if (-not (Test-Path "data/ai-master.db")) {
    Copy-Item -LiteralPath "$env:REPO_PATH\data\ai-master.db" -Destination "data\ai-master.db"
    Write-Host "  DB copied from main repo"
} else {
    Write-Host "  DB already exists, skipping"
}

# 3. Patch dev script to always use port 3000 in worktrees
Write-Host "[3/4] Patching dev port..."
$packageJsonPath = "$env:WORKTREE_PATH\package.json"
if (Test-Path $packageJsonPath) {
    $content = Get-Content $packageJsonPath -Raw
    $content = $content -replace '"dev": "next dev"', '"dev": "next dev -p 3000"'
    Set-Content $packageJsonPath $content -NoNewline
    Write-Host "  Port patched to 3000"
}

# 4. Generate Prisma client
Write-Host "[4/4] pnpm prisma generate..."
pnpm prisma generate
if ($LASTEXITCODE -ne 0) { throw "prisma generate failed" }

Write-Host "=== Setup complete ==="
