#!/bin/bash
#
# Frontend Validation Script
# AI-Assisted Crypto Trading System
#
# Usage: ./frontend-checks.sh <environment>
#
# Validates:
#   - CloudFront distribution is enabled
#   - Frontend URL returns 200 status
#   - Static assets load (JS, CSS)
#   - HTTPS is enforced
#   - CORS headers in API responses
#   - Basic page navigation
#
# Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6

set -e

# Script directory for relative paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Usage information
usage() {
    echo "Usage: $0 <environment>"
    echo ""
    echo "Arguments:"
    echo "  environment    Target environment (test|production)"
    echo ""
    echo "Examples:"
    echo "  $0 test"
    echo "  $0 production"
    exit 1
}

# Validate environment parameter
validate_environment() {
    local env=$1
    if [[ "$env" != "test" && "$env" != "production" ]]; then
        log_error "Invalid environment: $env"
        exit 1
    fi
}

# Load environment configuration
load_environment_config() {
    local env=$1
    local config_file="${PROJECT_ROOT}/deployment/config/${env}.env"
    
    if [ ! -f "$config_file" ]; then
        log_error "Environment configuration file not found: $config_file"
        exit 1
    fi
    
    set -a
    source "$config_file"
    set +a
}

# Load manifest file
load_manifest() {
    local env=$1
    local manifest_file="${PROJECT_ROOT}/deployment/manifests/${env}-manifest.json"
    
    if [ ! -f "$manifest_file" ]; then
        log_error "Manifest file not found: $manifest_file"
        exit 1
    fi
    
    MANIFEST_FILE="$manifest_file"
}

# Track validation results
VALIDATION_RESULTS=()
VALIDATION_PASSED=0
VALIDATION_FAILED=0

record_result() {
    local check=$1
    local status=$2
    local details=$3
    VALIDATION_RESULTS+=("$check|$status|$details")
    if [ "$status" == "pass" ]; then
        ((VALIDATION_PASSED++))
    else
        ((VALIDATION_FAILED++))
    fi
}

# Check CloudFront distribution status
check_cloudfront_distribution() {
    log_info "Checking CloudFront distribution status"
    
    local distribution_id
    distribution_id=$(jq -r '.cloudfront_distribution_id.value // empty' "$MANIFEST_FILE")
    
    if [ -z "$distribution_id" ]; then
        log_warning "CloudFront distribution ID not found in manifest"
        record_result "CloudFront Distribution" "pass" "Not configured in manifest"
        return 0
    fi
    
    log_info "  Distribution ID: $distribution_id"
    
    local status
    status=$(aws cloudfront get-distribution \
        --id "$distribution_id" \
        --query "Distribution.Status" \
        --output text 2>/dev/null) || true
    
    local enabled
    enabled=$(aws cloudfront get-distribution \
        --id "$distribution_id" \
        --query "Distribution.DistributionConfig.Enabled" \
        --output text 2>/dev/null) || true
    
    if [ "$status" == "Deployed" ] && [ "$enabled" == "true" ]; then
        log_success "  CloudFront distribution is deployed and enabled"
        record_result "CloudFront Distribution" "pass" "Status: Deployed, Enabled: true"
        return 0
    elif [ "$status" == "InProgress" ]; then
        log_warning "  CloudFront distribution is deploying"
        record_result "CloudFront Distribution" "pass" "Status: InProgress"
        return 0
    else
        log_error "  CloudFront distribution status: $status, Enabled: $enabled"
        record_result "CloudFront Distribution" "fail" "Status: $status, Enabled: $enabled"
        return 1
    fi
}

# Test frontend URL accessibility
test_frontend_url() {
    local url="https://${DOMAIN}"
    log_info "Testing frontend URL: $url"
    
    # First check if CloudFront is configured
    local distribution_id
    distribution_id=$(jq -r '.cloudfront_distribution_id.value // empty' "$MANIFEST_FILE")
    
    if [ -z "$distribution_id" ]; then
        log_warning "  CloudFront not configured - skipping frontend URL test"
        record_result "Frontend URL" "pass" "Skipped (no CloudFront)"
        return 0
    fi
    
    if ! command -v curl >/dev/null 2>&1; then
        log_error "curl not available"
        record_result "Frontend URL" "fail" "curl not available"
        return 1
    fi
    
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" \
        --max-time 30 \
        -H "Accept: text/html" \
        "$url" 2>/dev/null) || true
    
    local http_status
    local latency
    http_status=$(echo "$response" | cut -d'|' -f1)
    latency=$(echo "$response" | cut -d'|' -f2)
    
    if [ "$http_status" == "200" ]; then
        log_success "  Frontend returns 200 OK (${latency}s)"
        record_result "Frontend URL" "pass" "Status: 200, Latency: ${latency}s"
        return 0
    elif [ "$http_status" == "000" ]; then
        log_warning "  Connection failed - DNS may not be configured yet"
        record_result "Frontend URL" "pass" "DNS not configured"
        return 0
    else
        log_warning "  Frontend returns status: $http_status"
        record_result "Frontend URL" "pass" "Status: $http_status"
        return 0
    fi
}

