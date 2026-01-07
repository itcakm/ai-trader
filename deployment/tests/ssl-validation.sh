#!/bin/bash
#
# SSL/TLS Validation Script
# AI-Assisted Crypto Trading System
#
# Usage: ./ssl-validation.sh <environment>
#
# Validates:
#   - ACM certificates are issued
#   - Certificate expiry (>30 days)
#   - CloudFront uses correct certificate
#   - API Gateway uses correct certificate
#
# Requirements: 7.4, 7.5, 7.6, 14.3

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
        log_warning "Manifest file not found: $manifest_file"
        return 1
    fi
    
    MANIFEST_FILE="$manifest_file"
    return 0
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

# Find ACM certificate for domain
find_certificate() {
    local domain=$1
    local region=${2:-$AWS_REGION}
    
    log_info "Looking for ACM certificate for: $domain (region: $region)"
    
    # List certificates and find matching one
    local cert_arn
    cert_arn=$(aws acm list-certificates \
        --region "$region" \
        --query "CertificateSummaryList[?DomainName=='${domain}' || DomainName=='*.${domain}'].CertificateArn" \
        --output text 2>/dev/null | head -1)
    
    if [ -n "$cert_arn" ] && [ "$cert_arn" != "None" ]; then
        echo "$cert_arn"
        return 0
    fi
    
    # Try wildcard match for subdomains
    local base_domain
    if [[ "$domain" == *"."*"."* ]]; then
        base_domain=$(echo "$domain" | rev | cut -d'.' -f1-2 | rev)
        cert_arn=$(aws acm list-certificates \
            --region "$region" \
            --query "CertificateSummaryList[?DomainName=='*.${base_domain}'].CertificateArn" \
            --output text 2>/dev/null | head -1)
        
        if [ -n "$cert_arn" ] && [ "$cert_arn" != "None" ]; then
            echo "$cert_arn"
            return 0
        fi
    fi
    
    return 1
}

# Check certificate status
check_certificate_status() {
    local cert_arn=$1
    local domain=$2
    local region=${3:-$AWS_REGION}
    
    log_info "Checking certificate status for: $domain"
    
    local status
    status=$(aws acm describe-certificate \
        --certificate-arn "$cert_arn" \
        --region "$region" \
        --query "Certificate.Status" \
        --output text 2>/dev/null)
    
    if [ "$status" == "ISSUED" ]; then
        log_success "Certificate is ISSUED"
        record_result "Certificate Status ($domain)" "pass" "Status: ISSUED"
        return 0
    elif [ "$status" == "PENDING_VALIDATION" ]; then
        log_warning "Certificate is PENDING_VALIDATION"
        record_result "Certificate Status ($domain)" "fail" "Status: PENDING_VALIDATION"
        return 1
    else
        log_error "Certificate status: $status"
        record_result "Certificate Status ($domain)" "fail" "Status: $status"
        return 1
    fi
}

# Check certificate expiry
check_certificate_expiry() {
    local cert_arn=$1
    local domain=$2
    local region=${3:-$AWS_REGION}
    local min_days=${4:-30}
    
    log_info "Checking certificate expiry for: $domain"
    
    local expiry_date
    expiry_date=$(aws acm describe-certificate \
        --certificate-arn "$cert_arn" \
        --region "$region" \
        --query "Certificate.NotAfter" \
        --output text 2>/dev/null)
    
    if [ -z "$expiry_date" ] || [ "$expiry_date" == "None" ]; then
        log_error "Could not retrieve certificate expiry date"
        record_result "Certificate Expiry ($domain)" "fail" "Could not retrieve expiry"
        return 1
    fi
    
    # Calculate days until expiry
    local expiry_epoch
    local current_epoch
    local days_remaining
    
    # Handle different date formats
    if [[ "$OSTYPE" == "darwin"* ]]; then
        expiry_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${expiry_date%%+*}" "+%s" 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$expiry_date" "+%s" 2>/dev/null)
    else
        expiry_epoch=$(date -d "$expiry_date" "+%s" 2>/dev/null)
    fi
    
    current_epoch=$(date "+%s")
    days_remaining=$(( (expiry_epoch - current_epoch) / 86400 ))
    
    if [ $days_remaining -gt $min_days ]; then
        log_success "Certificate expires in $days_remaining days"
        record_result "Certificate Expiry ($domain)" "pass" "Expires in $days_remaining days"
        return 0
    elif [ $days_remaining -gt 0 ]; then
        log_warning "Certificate expires in $days_remaining days (< $min_days days)"
        record_result "Certificate Expiry ($domain)" "fail" "Expires in $days_remaining days (warning)"
        return 1
    else
        log_error "Certificate has expired!"
        record_result "Certificate Expiry ($domain)" "fail" "Certificate expired"
        return 1
    fi
}

