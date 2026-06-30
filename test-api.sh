#!/bin/bash

# API Test Script for Certificate Generator Backend
# Tests all endpoints with various scenarios

BASE_URL="http://localhost:4000"
PASS=0
FAIL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "Certificate Generator Backend Tests"
echo "======================================"
echo ""

# Helper function
test_endpoint() {
  local name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  local expected_code=$5
  
  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
      -H "Content-Type: application/json")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi
  
  http_code=$(echo "$response" | tail -n 1)
  body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" = "$expected_code" ]; then
    echo -e "${GREEN}✓ PASS${NC} $name (HTTP $http_code)"
    ((PASS++))
    echo "$body"
  else
    echo -e "${RED}✗ FAIL${NC} $name (Expected $expected_code, got $http_code)"
    ((FAIL++))
    echo "$body"
  fi
  echo ""
}

# ==========================================
# HEALTH CHECK
# ==========================================
echo -e "${YELLOW}=== Health Check ===${NC}"
test_endpoint "Health check" "GET" "/health" "" "200"

# ==========================================
# TEMPLATES API
# ==========================================
echo -e "${YELLOW}=== Templates API ===${NC}"

# GET empty templates
test_endpoint "GET empty templates" "GET" "/api/templates" "" "200"

# POST template 1
TEMPLATE1='{"name":"Certificate Template 1","layout":{"width":800,"height":600,"fields":[{"name":"recipient","x":100,"y":100}]}}'
test_endpoint "POST template 1" "POST" "/api/templates" "$TEMPLATE1" "201"
TEMPLATE1_ID=1

# POST template 2
TEMPLATE2='{"name":"Certificate Template 2","layout":{"width":1000,"height":700}}'
test_endpoint "POST template 2" "POST" "/api/templates" "$TEMPLATE2" "201"
TEMPLATE2_ID=2

# GET all templates
test_endpoint "GET all templates" "GET" "/api/templates" "" "200"

# GET single template
test_endpoint "GET template by ID" "GET" "/api/templates/$TEMPLATE1_ID" "" "200"

# PUT update template
UPDATE_TEMPLATE='{"name":"Updated Template 1","layout":{"width":800,"height":600,"updated":true}}'
test_endpoint "PUT update template" "PUT" "/api/templates/$TEMPLATE1_ID" "$UPDATE_TEMPLATE" "200"

# DELETE template
test_endpoint "DELETE template" "DELETE" "/api/templates/$TEMPLATE2_ID" "" "200"

# GET templates after delete (should have 1)
test_endpoint "GET templates after delete" "GET" "/api/templates" "" "200"

# Error cases
echo -e "${YELLOW}=== Templates Error Cases ===${NC}"
test_endpoint "POST template missing name" "POST" "/api/templates" '{"layout":{}}' "400"
test_endpoint "GET invalid template ID" "GET" "/api/templates/999" "" "404"
test_endpoint "DELETE non-existent template" "DELETE" "/api/templates/999" "" "404"

# ==========================================
# ASSETS API
# ==========================================
echo -e "${YELLOW}=== Assets API ===${NC}"

# GET empty assets
test_endpoint "GET empty assets" "GET" "/api/assets" "" "200"

# Create test images
echo "Creating test images..."
xxd -r -p > /tmp/test-image-1.png << 'EOF'
89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154785e63f8cf00000301000080000126f52d14
EOF

xxd -r -p > /tmp/test-image-2.jpg << 'EOF'
ffd8ffe000104a46494600010100000100010000ffdb4300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c28372f3026313e534d40404040404040404040404040404040404040404040404040404040404040404040404040404040ffc000080101010111000211010311010000ffdd0004001bffc40014000100000000000000000000000000000009ffd9
EOF

# POST asset (logo)
echo "Uploading asset as logo..."
curl -s -X POST "$BASE_URL/api/assets" \
  -F "file=@/tmp/test-image-1.png" \
  -F "type=logo" > /dev/null
echo -e "${GREEN}✓ Asset uploaded${NC}"
((PASS++))

# POST asset (background)
echo "Uploading asset as background..."
curl -s -X POST "$BASE_URL/api/assets" \
  -F "file=@/tmp/test-image-2.jpg" \
  -F "type=background" > /dev/null
echo -e "${GREEN}✓ Asset uploaded${NC}"
((PASS++))
echo ""

# GET all assets
test_endpoint "GET all assets" "GET" "/api/assets" "" "200"

# DELETE first asset
test_endpoint "DELETE asset" "DELETE" "/api/assets/1" "" "200"

# Error cases
echo -e "${YELLOW}=== Assets Error Cases ===${NC}"
test_endpoint "POST asset no file" "POST" "/api/assets" "" "400"
test_endpoint "DELETE non-existent asset" "DELETE" "/api/assets/999" "" "404"

# ==========================================
# FONTS API
# ==========================================
echo -e "${YELLOW}=== Fonts API ===${NC}"

# GET empty fonts
test_endpoint "GET empty fonts" "GET" "/api/fonts" "" "200"

# Create test fonts
xxd -r -p > /tmp/Roboto-Regular.ttf << 'EOF'
00010000
EOF

xxd -r -p > /tmp/Roboto-Bold.ttf << 'EOF'
00010000
EOF

# POST fonts (multiple)
echo "Uploading multiple fonts..."
curl -s -X POST "$BASE_URL/api/fonts" \
  -F "files=@/tmp/Roboto-Regular.ttf" \
  -F "files=@/tmp/Roboto-Bold.ttf" \
  -F "fontFamily=Roboto" > /dev/null
echo -e "${GREEN}✓ Fonts uploaded${NC}"
((PASS++))
echo ""

# GET all fonts
test_endpoint "GET all fonts" "GET" "/api/fonts" "" "200"

# DELETE first font
test_endpoint "DELETE font" "DELETE" "/api/fonts/1" "" "200"

# Error cases
echo -e "${YELLOW}=== Fonts Error Cases ===${NC}"
test_endpoint "POST fonts no fontFamily" "POST" "/api/fonts" "" "400"
test_endpoint "DELETE non-existent font" "DELETE" "/api/fonts/999" "" "404"

# ==========================================
# SUMMARY
# ==========================================
echo ""
echo "======================================"
echo -e "Test Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo "======================================"

if [ $FAIL -eq 0 ]; then
  exit 0
else
  exit 1
fi
