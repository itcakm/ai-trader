#!/bin/bash
#
# Main Deployment Orchestrator Script
# AI-Assisted Crypto Trading System
#
# Usage: ./deploy.sh <environment> [--skip-tests]
#
# Arguments:
#   environment    Target environment (test|production)
#   --skip-tests   Skip running tests during deployment (optional)
#
# Requirements: 1.1, 1.2

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

log_phase() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# Usage information
usage() {
    echo "Usage: $0 <environment> [--skip-tests]"
    echo ""
    echo "Arguments:"
    echo "  environment    Target environment (test|production)"
    echo "  --skip-tests   Skip running tests during deployment"
    echo ""
    echo "Examples:"
    echo "  $0 test                    # Deploy to test with tests"
    echo "  $0 test --skip-tests       # Deploy to test without tests"
    echo "  $0 production              # Deploy to production with tests"
    exit 1
}

# Validate environment parameter
validate_environment() {
    local env=$1
    if [[ "$env" != "test" && "$env" != "production" ]]; then
        log_error "Invalid environment: $env"
        log_error "Environment must be 'test' or 'production'"
        exit 1
    fi
}

# Check required tools are installed
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing_tools=()
    
    # Check for required tools
    command -v terraform >/dev/null 2>&1 || missing_tools+=("terraform")
    command -v aws >/dev/null 2>&1 || missing_tools+=("aws")
    command -v jq >/dev/null 2>&1 || missing_tools+=("jq")
    command -v npm >/dev/null 2>&1 || missing_tools+=("npm")
    command -v node >/dev/null 2>&1 || missing_tools+=("node")
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        log_error "Please install the missing tools and try again."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log_error "AWS credentials not configured or invalid"
        log_error "Please configure AWS credentials and try again."
        exit 1
    fi
    
    log_success "All prerequisites satisfied"
}

# Load environment configuration
load_environment_config() {
    local env=$1
    local config_file="${PROJECT_ROOT}/deployment/config/${env}.env"
    
    if [ ! -f "$config_file" ]; then
        log_error "Environment configuration file not found: $config_file"
        exit 1
    fi
    
    log_info "Loading environment configuration from $config_file"
    
    # Export environment variables from config file
    set -a
    source "$config_file"
    set +a
    
    log_success "Environment configuration loaded"
}

# Check for production deployment approval
check_production_approval() {
    if [ "$REQUIRE_MANUAL_APPROVAL" == "true" ]; then
        log_warning "Production deployment requires manual approval"
        echo ""
        read -p "Are you sure you want to deploy to PRODUCTION? (yes/no): " confirmation
        
        if [ "$confirmation" != "yes" ]; then
            log_error "Production deployment cancelled by user"
            exit 1
        fi
        
        log_success "Production deployment approved"
    fi
}

# Track deployment status
DEPLOYMENT_STATUS=()
DEPLOYMENT_START_TIME=$(date +%s)

record_phase_status() {
    local phase=$1
    local status=$2
    local duration=$3
    DEPLOYMENT_STATUS+=("$phase|$status|$duration")
}

# Print deployment summary
print_deployment_summary() {
    local end_time=$(date +%s)
    local total_duration=$((end_time - DEPLOYMENT_START_TIME))
    
    echo ""
    log_phase "Deployment Summary"
    
    echo "Environment: $ENVIRONMENT"
    echo "Total Duration: ${total_duration}s"
    echo ""
    echo "Phase Results:"
    echo "----------------------------------------"
    
    for entry in "${DEPLOYMENT_STATUS[@]}"; do
        IFS='|' read -r phase status duration <<< "$entry"
        if [ "$status" == "success" ]; then
            echo -e "  ${GREEN}✓${NC} $phase (${duration}s)"
        else
            echo -e "  ${RED}✗${NC} $phase (${duration}s)"
        fi
    done
    
    echo "----------------------------------------"
}