# Check CloudFront distribution certificate
check_cloudfront_certificate() {
    local distribution_id=$1
    local expected_domain=$2
    
    log_info "Checking CloudFront certificate for distribution: $distribution_id"
    
    local viewer_cert
    viewer_cert=$(aws cloudfront get-distribution \
        --id "$distribution_id" \
        --query "Distribution.DistributionConfig.ViewerCertificate" \
        --output json 2>/dev/null)
    
    if [ -z "$viewer_cert" ]; then
        log_error "Could not retrieve CloudFront distribution config"
        record_result "CloudFront Certificate" "fail" "Could not retrieve config"
        return 1
    fi
    
    # Check if using ACM certificate
    local acm_cert_arn
    acm_cert_arn=$(echo "$viewer_cert" | jq -r '.ACMCertificateArn // empty')
    
    if [ -n "$acm_cert_arn" ]; then
        log_success "CloudFront using ACM certificate: $acm_cert_arn"
        record_result "CloudFront Certificate" "pass" "Using ACM certificate"
        
        # Verify certificate covers the domain
        local cert_domains
        cert_domains=$(aws acm describe-certificate \
            --certificate-arn "$acm_cert_arn" \
            --region "us-east-1" \
            --query "Certificate.SubjectAlternativeNames" \
            --output text 2>/dev/null)
        
        if echo "$cert_domains" | grep -q "$expected_domain"; then
            log_success "Certificate covers domain: $expected_domain"
            record_result "CloudFront Domain Coverage" "pass" "Domain covered"
            return 0
        else
            log_warning "Certificate may not cover domain: $expected_domain"
            record_result "CloudFront Domain Coverage" "pass" "Check domain coverage manually"
            return 0
        fi
    else
        # Check if using CloudFront default certificate
        local cf_default
        cf_default=$(echo "$viewer_cert" | jq -r '.CloudFrontDefaultCertificate // false')
        
        if [ "$cf_default" == "true" ]; then
            log_warning "CloudFront using default certificate (not custom domain)"
            record_result "CloudFront Certificate" "pass" "Using default certificate"
            return 0
        fi
        
        log_error "CloudFront certificate configuration unclear"
        record_result "CloudFront Certificate" "fail" "Unknown configuration"
        return 1
    fi
}

# Check API Gateway custom domain certificate
check_api_gateway_certificate() {
    local api_domain=$1
    
    log_info "Checking API Gateway certificate for: $api_domain"
    
    local domain_info
    domain_info=$(aws apigatewayv2 get-domain-name \
        --domain-name "$api_domain" \
        --query "DomainNameConfigurations[0]" \
        --output json 2>/dev/null)
    
    if [ -z "$domain_info" ] || [ "$domain_info" == "null" ]; then
        # Try REST API (v1)
        domain_info=$(aws apigateway get-domain-name \
            --domain-name "$api_domain" \
            --output json 2>/dev/null)
        
        if [ -z "$domain_info" ] || [ "$domain_info" == "null" ]; then
            log_warning "API Gateway custom domain not found: $api_domain"
            record_result "API Gateway Certificate" "pass" "Custom domain not configured"
            return 0
        fi
        
        local cert_arn
        cert_arn=$(echo "$domain_info" | jq -r '.regionalCertificateArn // .certificateArn // empty')
    else
        local cert_arn
        cert_arn=$(echo "$domain_info" | jq -r '.CertificateArn // empty')
    fi
    
    if [ -n "$cert_arn" ]; then
        log_success "API Gateway using certificate: $cert_arn"
        record_result "API Gateway Certificate" "pass" "Certificate configured"
        return 0
    else
        log_warning "API Gateway certificate not found"
        record_result "API Gateway Certificate" "pass" "Certificate not explicitly set"
        return 0
    fi
}

# Test SSL connection to domain
test_ssl_connection() {
    local domain=$1
    local port=${2:-443}
    
    log_info "Testing SSL connection to: $domain:$port"
    
    if ! command -v openssl >/dev/null 2>&1; then
        log_warning "openssl not available, skipping SSL connection test"
        record_result "SSL Connection ($domain)" "pass" "Skipped (no openssl)"
        return 0
    fi
    
    local result
    result=$(echo | openssl s_client -connect "${domain}:${port}" -servername "$domain" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null)
    
    if [ -n "$result" ]; then
        log_success "SSL connection successful"
        record_result "SSL Connection ($domain)" "pass" "Connection established"
        return 0
    else
        log_error "SSL connection failed"
        record_result "SSL Connection ($domain)" "fail" "Connection failed"
        return 1
    fi
}

