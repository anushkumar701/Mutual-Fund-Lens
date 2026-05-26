#!/bin/bash

# ╔══════════════════════════════════════════════════════════════╗
# ║          MF Lens — Automated Netlify Deploy Script          ║
# ╚══════════════════════════════════════════════════════════════╝

set -e  # Exit immediately on any error

# ── Colors ────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Helpers ───────────────────────────────────────────────────
info()    { echo -e "${CYAN}${BOLD}[INFO]${RESET}  $1"; }
success() { echo -e "${GREEN}${BOLD}[OK]${RESET}    $1"; }
warn()    { echo -e "${YELLOW}${BOLD}[WARN]${RESET}  $1"; }
error()   { echo -e "${RED}${BOLD}[ERROR]${RESET} $1"; exit 1; }

echo ""
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${CYAN}       MF Lens — Netlify Deploy Automation       ${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ── Step 1: Check if Netlify CLI is available ─────────────────
info "Checking Netlify CLI..."
if ! command -v netlify &> /dev/null; then
  warn "Netlify CLI not found globally. Using local project binary..."
  NETLIFY="npx netlify"
else
  NETLIFY="netlify"
fi
success "Netlify CLI ready."

# ── Step 2: Check login status ────────────────────────────────
info "Checking Netlify login status..."
if ! $NETLIFY status &> /dev/null; then
  echo ""
  warn "You are NOT logged in to Netlify."
  echo -e "${YELLOW}Launching browser login for the target account...${RESET}"
  $NETLIFY logout 2>/dev/null || true
  $NETLIFY login
  success "Logged in successfully!"
else
  CURRENT_USER=$($NETLIFY api getCurrentUser 2>/dev/null | grep -o '"email":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown")
  echo ""
  echo -e "  Currently logged in as: ${BOLD}${GREEN}${CURRENT_USER}${RESET}"
  echo ""
  read -r -p "$(echo -e "  ${YELLOW}Is this the correct Netlify account? [y/N]: ${RESET}")" CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    info "Logging out and switching accounts..."
    $NETLIFY logout 2>/dev/null || true
    $NETLIFY login
    success "Switched account successfully!"
  fi
fi

echo ""

# ── Step 3: Clean previous build ──────────────────────────────
info "Cleaning old build artifacts..."
rm -rf dist
success "dist/ directory cleaned."

# ── Step 4: Install dependencies ─────────────────────────────
info "Installing dependencies..."
npm install --legacy-peer-deps --silent
success "Dependencies installed."

# ── Step 5: Build the project ─────────────────────────────────
info "Building MF Lens with Vite..."
npm run build
success "Build completed → dist/"

# ── Step 6: Site selection ────────────────────────────────────
echo ""
echo -e "${BOLD}Choose deployment target:${RESET}"
echo -e "  ${CYAN}[1]${RESET} Create a NEW Netlify site"
echo -e "  ${CYAN}[2]${RESET} Deploy to an EXISTING site"
echo ""
read -r -p "$(echo -e "  ${YELLOW}Enter choice [1/2]: ${RESET}")" CHOICE

if [[ "$CHOICE" == "1" ]]; then
  # ── New site ───────────────────────────────────────────────
  info "Creating a new Netlify site and deploying..."
  $NETLIFY deploy --dir=dist --prod --open
  success "🎉 New site deployed successfully!"

elif [[ "$CHOICE" == "2" ]]; then
  # ── Existing site ──────────────────────────────────────────
  echo ""
  info "Fetching your sites from Netlify..."
  echo ""
  $NETLIFY sites:list 2>/dev/null || warn "Could not list sites automatically."
  echo ""
  read -r -p "$(echo -e "  ${YELLOW}Enter the Site ID or custom domain (from the list above): ${RESET}")" SITE_ID
  if [[ -z "$SITE_ID" ]]; then
    error "No site ID entered. Aborting."
  fi
  info "Deploying to site: ${SITE_ID}..."
  $NETLIFY deploy --dir=dist --prod --site="$SITE_ID" --open
  success "🎉 Deployed to existing site successfully!"

else
  error "Invalid choice. Please run the script again and enter 1 or 2."
fi

echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}${BOLD}   ✅  MF Lens is LIVE on Netlify!              ${RESET}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
