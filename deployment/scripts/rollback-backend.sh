#!/bin/bash
#
# Backend Rollback Script
# AI-Assisted Crypto Trading System
#
# Usage: ./rollback-backend.sh <environment> [--version <version>]
#
# Rolls back Lambda functions to previous versions:
#   - Lists available Lambda versions
#   - Updates function aliases to previous version
#   - Verifies rollback successful
#
# Requirements: 13.1, 13.3

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
    echo "Usage: $0 <environment> [--version <version>] [--function <function-name>]"
    echo ""
    echo "Arguments:"
    echo "  environment           Target environment (test|production)"
    echo "  --version <version>   Specific version to rollback to (optional)"
    echo "  --function <name>     Rollback specific function only (optional)"
    echo "  --dry-run             Show what would be done without making changes"
    echo ""
    echo "Examples:"
    echo "  $0 test                           # Rollback all functions to previous version"
    echo "  $0 production --version 5         # Rollback to version 5"
    echo "  $0 test --function strategies     # Rollback only strategies function"
    echo "  $0 production --dry-run           # Preview rollback"
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

# Track rollback results
ROLLBACK_RESULTS=()
ROLLBACK_SUCCESS=0
ROLLBACK_FAILED=0

record_result() {
    local function=$1
    local status=$2
    local details=$3
    ROLLBACK_RESULTS+=("$function|$status|$details")
    if [ "$status" == "success" ]; then
        ((ROLLBACK_SUCCESS++))
    else
        ((ROLLBACK_FAILED++))
    fi
}

# List available versions for a function
list_versions() {
    local function_name=$1
    
    log_info "Available versions for $function_name:"
    
    aws lambda list-versions-by-function \
        --function-name "$function_name" \
        --region "$AWS_REGION" \
        --query "Versions[?Version!='\$LATEST'].{Version:Version,Description:Description,LastModified:LastModified}" \
        --output table 2>/dev/null || true
}

# Get current alias version
get_current_version() {
    local function_name=$1
    local alias=${2:-live}
    
    aws lambda get-alias \
        --function-name "$function_name" \
        --name "$alias" \
        --region "$AWS_REGION" \
        --query "FunctionVersion" \
        --output text 2>/dev/null || echo ""
}

# Get previous version
get_previous_version() {
    local function_name=$1
    local current_version=$2
    
    # Get all versions sorted by version number descending
    local versions
    versions=$(aws lambda list-versions-by-function \
        --function-name "$function_name" \
        --region "$AWS_REGION" \
        --query "Versions[?Version!='\$LATEST'].Version" \
        --output text 2>/dev/null | tr '\t' '\n' | sort -rn)
    
    # Find the version before current
    local found_current=false
    for version in $versions; do
        if [ "$found_current" == "true" ]; then
            echo "$version"
            return 0
        fi
        if [ "$version" == "$current_version" ]; then
            found_current=true
        fi
    done
    
    return 1
}

# Rollback a single function
rollback_function() {
    local function_name=$1
    local target_version=$2
    local alias=${3:-live}
    
    log_info "Rolling back $function_name to version $target_version"
    
    if [ "$DRY_RUN" == "true" ]; then
        log_info "  [DRY RUN] Would update alias '$alias' to version $target_version"
        record_result "$function_name" "success" "Dry run - version $target_version"
        return 0
    fi
    
    # Update alias to point to target version
    local result
    result=$(aws lambda update-alias \
        --function-name "$function_name" \
        --name "$alias" \
        --function-version "$target_version" \
        --region "$AWS_REGION" \
        --output json 2>&1) || {
        log_error "  Failed to update alias"
        record_result "$function_name" "failed" "Alias update failed"
        return 1
    }
    
    # Verify the update
    local new_version
    new_version=$(echo "$result" | jq -r '.FunctionVersion')
    
    if [ "$new_version" == "$target_version" ]; then
        log_success "  Successfully rolled back to version $target_version"
        record_result "$function_name" "success" "Rolled back to version $target_version"
        return 0
    else
        log_error "  Rollback verification failed"
        record_result "$function_name" "failed" "Verification failed"
        return 1
    fi
}

# Rollback all functions
rollback_all_functions() {
    local target_version=$1
    
    # Get function names from manifest
    local function_names
    function_names=$(jq -r '.lambda_function_names.value // {} | values[]' "$MANIFEST_FILE" 2>/dev/null)
    
    if [ -z "$function_names" ]; then
        log_error "No Lambda functions found in manifest"
        exit 1
    fi
    
    for function_name in $function_names; do
        echo ""
        log_info "Processing: $function_name"
        
        # Get current version
        local current_version
        current_version=$(get_current_version "$function_name")
        
        if [ -z "$current_version" ]; then
            log_warning "  No 'live' alias found, skipping"
            record_result "$function_name" "success" "Skipped - no alias"
            continue
        fi
        
        log_info "  Current version: $current_version"
        
        # Determine target version
        local rollback_version
        if [ -n "$target_version" ]; then
            rollback_version="$target_version"
        else
            rollback_version=$(get_previous_version "$function_name" "$current_version")
            if [ -z "$rollback_version" ]; then
                log_warning "  No previous version found, skipping"
                record_result "$function_name" "success" "Skipped - no previous version"
                continue
            fi
        fi
        
        log_info "  Target version: $rollback_version"
        
        # Perform rollback
        rollback_function "$function_name" "$rollback_version" || true
    done
}

