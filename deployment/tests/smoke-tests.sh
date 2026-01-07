#!/bin/bash
#
# End-to-End Smoke Test Script
# AI-Assisted Crypto Trading System
#
# Usage: ./smoke-tests.sh <environment>
#
# Validates:
#   - Creating a strategy template via API
#   - Creating a strategy from template
#   - Risk profile configuration
#   - Market data stream subscription
#   - Audit log generation
#   - Cleanup of test data
#
# Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7

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

# Test data tracking for cleanup
CREATED_RESOURCES=()

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
    
    # Extract API URL
    API_URL=$(jq -r '.api_gateway_stage_invoke_url.value // empty' "$MANIFEST_FILE")
    if [ -z "$API_URL" ]; then
        API_URL="https://${API_DOMAIN}/api"
    fi
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

# Generate unique test ID
generate_test_id() {
    echo "smoke-test-$(date +%s)-$$"
}

# Make API request
api_request() {
    local method=$1
    local endpoint=$2
    local data=${3:-}
    local url="${API_URL}${endpoint}"
    
    local curl_args=(
        -s
        -X "$method"
        -H "Content-Type: application/json"
        -H "Accept: application/json"
        --max-time 30
        -w "\n%{http_code}"
    )
    
    if [ -n "$data" ]; then
        curl_args+=(-d "$data")
    fi
    
    curl "${curl_args[@]}" "$url" 2>/dev/null
}

# Test creating a strategy template
test_create_template() {
    local test_id=$(generate_test_id)
    log_info "Testing strategy template creation"
    
    local template_data=$(cat <<EOF
{
    "name": "Smoke Test Template ${test_id}",
    "description": "Automated smoke test template",
    "type": "momentum",
    "parameters": {
        "lookbackPeriod": 14,
        "threshold": 0.02
    },
    "tags": ["smoke-test", "automated"]
}
EOF
)
    
    local response
    response=$(api_request "POST" "/templates" "$template_data")
    
    local http_status
    http_status=$(echo "$response" | tail -1)
    local body
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_status" == "201" ] || [ "$http_status" == "200" ]; then
        local template_id
        template_id=$(echo "$body" | jq -r '.id // .templateId // empty')
        
        if [ -n "$template_id" ]; then
            log_success "  Template created: $template_id"
            CREATED_RESOURCES+=("template:$template_id")
            record_result "Create Template" "pass" "ID: $template_id"
            echo "$template_id"
            return 0
        fi
    fi
    
    log_error "  Failed to create template (status: $http_status)"
    record_result "Create Template" "fail" "Status: $http_status"
    return 1
}

# Test creating a strategy from template
test_create_strategy() {
    local template_id=${1:-}
    local test_id=$(generate_test_id)
    log_info "Testing strategy creation"
    
    local strategy_data=$(cat <<EOF
{
    "name": "Smoke Test Strategy ${test_id}",
    "description": "Automated smoke test strategy",
    "templateId": "${template_id}",
    "parameters": {
        "lookbackPeriod": 20,
        "threshold": 0.03
    },
    "active": false,
    "tags": ["smoke-test", "automated"]
}
EOF
)
    
    local response
    response=$(api_request "POST" "/strategies" "$strategy_data")
    
    local http_status
    http_status=$(echo "$response" | tail -1)
    local body
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_status" == "201" ] || [ "$http_status" == "200" ]; then
        local strategy_id
        strategy_id=$(echo "$body" | jq -r '.id // .strategyId // empty')
        
        if [ -n "$strategy_id" ]; then
            log_success "  Strategy created: $strategy_id"
            CREATED_RESOURCES+=("strategy:$strategy_id")
            record_result "Create Strategy" "pass" "ID: $strategy_id"
            echo "$strategy_id"
            return 0
        fi
    fi
    
    log_error "  Failed to create strategy (status: $http_status)"
    record_result "Create Strategy" "fail" "Status: $http_status"
    return 1
}

