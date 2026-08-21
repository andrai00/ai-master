# Kilo Agent Manager — Run Script (Windows)
# Runs when user clicks "Run" on a worktree.
# Env vars: WORKTREE_PATH, REPO_PATH

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $env:WORKTREE_PATH

# --- Self-heal: hoisted node_modules for Turbopack ESM resolution ---
if (-not (Test-Path ".npmrc") -or -not (Select-String -LiteralPath ".npmrc" -Pattern "node-linker=hoisted")) {
    Write-Host "Creating .npmrc (hoisted node_modules)..."
    Set-Content -LiteralPath ".npmrc" -Value "node-linker=hoisted"
}

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

Write-Host "Starting Next.js on port 3015"
if (Test-Path "server.mjs") {
    # A previous `next build` leaves production artifacts in .next that
    # corrupt Turbopack dev chunks ("Failed to load chunk ... Unexpected end of input").
    if (Test-Path ".next\dev") {
        Remove-Item -LiteralPath ".next\dev" -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Custom server detected - starting Next.js + Socket.IO via node server.mjs"
    node server.mjs
} else {
    pnpm next dev -p 3015
}
