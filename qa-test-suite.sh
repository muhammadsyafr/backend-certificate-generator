#!/bin/bash

# Certificate Generator Backend - QA Test Suite
# Comprehensive test coverage for all APIs

BASE_URL="${BASE_URL:-http://localhost:4000}"
TOTAL=0
PASSED=0
FAILED=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $*"; }
log_test() { echo -e "${YELLOW}Test:${NC} $*"; ((TOTAL++)); }
log_pass() { echo -e "${GREEN}✓${NC} $*"; ((PASSED++)); }
log_fail() { echo -e "${RED}✗${NC} $*"; ((FAILED++)); }

api_call() {
  local method=$1 endpoint=$2 data=$3 expected=$4
  local response
  
  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" -H "Content-Type: application/json" 2>/dev/null)
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" -H "Content-Type: application/json" -d "$data" 2>/dev/null)
  fi
  
  local http_code=$(echo "$response" | tail -n 1)
  local body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" = "$expected" ]; then
    echo "$body"
    return 0
  else
    return 1
  fi
}

extract_id() {
  echo "$1" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*'
}

echo "======================================"
echo "Backend QA Test Suite"
echo "======================================"
echo ""

# Health Check
log_info "Health Check"
log_test "Health endpoint"
if api_call "GET" "/health" "" "200" > /dev/null; then
  log_pass "Health check"
else
  log_fail "Health check"
fi
echo ""

# Templates CRUD
log_info "Templates API - CRUD"
log_test "Create template"
response=$(api_call "POST" "/api/templates" '{"name":"QA Test","layout":{"width":800}}' "201")
if [ $? -eq 0 ]; then
  log_pass "Create template"
  TEMPLATE_ID=$(extract_id "$response")
else
  log_fail "Create template"
fi

log_test "Get all templates"
api_call "GET" "/api/templates" "" "200" > /dev/null && log_pass "Get all" || log_fail "Get all"

log_test "Get single template"
api_call "GET" "/api/templates/$TEMPLATE_ID" "" "200" > /dev/null && log_pass "Get by ID" || log_fail "Get by ID"

log_test "Update template"
api_call "PUT" "/api/templates/$TEMPLATE_ID" '{"name":"Updated"}' "200" > /dev/null && log_pass "Update" || log_fail "Update"

log_test "Delete template"
api_call "DELETE" "/api/templates/$TEMPLATE_ID" "" "200" > /dev/null && log_pass "Delete" || log_fail "Delete"

echo ""

# Templates Validation
log_info "Templates - Validation"
log_test "Reject missing name"
api_call "POST" "/api/templates" '{"layout":{}}' "400" > /dev/null 2>&1 && log_pass "Validation" || log_fail "Validation"

log_test "Return 404 for invalid ID"
api_call "GET" "/api/templates/99999" "" "404" > /dev/null 2>&1 && log_pass "Not found" || log_fail "Not found"

echo ""

# Assets Upload
log_info "Assets API - Upload"

xxd -r -p > /tmp/qa-asset.png << 'EOF'
89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154785e63f8cf00000301000080000126f52d14
EOF

log_test "Upload asset"
response=$(curl -s -X POST "$BASE_URL/api/assets" -F "file=@/tmp/qa-asset.png" -F "type=logo" 2>/dev/null)
if echo "$response" | grep -q '"id"'; then
  log_pass "Upload asset"
  ASSET_ID=$(extract_id "$response")
else
  log_fail "Upload asset"
fi

log_test "Get all assets"
api_call "GET" "/api/assets" "" "200" > /dev/null && log_pass "Get assets" || log_fail "Get assets"

log_test "Delete asset"
if [ -n "$ASSET_ID" ]; then
  api_call "DELETE" "/api/assets/$ASSET_ID" "" "200" > /dev/null && log_pass "Delete asset" || log_fail "Delete asset"
fi

echo ""

# Assets Validation
log_info "Assets - Validation"
log_test "Reject no file"
api_call "POST" "/api/assets" "" "400" > /dev/null 2>&1 && log_pass "Validation" || log_fail "Validation"

log_test "Return 404 for invalid ID"
api_call "DELETE" "/api/assets/99999" "" "404" > /dev/null 2>&1 && log_pass "Not found" || log_fail "Not found"

echo ""

# Fonts Upload
log_info "Fonts API - Upload"

xxd -r -p > /tmp/qa-font.ttf << 'EOF'
00010000
EOF

log_test "Upload font"
response=$(curl -s -X POST "$BASE_URL/api/fonts" -F "files=@/tmp/qa-font.ttf" -F "fontFamily=Test" 2>/dev/null)
if echo "$response" | grep -q '"uploaded"'; then
  log_pass "Upload font"
  FONT_ID=$(echo "$response" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
else
  log_fail "Upload font"
fi

log_test "Get all fonts"
api_call "GET" "/api/fonts" "" "200" > /dev/null && log_pass "Get fonts" || log_fail "Get fonts"

log_test "Delete font"
if [ -n "$FONT_ID" ]; then
  api_call "DELETE" "/api/fonts/$FONT_ID" "" "200" > /dev/null && log_pass "Delete font" || log_fail "Delete font"
fi

echo ""

# Fonts Validation
log_info "Fonts - Validation"
log_test "Reject no fontFamily"
api_call "POST" "/api/fonts" "" "400" > /dev/null 2>&1 && log_pass "Validation" || log_fail "Validation"

log_test "Return 404 for invalid ID"
api_call "DELETE" "/api/fonts/99999" "" "404" > /dev/null 2>&1 && log_pass "Not found" || log_fail "Not found"

echo ""

# CORS
log_info "CORS Configuration"
log_test "CORS headers present"
if curl -s -i "$BASE_URL/health" 2>/dev/null | grep -i "access-control-allow-origin" > /dev/null; then
  log_pass "CORS headers"
else
  log_fail "CORS headers"
fi

echo ""
echo "======================================"
echo "Test Results"
echo "======================================"
echo -e "Total:  $TOTAL"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo "======================================"

rm -f /tmp/qa-*.* 2>/dev/null

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed!${NC}"
  exit 1
fi