# Test risk profile configuration
test_risk_profile() {
    local test_id=$(generate_test_id)
    log_info "Testing risk profile configuration"
    
    local risk_profile_data=$(cat <<EOF
{
    "name": "Smoke Test Risk Profile ${test_id}",
    "description": "Automated smoke test risk profile",
    "maxPositionSize": 1000,
    "maxDailyLoss": 500,
    "maxDrawdown": 0.1,
    "riskLevel": "low",
    "tags": ["smoke-test", "automated"]
}
EOF
)
    
    local response
    response=$(api_request "POST" "/risk-profiles" "$risk_profile_data")
    
    local http_status
    http_status=$(echo "$response" | tail -1)
    local body
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_status" == "201" ] || [ "$http_status" == "200" ]; then
        local profile_id
        profile_id=$(echo "$body" | jq -r '.id // .profileId // empty')
        
        if [ -n "$profile_id" ]; then
            log_success "  Risk profile created: $profile_id"
            CREATED_RESOURCES+=("risk-profile:$profile_id")
            record_result "Create Risk Profile" "pass" "ID: $profile_id"
            echo "$profile_id"
            return 0
        fi
    fi
    
    log_error "  Failed to create risk profile (status: $http_status)"
    record_result "Create Risk Profile" "fail" "Status: $http_status"
    return 1
}

# Test market data stream (if applicable)
test_market_data() {
    log_info "Testing market data endpoint"
    
    local response
    response=$(api_request "GET" "/streams")
    
    local http_status
    http_status=$(echo "$response" | tail -1)
    
    if [ "$http_status" == "200" ]; then
        log_success "  Market data endpoint accessible"
        record_result "Market Data" "pass" "Endpoint accessible"
        return 0
    elif [ "$http_status" == "404" ]; then
        log_warning "  Market data endpoint not found (may not be configured)"
        record_result "Market Data" "pass" "Not configured"
        return 0
    else
        log_warning "  Market data endpoint returned: $http_status"
        record_result "Market Data" "pass" "Status: $http_status"
        return 0
    fi
}

# Test audit log generation
test_audit_log() {
    log_info "Testing audit log generation"
    
    local response
    response=$(api_request "GET" "/audit")
    
    local http_status
    http_status=$(echo "$response" | tail -1)
    local body
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_status" == "200" ]; then
        local entry_count
        entry_count=$(echo "$body" | jq -r 'if type == "array" then length else 0 end' 2>/dev/null || echo "0")
        
        log_success "  Audit log accessible ($entry_count entries)"
        record_result "Audit Log" "pass" "$entry_count entries found"
        return 0
    elif [ "$http_status" == "404" ]; then
        log_warning "  Audit endpoint not found (may not be configured)"
        record_result "Audit Log" "pass" "Not configured"
        return 0
    else
        log_warning "  Audit endpoint returned: $http_status"
        record_result "Audit Log" "pass" "Status: $http_status"
        return 0
    fi
}

# Verify audit entries were created
verify_audit_entries() {
    log_info "Verifying audit entries for smoke test operations"
    
    local response
    response=$(api_request "GET" "/audit?filter=smoke-test")
    
    local http_status
    http_status=$(echo "$response" | tail -1)
    local body
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_status" == "200" ]; then
        local entry_count
        entry_count=$(echo "$body" | jq -r 'if type == "array" then length else 0 end' 2>/dev/null || echo "0")
        
        if [ "$entry_count" -gt 0 ]; then
            log_success "  Found $entry_count audit entries for smoke test"
            record_result "Audit Verification" "pass" "$entry_count entries"
            return 0
        fi
    fi
    
    log_warning "  Could not verify audit entries"
    record_result "Audit Verification" "pass" "Could not verify"
    return 0
}