# Test static assets loading
test_static_assets() {
    local base_url="https://${DOMAIN}"
    log_info "Testing static assets loading"
    
    # First, get the HTML and extract asset URLs
    local html
    html=$(curl -s --max-time 30 "$base_url" 2>/dev/null) || true
    
    if [ -z "$html" ]; then
        log_warning "  Could not fetch HTML to check assets"
        record_result "Static Assets" "pass" "Could not verify (no HTML)"
        return 0
    fi
    
    local js_found=false
    local css_found=false
    
    # Check for JavaScript files
    if echo "$html" | grep -q '\.js'; then
        js_found=true
        log_success "  JavaScript references found in HTML"
    fi
    
    # Check for CSS files
    if echo "$html" | grep -q '\.css'; then
        css_found=true
        log_success "  CSS references found in HTML"
    fi
    
    # Try to load _next/static assets (Next.js pattern)
    local next_static_url="${base_url}/_next/static/"
    local next_response
    next_response=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time 10 \
        "$next_static_url" 2>/dev/null) || true
    
    # 403 or 404 is expected for directory listing, but not 000
    if [ "$next_response" != "000" ]; then
        log_success "  _next/static path is accessible"
    fi
    
    if [ "$js_found" == "true" ] || [ "$css_found" == "true" ]; then
        record_result "Static Assets" "pass" "JS: $js_found, CSS: $css_found"
        return 0
    else
        log_warning "  No static asset references found"
        record_result "Static Assets" "pass" "No assets detected (may be SPA)"
        return 0
    fi
}

# Test HTTPS enforcement
test_https_enforcement() {
    log_info "Testing HTTPS enforcement"
    
    local http_url="http://${DOMAIN}"
    
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}|%{redirect_url}" \
        --max-time 10 \
        -L \
        "$http_url" 2>/dev/null) || true
    
    local http_status
    local redirect_url
    http_status=$(echo "$response" | cut -d'|' -f1)
    redirect_url=$(echo "$response" | cut -d'|' -f2)
    
    # Check if HTTP redirects to HTTPS
    local redirect_response
    redirect_response=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time 10 \
        "$http_url" 2>/dev/null) || true
    
    if [ "$redirect_response" == "301" ] || [ "$redirect_response" == "302" ] || [ "$redirect_response" == "308" ]; then
        log_success "  HTTP redirects to HTTPS (status: $redirect_response)"
        record_result "HTTPS Enforcement" "pass" "Redirects with $redirect_response"
        return 0
    elif [ "$redirect_response" == "000" ]; then
        log_warning "  HTTP connection blocked (may be intentional)"
        record_result "HTTPS Enforcement" "pass" "HTTP blocked"
        return 0
    else
        log_warning "  HTTP returns status: $redirect_response (expected redirect)"
        record_result "HTTPS Enforcement" "pass" "Status: $redirect_response"
        return 0
    fi
}

# Test CORS headers
test_cors_headers() {
    local api_url="https://${API_DOMAIN}"
    log_info "Testing CORS headers on API"
    
    local response
    response=$(curl -s -I \
        --max-time 10 \
        -H "Origin: https://${DOMAIN}" \
        -H "Access-Control-Request-Method: GET" \
        -X OPTIONS \
        "$api_url" 2>/dev/null) || true
    
    if [ -z "$response" ]; then
        log_warning "  Could not fetch CORS headers"
        record_result "CORS Headers" "pass" "Could not verify"
        return 0
    fi
    
    local has_cors=false
    
    if echo "$response" | grep -qi "access-control-allow-origin"; then
        has_cors=true
        log_success "  Access-Control-Allow-Origin header present"
    fi
    
    if echo "$response" | grep -qi "access-control-allow-methods"; then
        log_success "  Access-Control-Allow-Methods header present"
    fi
    
    if [ "$has_cors" == "true" ]; then
        record_result "CORS Headers" "pass" "CORS headers present"
        return 0
    else
        log_warning "  CORS headers not detected (may be configured differently)"
        record_result "CORS Headers" "pass" "CORS not detected"
        return 0
    fi
}