# Main deployment function
main() {
    # Parse arguments
    ENVIRONMENT=""
    SKIP_TESTS="false"
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            test|production)
                ENVIRONMENT="$1"
                shift
                ;;
            --skip-tests)
                SKIP_TESTS="true"
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
    
    log_phase "Starting Deployment to ${ENVIRONMENT}"
    
    log_info "Environment: $ENVIRONMENT"
    log_info "Skip Tests: $SKIP_TESTS"
    log_info "Project Root: $PROJECT_ROOT"
    
    # Check prerequisites
    check_prerequisites
    
    # Load environment configuration
    load_environment_config "$ENVIRONMENT"
    
    # Check for production approval if needed
    if [ "$ENVIRONMENT" == "production" ]; then
        check_production_approval
    fi
    
    # Phase 1: Infrastructure Deployment
    log_phase "Phase 1: Infrastructure Deployment"
    local phase_start=$(date +%s)
    
    if "${SCRIPT_DIR}/deploy-infrastructure.sh" "$ENVIRONMENT"; then
        local phase_end=$(date +%s)
        record_phase_status "Infrastructure" "success" "$((phase_end - phase_start))"
        log_success "Infrastructure deployment completed"
    else
        local phase_end=$(date +%s)
        record_phase_status "Infrastructure" "failed" "$((phase_end - phase_start))"
        log_error "Infrastructure deployment failed"
        print_deployment_summary
        exit 1
    fi
    
    # Phase 2: Backend Deployment
    log_phase "Phase 2: Backend Deployment"
    phase_start=$(date +%s)
    
    if "${SCRIPT_DIR}/deploy-backend.sh" "$ENVIRONMENT" "$SKIP_TESTS"; then
        phase_end=$(date +%s)
        record_phase_status "Backend" "success" "$((phase_end - phase_start))"
        log_success "Backend deployment completed"
    else
        phase_end=$(date +%s)
        record_phase_status "Backend" "failed" "$((phase_end - phase_start))"
        log_error "Backend deployment failed"
        print_deployment_summary
        exit 1
    fi
    
    # Phase 3: Secrets Population (Interactive)
    log_phase "Phase 3: Secrets Population"
    phase_start=$(date +%s)
    
    if "${SCRIPT_DIR}/populate-secrets.sh" "$ENVIRONMENT"; then
        phase_end=$(date +%s)
        record_phase_status "Secrets" "success" "$((phase_end - phase_start))"
        log_success "Secrets population completed"
    else
        phase_end=$(date +%s)
        record_phase_status "Secrets" "failed" "$((phase_end - phase_start))"
        log_error "Secrets population failed"
        print_deployment_summary
        exit 1
    fi
    
    # Phase 4: Frontend Deployment
    log_phase "Phase 4: Frontend Deployment"
    phase_start=$(date +%s)
    
    if "${SCRIPT_DIR}/deploy-frontend.sh" "$ENVIRONMENT" "$SKIP_TESTS"; then
        phase_end=$(date +%s)
        record_phase_status "Frontend" "success" "$((phase_end - phase_start))"
        log_success "Frontend deployment completed"
    else
        phase_end=$(date +%s)
        record_phase_status "Frontend" "failed" "$((phase_end - phase_start))"
        log_error "Frontend deployment failed"
        print_deployment_summary
        exit 1
    fi
    
    # Phase 5: Validation
    log_phase "Phase 5: Deployment Validation"
    phase_start=$(date +%s)
    
    if "${SCRIPT_DIR}/validate-deployment.sh" "$ENVIRONMENT"; then
        phase_end=$(date +%s)
        record_phase_status "Validation" "success" "$((phase_end - phase_start))"
        log_success "Deployment validation completed"
    else
        phase_end=$(date +%s)
        record_phase_status "Validation" "failed" "$((phase_end - phase_start))"
        log_error "Deployment validation failed"
        print_deployment_summary
        exit 1
    fi
    
    # Phase 6: Documentation Generation
    log_phase "Phase 6: Documentation Generation"
    phase_start=$(date +%s)
    
    if "${SCRIPT_DIR}/generate-docs.sh" "$ENVIRONMENT"; then
        phase_end=$(date +%s)
        record_phase_status "Documentation" "success" "$((phase_end - phase_start))"
        log_success "Documentation generation completed"
    else
        phase_end=$(date +%s)
        record_phase_status "Documentation" "failed" "$((phase_end - phase_start))"
        log_warning "Documentation generation failed (non-critical)"
    fi
    
    # Print final summary
    print_deployment_summary
    
    log_phase "Deployment to ${ENVIRONMENT} Complete!"
    log_success "All deployment phases completed successfully"
    
    # Print access information
    local manifest_file="${PROJECT_ROOT}/deployment/manifests/${ENVIRONMENT}-manifest.json"
    if [ -f "$manifest_file" ]; then
        echo ""
        log_info "Access Information:"
        echo "  Frontend URL: https://${DOMAIN}"
        echo "  API URL: https://${API_DOMAIN}"
        echo "  Manifest: $manifest_file"
    fi
}

# Run main function
main "$@"
