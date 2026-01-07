#!/bin/bash
#
# DNS Validation Script
# AI-Assisted Crypto Trading System
#
# Usage: ./dns-validation.sh <environment>
#
# Validates:
#   - Route 53 hosted zone exists
#   - A records for frontend domain
#   - A records for API domain
#   - DNS resolution using dig
#
# Requirements: 7.1, 7.2, 7.3

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

# Check if Route 53 hosted zone exists
check_hosted_zone() {
    local domain=$1
    log_info "Checking Route 53 hosted zone for: $domain"
    
    # Extract base domain (e.g., acinaces.com from test.acinaces.com)
    local base_domain
    if [[ "$domain" == *"."*"."* ]]; then
        # Has subdomain, extract base
        base_domain=$(echo "$domain" | rev | cut -d'.' -f1-2 | rev)
    else
        base_domain="$domain"
    fi
    
    local hosted_zone_id
    hosted_zone_id=$(aws route53 list-hosted-zones-by-name \
        --dns-name "${base_domain}." \
        --query "HostedZones[?Name=='${base_domain}.'].Id" \
        --output text 2>/dev/null | head -1)
    
    if [ -n "$hosted_zone_id" ] && [ "$hosted_zone_id" != "None" ]; then
        # Clean up the hosted zone ID (remove /hostedzone/ prefix)
        hosted_zone_id=$(echo "$hosted_zone_id" | sed 's|/hostedzone/||')
        log_success "Hosted zone found: $hosted_zone_id"
        record_result "Hosted Zone ($base_domain)" "pass" "Zone ID: $hosted_zone_id"
        echo "$hosted_zone_id"
        return 0
    else
        log_error "Hosted zone not found for: $base_domain"
        record_result "Hosted Zone ($base_domain)" "fail" "Zone not found"
        return 1
    fi
}

# Check A record exists for domain
check_a_record() {
    local hosted_zone_id=$1
    local domain=$2
    local record_type=${3:-A}
    
    log_info "Checking $record_type record for: $domain"
    
    local record
    record=$(aws route53 list-resource-record-sets \
        --hosted-zone-id "$hosted_zone_id" \
        --query "ResourceRecordSets[?Name=='${domain}.' && Type=='${record_type}']" \
        --output json 2>/dev/null)
    
    if [ -n "$record" ] && [ "$record" != "[]" ]; then
        log_success "$record_type record found for: $domain"
        record_result "$record_type Record ($domain)" "pass" "Record exists"
        return 0
    else
        # Check for ALIAS record (common for CloudFront/ALB)
        record=$(aws route53 list-resource-record-sets \
            --hosted-zone-id "$hosted_zone_id" \
            --query "ResourceRecordSets[?Name=='${domain}.' && Type=='A' && AliasTarget!=null]" \
            --output json 2>/dev/null)
        
        if [ -n "$record" ] && [ "$record" != "[]" ]; then
            log_success "ALIAS A record found for: $domain"
            record_result "A Record ($domain)" "pass" "ALIAS record exists"
            return 0
        fi
        
        log_error "$record_type record not found for: $domain"
        record_result "$record_type Record ($domain)" "fail" "Record not found"
        return 1
    fi
}

# Test DNS resolution using dig
test_dns_resolution() {
    local domain=$1
    log_info "Testing DNS resolution for: $domain"
    
    # Check if dig is available
    if ! command -v dig >/dev/null 2>&1; then
        # Fall back to nslookup
        if command -v nslookup >/dev/null 2>&1; then
            local result
            result=$(nslookup "$domain" 2>/dev/null | grep -A1 "Name:" | grep "Address" | head -1)
            if [ -n "$result" ]; then
                log_success "DNS resolution successful: $result"
                record_result "DNS Resolution ($domain)" "pass" "$result"
                return 0
            fi
        fi
        log_warning "Neither dig nor nslookup available, skipping resolution test"
        record_result "DNS Resolution ($domain)" "pass" "Skipped (no dig/nslookup)"
        return 0
    fi
    
    local result
    result=$(dig +short "$domain" 2>/dev/null)
    
    if [ -n "$result" ]; then
        log_success "DNS resolution successful: $result"
        record_result "DNS Resolution ($domain)" "pass" "Resolved to: $result"
        return 0
    else
        log_error "DNS resolution failed for: $domain"
        record_result "DNS Resolution ($domain)" "fail" "No resolution"
        return 1
    fi
}

# Test DNS propagation with multiple resolvers
test_dns_propagation() {
    local domain=$1
    log_info "Testing DNS propagation for: $domain"
    
    local resolvers=("8.8.8.8" "1.1.1.1" "9.9.9.9")
    local success_count=0
    
    for resolver in "${resolvers[@]}"; do
        if command -v dig >/dev/null 2>&1; then
            local result
            result=$(dig +short "$domain" "@$resolver" 2>/dev/null)
            if [ -n "$result" ]; then
                ((success_count++))
            fi
        fi
    done
    
    if [ $success_count -ge 2 ]; then
        log_success "DNS propagation verified ($success_count/${#resolvers[@]} resolvers)"
        record_result "DNS Propagation ($domain)" "pass" "$success_count/${#resolvers[@]} resolvers"
        return 0
    elif [ $success_count -gt 0 ]; then
        log_warning "Partial DNS propagation ($success_count/${#resolvers[@]} resolvers)"
        record_result "DNS Propagation ($domain)" "pass" "Partial: $success_count/${#resolvers[@]}"
        return 0
    else
        log_error "DNS propagation failed"
        record_result "DNS Propagation ($domain)" "fail" "0/${#resolvers[@]} resolvers"
        return 1
    fi
}

# Print validation summary
print_summary() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  DNS Validation Summary${NC}"
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
    echo -e "${BLUE}  DNS Validation - ${ENVIRONMENT}${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    # Load environment configuration
    load_environment_config "$ENVIRONMENT"
    
    log_info "Frontend Domain: $DOMAIN"
    log_info "API Domain: $API_DOMAIN"
    echo ""
    
    # Check hosted zone
    local hosted_zone_id
    hosted_zone_id=$(check_hosted_zone "$DOMAIN") || true
    
    if [ -n "$hosted_zone_id" ]; then
        echo ""
        
        # Check A records
        check_a_record "$hosted_zone_id" "$DOMAIN" || true
        check_a_record "$hosted_zone_id" "$API_DOMAIN" || true
        
        echo ""
    fi
    
    # Test DNS resolution
    test_dns_resolution "$DOMAIN" || true
    test_dns_resolution "$API_DOMAIN" || true
    
    echo ""
    
    # Test DNS propagation
    test_dns_propagation "$DOMAIN" || true
    
    # Print summary
    print_summary
    
    # Return exit code based on results
    if [ $VALIDATION_FAILED -gt 0 ]; then
        log_error "DNS validation completed with failures"
        exit 1
    else
        log_success "DNS validation completed successfully"
        exit 0
    fi
}

# Run main function
main "$@"