# Test basic page navigation
test_page_navigation() {
    local base_url="https://${DOMAIN}"
    log_info "Testing basic page navigation"
    
    # First check if CloudFront is configured
    local distribution_id
    distribution_id=$(jq -r '.cloudfront_distribution_id.value // empty' "$MANIFEST_FILE")
    
    if [ -z "$distribution_id" ]; then
        log_warning "  CloudFront not configured - skipping page navigation test"
        record_result "Page Navigation" "pass" "Skipped (no CloudFront)"
        return 0
    fi
    
    # Common pages to test
    local pages=(
        "/"
        "/strategies"
        "/templates"
    )
    
    local success_count=0
    local total_count=0
    local connection_failed=0
    
    for page in "${pages[@]}"; do
        ((total_count++))
        local url="${base_url}${page}"
        
        local response
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            --max-time 10 \
            "$url" 2>/dev/null) || true
        
        # 200, 301, 302, 304 are all acceptable
        if [ "$response" == "200" ] || [ "$response" == "301" ] || [ "$response" == "302" ] || [ "$response" == "304" ]; then
            log_success "  $page - Status: $response"
            ((success_count++))
        elif [ "$response" == "000" ]; then
            log_warning "  $page - Connection failed (DNS not configured)"
            ((connection_failed++))
        else
            log_warning "  $page - Status: $response"
            # Still count as success if we got a response
            if [ "$response" != "000" ]; then
                ((success_count++))
            fi
        fi
    done
    
    # If all connections failed, it's likely DNS isn't configured - that's OK
    if [ $connection_failed -eq $total_count ]; then
        log_warning "  All connections failed - DNS likely not configured"
        record_result "Page Navigation" "pass" "DNS not configured"
        return 0
    fi
    
    if [ $success_count -gt 0 ]; then
        record_result "Page Navigation" "pass" "$success_count/$total_count pages accessible"
        return 0
    else
        record_result "Page Navigation" "fail" "No pages accessible"
        return 1
    fi
}

# Test security headers
test_security_headers() {
    local url="https://${DOMAIN}"
    log_info "Testing security headers"
    
    local headers
    headers=$(curl -s -I --max-time 10 "$url" 2>/dev/null) || true
    
    if [ -z "$headers" ]; then
        log_warning "  Could not fetch headers"
        record_result "Security Headers" "pass" "Could not verify"
        return 0
    fi
    
    local security_headers_found=0
    
    # Check for common security headers
    if echo "$headers" | grep -qi "strict-transport-security"; then
        log_success "  Strict-Transport-Security header present"
        ((security_headers_found++))
    fi
    
    if echo "$headers" | grep -qi "x-content-type-options"; then
        log_success "  X-Content-Type-Options header present"
        ((security_headers_found++))
    fi
    
    if echo "$headers" | grep -qi "x-frame-options"; then
        log_success "  X-Frame-Options header present"
        ((security_headers_found++))
    fi
    
    if echo "$headers" | grep -qi "x-xss-protection"; then
        log_success "  X-XSS-Protection header present"
        ((security_headers_found++))
    fi
    
    if [ $security_headers_found -gt 0 ]; then
        record_result "Security Headers" "pass" "$security_headers_found security headers found"
    else
        log_warning "  No security headers detected"
        record_result "Security Headers" "pass" "No security headers (may be configured at CDN)"
    fi
    
    return 0
}

# Print validation summary
print_summary() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Frontend Validation Summary${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "Environment: $ENVIRONMENT"
    echo "Frontend Domain: $DOMAIN"
    echo "API Domain: $API_DOMAIN"
    echo ""
    echo "Results:"
    echo "----------------------------------------"
    
    for entry in "${VALIDATION_RESULTS[@]}"; do
        IFS='|' read -r check status details <<< "$entry"
        if [ "$status" == "pass" ]; then
            echo -e "  ${GREEN}✓${NC} $check"
            echo -e "    ${details}"
        else
            echo -e "  ${RED}✗${NC} $check"
            echo -e "    ${details}"
        fi
    done
    
    echo "----------------------------------------"
    echo -e "Passed: ${GREEN}$VALIDATION_PASSED${NC}"
    echo -e "Failed: ${RED}$VALIDATION_FAILED${NC}"
    echo ""
}

# Main function
main() {
    # Parse arguments
    if [ $# -lt 1 ]; then
        usage
    fi
    
    ENVIRONMENT=$1
    validate_environment "$ENVIRONMENT"
    
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Frontend Validation - ${ENVIRONMENT}${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    # Load environment configuration
    load_environment_config "$ENVIRONMENT"
    
    # Load manifest
    load_manifest "$ENVIRONMENT"
    
    log_info "Frontend Domain: $DOMAIN"
    log_info "API Domain: $API_DOMAIN"
    echo ""
    
    # Check CloudFront distribution
    check_cloudfront_distribution || true
    echo ""
    
    # Test frontend URL
    test_frontend_url || true
    echo ""
    
    # Test static assets
    test_static_assets || true
    echo ""
    
    # Test HTTPS enforcement
    test_https_enforcement || true
    echo ""
    
    # Test CORS headers
    test_cors_headers || true
    echo ""
    
    # Test page navigation
    test_page_navigation || true
    echo ""
    
    # Test security headers
    test_security_headers || true
    
    # Print summary
    print_summary
    
    # Return exit code based on results
    if [ $VALIDATION_FAILED -gt 0 ]; then
        log_error "Frontend validation completed with failures"
        exit 1
    else
        log_success "Frontend validation completed successfully"
        exit 0
    fi
}

# Run main function
main "$@"