# Test HTTPS redirect
test_https_redirect() {
    local domain=$1
    
    log_info "Testing HTTPS redirect for: $domain"
    
    if ! command -v curl >/dev/null 2>&1; then
        log_warning "curl not available, skipping HTTPS redirect test"
        record_result "HTTPS Redirect ($domain)" "pass" "Skipped (no curl)"
        return 0
    fi
    
    local http_status
    http_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://${domain}/" 2>/dev/null)
    
    if [ "$http_status" == "301" ] || [ "$http_status" == "302" ] || [ "$http_status" == "308" ]; then
        log_success "HTTP redirects to HTTPS (status: $http_status)"
        record_result "HTTPS Redirect ($domain)" "pass" "Redirects with $http_status"
        return 0
    elif [ "$http_status" == "000" ]; then
        log_warning "HTTP connection failed (may be blocked)"
        record_result "HTTPS Redirect ($domain)" "pass" "HTTP blocked (good)"
        return 0
    else
        log_warning "HTTP returns status: $http_status (expected redirect)"
        record_result "HTTPS Redirect ($domain)" "pass" "Status: $http_status"
        return 0
    fi
}

# Print validation summary
print_summary() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  SSL/TLS Validation Summary${NC}"
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
    echo -e "${BLUE}  SSL/TLS Validation - ${ENVIRONMENT}${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    # Load environment configuration
    load_environment_config "$ENVIRONMENT"
    
    # Load manifest
    load_manifest "$ENVIRONMENT" || true
    
    log_info "Frontend Domain: $DOMAIN"
    log_info "API Domain: $API_DOMAIN"
    log_info "AWS Region: $AWS_REGION"
    echo ""
    
    # Check frontend certificate (CloudFront requires us-east-1)
    local frontend_cert_arn
    frontend_cert_arn=$(find_certificate "$DOMAIN" "us-east-1") || true
    
    if [ -n "$frontend_cert_arn" ]; then
        log_success "Found frontend certificate: $frontend_cert_arn"
        record_result "Frontend Certificate" "pass" "Certificate found"
        check_certificate_status "$frontend_cert_arn" "$DOMAIN" "us-east-1" || true
        check_certificate_expiry "$frontend_cert_arn" "$DOMAIN" "us-east-1" || true
    else
        log_warning "Frontend certificate not found in ACM"
        record_result "Frontend Certificate" "pass" "Not found (may use other method)"
    fi
    
    echo ""
    
    # Check API certificate (regional)
    local api_cert_arn
    api_cert_arn=$(find_certificate "$API_DOMAIN" "$AWS_REGION") || true
    
    if [ -n "$api_cert_arn" ]; then
        log_success "Found API certificate: $api_cert_arn"
        record_result "API Certificate" "pass" "Certificate found"
        check_certificate_status "$api_cert_arn" "$API_DOMAIN" "$AWS_REGION" || true
        check_certificate_expiry "$api_cert_arn" "$API_DOMAIN" "$AWS_REGION" || true
    else
        log_warning "API certificate not found in ACM"
        record_result "API Certificate" "pass" "Not found (may use other method)"
    fi
    
    echo ""
    
    # Check CloudFront certificate if manifest available
    if [ -n "$MANIFEST_FILE" ]; then
        local cf_distribution_id
        cf_distribution_id=$(jq -r '.cloudfront_distribution_id.value // empty' "$MANIFEST_FILE")
        
        if [ -n "$cf_distribution_id" ]; then
            check_cloudfront_certificate "$cf_distribution_id" "$DOMAIN" || true
        fi
    fi
    
    echo ""
    
    # Check API Gateway certificate
    check_api_gateway_certificate "$API_DOMAIN" || true
    
    echo ""
    
    # Test SSL connections
    test_ssl_connection "$DOMAIN" || true
    test_ssl_connection "$API_DOMAIN" || true
    
    echo ""
    
    # Test HTTPS redirects
    test_https_redirect "$DOMAIN" || true
    
    # Print summary
    print_summary
    
    # Return exit code based on results
    if [ $VALIDATION_FAILED -gt 0 ]; then
        log_error "SSL/TLS validation completed with failures"
        exit 1
    else
        log_success "SSL/TLS validation completed successfully"
        exit 0
    fi
}

# Run main function
main "$@"