# Rollback specific function
rollback_specific_function() {
    local function_key=$1
    local target_version=$2
    
    # Get function name from manifest
    local function_name
    function_name=$(jq -r ".lambda_function_names.value[\"$function_key\"] // empty" "$MANIFEST_FILE" 2>/dev/null)
    
    if [ -z "$function_name" ]; then
        # Try using the key as the full function name
        function_name="$function_key"
    fi
    
    log_info "Processing: $function_name"
    
    # Get current version
    local current_version
    current_version=$(get_current_version "$function_name")
    
    if [ -z "$current_version" ]; then
        log_error "No 'live' alias found for $function_name"
        exit 1
    fi
    
    log_info "  Current version: $current_version"
    
    # List available versions
    list_versions "$function_name"
    echo ""
    
    # Determine target version
    local rollback_version
    if [ -n "$target_version" ]; then
        rollback_version="$target_version"
    else
        rollback_version=$(get_previous_version "$function_name" "$current_version")
        if [ -z "$rollback_version" ]; then
            log_error "No previous version found"
            exit 1
        fi
    fi
    
    log_info "  Target version: $rollback_version"
    
    # Confirm rollback
    if [ "$DRY_RUN" != "true" ]; then
        echo ""
        read -p "Confirm rollback of $function_name to version $rollback_version? (yes/no): " confirmation
        
        if [ "$confirmation" != "yes" ]; then
            log_error "Rollback cancelled by user"
            exit 1
        fi
    fi
    
    # Perform rollback
    rollback_function "$function_name" "$rollback_version"
}

# Print rollback summary
print_summary() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Rollback Summary${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "Environment: $ENVIRONMENT"
    echo "Dry Run: $DRY_RUN"
    echo ""
    echo "Results:"
    echo "----------------------------------------"
    
    for entry in "${ROLLBACK_RESULTS[@]}"; do
        IFS='|' read -r function status details <<< "$entry"
        if [ "$status" == "success" ]; then
            echo -e "  ${GREEN}✓${NC} $function"
            echo -e "    ${details}"
        else
            echo -e "  ${RED}✗${NC} $function"
            echo -e "    ${details}"
        fi
    done
    
    echo "----------------------------------------"
    echo -e "Success: ${GREEN}$ROLLBACK_SUCCESS${NC}"
    echo -e "Failed: ${RED}$ROLLBACK_FAILED${NC}"
    echo ""
}

# Main function
main() {
    # Parse arguments
    ENVIRONMENT=""
    TARGET_VERSION=""
    SPECIFIC_FUNCTION=""
    DRY_RUN="false"
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            test|production)
                ENVIRONMENT="$1"
                shift
                ;;
            --version)
                TARGET_VERSION="$2"
                shift 2
                ;;
            --function)
                SPECIFIC_FUNCTION="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN="true"
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
    
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Backend Rollback - ${ENVIRONMENT}${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    if [ "$DRY_RUN" == "true" ]; then
        log_warning "DRY RUN MODE - No changes will be made"
        echo ""
    fi
    
    # Load environment configuration
    load_environment_config "$ENVIRONMENT"
    
    # Load manifest
    load_manifest "$ENVIRONMENT"
    
    log_info "AWS Region: $AWS_REGION"
    
    if [ -n "$SPECIFIC_FUNCTION" ]; then
        # Rollback specific function
        rollback_specific_function "$SPECIFIC_FUNCTION" "$TARGET_VERSION"
    else
        # Rollback all functions
        if [ "$DRY_RUN" != "true" ]; then
            echo ""
            log_warning "This will rollback ALL Lambda functions to their previous versions"
            read -p "Continue? (yes/no): " confirmation
            
            if [ "$confirmation" != "yes" ]; then
                log_error "Rollback cancelled by user"
                exit 1
            fi
        fi
        
        rollback_all_functions "$TARGET_VERSION"
    fi
    
    # Print summary
    print_summary
    
    # Return exit code based on results
    if [ $ROLLBACK_FAILED -gt 0 ]; then
        log_error "Rollback completed with failures"
        exit 1
    else
        log_success "Rollback completed successfully"
        exit 0
    fi
}

# Run main function
main "$@"