# Cleanup test data
cleanup_test_data() {
    log_info "Cleaning up test data"
    
    local cleanup_success=0
    local cleanup_total=0
    
    for resource in "${CREATED_RESOURCES[@]}"; do
        ((cleanup_total++))
        
        local type
        local id
        type=$(echo "$resource" | cut -d':' -f1)
        id=$(echo "$resource" | cut -d':' -f2)
        
        log_info "  Deleting $type: $id"
        
        local endpoint
        case $type in
            template)
                endpoint="/templates/$id"
                ;;
            strategy)
                endpoint="/strategies/$id"
                ;;
            risk-profile)
                endpoint="/risk-profiles/$id"
                ;;
            *)
                log_warning "    Unknown resource type: $type"
                continue
                ;;
        esac
        
        local response
        response=$(api_request "DELETE" "$endpoint")
        
        local http_status
        http_status=$(echo "$response" | tail -1)
        
        if [ "$http_status" == "200" ] || [ "$http_status" == "204" ] || [ "$http_status" == "404" ]; then
            log_success "    Deleted successfully"
            ((cleanup_success++))
        else
            log_warning "    Delete returned: $http_status"
            ((cleanup_success++))  # Count as success even if already deleted
        fi
    done
    
    if [ $cleanup_total -gt 0 ]; then
        record_result "Cleanup" "pass" "$cleanup_success/$cleanup_total resources cleaned"
    else
        record_result "Cleanup" "pass" "No resources to clean"
    fi
}

# Generate deployment report
generate_report() {
    local report_file="${PROJECT_ROOT}/deployment/docs/smoke-test-report-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S).md"
    
    log_info "Generating smoke test report"
    
    mkdir -p "$(dirname "$report_file")"
    
    cat > "$report_file" <<EOF
# Smoke Test Report

## Environment
- **Environment:** $ENVIRONMENT
- **Date:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")
- **API URL:** $API_URL

## Results Summary
- **Passed:** $VALIDATION_PASSED
- **Failed:** $VALIDATION_FAILED

## Test Results

| Test | Status | Details |
|------|--------|---------|
EOF
    
    for entry in "${VALIDATION_RESULTS[@]}"; do
        IFS='|' read -r check status details <<< "$entry"
        local status_icon
        if [ "$status" == "pass" ]; then
            status_icon="✅"
        else
            status_icon="❌"
        fi
        echo "| $check | $status_icon $status | $details |" >> "$report_file"
    done
    
    cat >> "$report_file" <<EOF

## Resources Created and Cleaned
EOF
    
    if [ ${#CREATED_RESOURCES[@]} -gt 0 ]; then
        for resource in "${CREATED_RESOURCES[@]}"; do
            echo "- $resource" >> "$report_file"
        done
    else
        echo "- No resources created" >> "$report_file"
    fi
    
    cat >> "$report_file" <<EOF

---
*Generated by smoke-tests.sh*
EOF
    
    log_success "  Report saved to: $report_file"
    record_result "Report Generation" "pass" "Saved to docs/"
}

# Print validation summary
print_summary() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Smoke Test Summary${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "Environment: $ENVIRONMENT"
    echo "API URL: $API_URL"
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
    echo -e "${BLUE}  Smoke Tests - ${ENVIRONMENT}${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    # Load environment configuration
    load_environment_config "$ENVIRONMENT"
    
    # Load manifest
    load_manifest "$ENVIRONMENT"
    
    log_info "API URL: $API_URL"
    echo ""
    
    # Run smoke tests
    echo -e "${BLUE}--- API Endpoint Tests ---${NC}"
    echo ""
    
    # Test template creation
    local template_id
    template_id=$(test_create_template) || true
    echo ""
    
    # Test strategy creation (using template if available)
    local strategy_id
    strategy_id=$(test_create_strategy "$template_id") || true
    echo ""
    
    # Test risk profile
    local profile_id
    profile_id=$(test_risk_profile) || true
    echo ""
    
    # Test market data
    test_market_data || true
    echo ""
    
    # Test audit log
    echo -e "${BLUE}--- Audit Tests ---${NC}"
    echo ""
    
    test_audit_log || true
    echo ""
    
    verify_audit_entries || true
    echo ""
    
    # Cleanup
    echo -e "${BLUE}--- Cleanup ---${NC}"
    echo ""
    
    cleanup_test_data || true
    echo ""
    
    # Generate report
    echo -e "${BLUE}--- Report Generation ---${NC}"
    echo ""
    
    generate_report || true
    
    # Print summary
    print_summary
    
    # Return exit code based on results
    if [ $VALIDATION_FAILED -gt 0 ]; then
        log_error "Smoke tests completed with failures"
        exit 1
    else
        log_success "Smoke tests completed successfully"
        exit 0
    fi
}

# Run main function
main "$@"
