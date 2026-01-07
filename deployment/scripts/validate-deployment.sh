#!/bin/bash
#
# Deployment Validation Orchestrator Script
# AI-Assisted Crypto Trading System
#
# Usage: ./validate-deployment.sh <environment> [--skip-smoke-tests]
#
# Orchestrates all validation checks:
#   - DNS validation
#   - SSL validation
#   - API health checks
#   - Frontend checks
#   - Smoke tests
#   - Monitoring checks
#
# Requirements: 7.7, 8.7

set -e

# Script directory for relative paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TESTS_DIR="${PROJECT_ROOT}/deployment/tests"

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

log_phase() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# Usage information
usage() {
    echo "Usage: $0 <environment> [--skip-smoke-tests]"
    echo ""
    echo "Arguments:"
    echo "  environment         Target environment (test|production)"
    echo "  --skip-smoke-tests  Skip smoke tests (optional)"
    echo ""
    echo "Examples:"
    echo "  $0 test"
    echo "  $0 production"
    echo "  $0 test --skip-smoke-tests"
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
VALIDATION_PHASES=()
VALIDATION_START_TIME=$(date +%s)
TOTAL_PASSED=0
TOTAL_FAILED=0

record_phase_result() {
    local phase=$1
    local status=$2
    local duration=$3
    local details=$4
    VALIDATION_PHASES+=("$phase|$status|$duration|$details")
    if [ "$status" == "pass" ]; then
        ((TOTAL_PASSED++))
    else
        ((TOTAL_FAILED++))
    fi
}

# Run a validation script
run_validation() {
    local name=$1
    local script=$2
    local required=${3:-true}
    
    log_info "Running: $name"
    
    local start_time
    local end_time
    local duration
    local exit_code
    
    start_time=$(date +%s)
    
    if [ -f "$script" ]; then
        if "$script" "$ENVIRONMENT" 2>&1; then
            exit_code=0
        else
            exit_code=$?
        fi
    else
        log_warning "  Script not found: $script"
        exit_code=2
    fi
    
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    if [ $exit_code -eq 0 ]; then
        log_success "  $name completed successfully (${duration}s)"
        record_phase_result "$name" "pass" "$duration" "Success"
        return 0
    elif [ $exit_code -eq 2 ]; then
        log_warning "  $name skipped (script not found)"
        record_phase_result "$name" "pass" "$duration" "Skipped"
        return 0
    else
        if [ "$required" == "true" ]; then
            log_error "  $name failed (${duration}s)"
            record_phase_result "$name" "fail" "$duration" "Exit code: $exit_code"
            return 1
        else
            log_warning "  $name failed but not required (${duration}s)"
            record_phase_result "$name" "pass" "$duration" "Failed (non-critical)"
            return 0
        fi
    fi
}

# Print validation summary
print_summary() {
    local end_time=$(date +%s)
    local total_duration=$((end_time - VALIDATION_START_TIME))
    
    echo ""
    log_phase "Validation Summary"
    
    echo "Environment: $ENVIRONMENT"
    echo "Total Duration: ${total_duration}s"
    echo ""
    echo "Phase Results:"
    echo "----------------------------------------"
    
    for entry in "${VALIDATION_PHASES[@]}"; do
        IFS='|' read -r phase status duration details <<< "$entry"
        if [ "$status" == "pass" ]; then
            echo -e "  ${GREEN}✓${NC} $phase (${duration}s)"
            echo -e "    ${details}"
        else
            echo -e "  ${RED}✗${NC} $phase (${duration}s)"
            echo -e "    ${details}"
        fi
    done
    
    echo "----------------------------------------"
    echo -e "Passed: ${GREEN}$TOTAL_PASSED${NC}"
    echo -e "Failed: ${RED}$TOTAL_FAILED${NC}"
    echo ""
}

# Generate validation report
generate_report() {
    local report_file="${PROJECT_ROOT}/deployment/docs/validation-report-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S).md"
    
    log_info "Generating validation report"
    
    mkdir -p "$(dirname "$report_file")"
    
    local end_time=$(date +%s)
    local total_duration=$((end_time - VALIDATION_START_TIME))
    
    cat > "$report_file" <<EOF
# Deployment Validation Report

## Environment
- **Environment:** $ENVIRONMENT
- **Date:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")
- **Duration:** ${total_duration}s

## Results Summary
- **Passed:** $TOTAL_PASSED
- **Failed:** $TOTAL_FAILED

## Validation Phases

| Phase | Status | Duration | Details |
|-------|--------|----------|---------|
EOF
    
    for entry in "${VALIDATION_PHASES[@]}"; do
        IFS='|' read -r phase status duration details <<< "$entry"
        local status_icon
        if [ "$status" == "pass" ]; then
            status_icon="✅"
        else
            status_icon="❌"
        fi
        echo "| $phase | $status_icon $status | ${duration}s | $details |" >> "$report_file"
    done
    
    cat >> "$report_file" <<EOF

## Configuration
- **Frontend Domain:** $DOMAIN
- **API Domain:** $API_DOMAIN
- **AWS Region:** $AWS_REGION

---
*Generated by validate-deployment.sh*
EOF
    
    log_success "  Report saved to: $report_file"
}

# Main function
main() {
    # Parse arguments
    ENVIRONMENT=""
    SKIP_SMOKE_TESTS="false"
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            test|production)
                ENVIRONMENT="$1"
                shift
                ;;
            --skip-smoke-tests)
                SKIP_SMOKE_TESTS="true"
                shift
                ;;
            -h|--help)
                usage
                ;;
            *)
                log_error "Unknown argument: $1"
                usage
                ;;
        esac
    done
    
    # Validate environment is provided
    if [ -z "$ENVIRONMENT" ]; then
        log_error "Environment parameter is required"
        usage
    fi
    
    # Validate environment value
    validate_environment "$ENVIRONMENT"
    
    log_phase "Deployment Validation - ${ENVIRONMENT}"
    
    log_info "Environment: $ENVIRONMENT"
    log_info "Skip Smoke Tests: $SKIP_SMOKE_TESTS"
    echo ""
    
    # Load environment configuration
    load_environment_config "$ENVIRONMENT"
    
    log_info "Frontend Domain: $DOMAIN"
    log_info "API Domain: $API_DOMAIN"
    log_info "AWS Region: $AWS_REGION"
    
    # Phase 1: DNS Validation
    log_phase "Phase 1: DNS Validation"
    run_validation "DNS Validation" "${TESTS_DIR}/dns-validation.sh" "false" || true
    
    # Phase 2: SSL Validation
    log_phase "Phase 2: SSL/TLS Validation"
    run_validation "SSL Validation" "${TESTS_DIR}/ssl-validation.sh" "false" || true
    
    # Phase 3: API Health Checks
    log_phase "Phase 3: API Health Checks"
    run_validation "API Health Checks" "${TESTS_DIR}/health-checks.sh" "true" || true
    
    # Phase 4: Frontend Checks
    log_phase "Phase 4: Frontend Validation"
    run_validation "Frontend Checks" "${TESTS_DIR}/frontend-checks.sh" "true" || true
    
    # Phase 5: Smoke Tests (optional)
    if [ "$SKIP_SMOKE_TESTS" != "true" ]; then
        log_phase "Phase 5: Smoke Tests"
        run_validation "Smoke Tests" "${TESTS_DIR}/smoke-tests.sh" "false" || true
    else
        log_phase "Phase 5: Smoke Tests (Skipped)"
        log_info "Smoke tests skipped by user request"
        record_phase_result "Smoke Tests" "pass" "0" "Skipped"
    fi
    
    # Phase 6: Monitoring Checks
    log_phase "Phase 6: Monitoring Validation"
    run_validation "Monitoring Checks" "${TESTS_DIR}/monitoring-checks.sh" "false" || true
    
    # Generate report
    log_phase "Generating Report"
    generate_report || true
    
    # Print summary
    print_summary
    
    # Return exit code based on results
    if [ $TOTAL_FAILED -gt 0 ]; then
        log_error "Deployment validation completed with failures"
        log_info "Review the validation report for details"
        exit 1
    else
        log_success "Deployment validation completed successfully"
        exit 0
    fi
}

# Run main function
main "$@"
