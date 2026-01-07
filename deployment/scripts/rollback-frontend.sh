#!/bin/bash
#
# Frontend Rollback Script
# AI-Assisted Crypto Trading System
#
# Usage: ./rollback-frontend.sh <environment> [--version <version-id>]
#
# Rolls back frontend to previous version:
#   - Lists S3 object versions
#   - Restores previous version of files
#   - Invalidates CloudFront cache
#
# Requirements: 13.2, 13.4, 13.6

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
    echo "Usage: $0 <environment> [--version <version-id>] [--dry-run]"
    echo ""
    echo "Arguments:"
    echo "  environment              Target environment (test|production)"
    echo "  --version <version-id>   Specific S3 version ID to restore (optional)"
    echo "  --dry-run                Show what would be done without making changes"
    echo "  --list-versions          List available versions for index.html"
    echo ""
    echo "Examples:"
    echo "  $0 test                              # Rollback to previous version"
    echo "  $0 production --list-versions        # List available versions"
    echo "  $0 test --version abc123             # Rollback to specific version"
    echo "  $0 production --dry-run              # Preview rollback"
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
    
    # Extract bucket and distribution info
    FRONTEND_BUCKET=$(jq -r '.frontend_assets_bucket_id.value // empty' "$MANIFEST_FILE")
    CLOUDFRONT_DISTRIBUTION=$(jq -r '.cloudfront_distribution_id.value // empty' "$MANIFEST_FILE")
}

# Track rollback results
ROLLBACK_RESULTS=()
ROLLBACK_SUCCESS=0
ROLLBACK_FAILED=0

record_result() {
    local item=$1
    local status=$2
    local details=$3
    ROLLBACK_RESULTS+=("$item|$status|$details")
    if [ "$status" == "success" ]; then
        ((ROLLBACK_SUCCESS++))
    else
        ((ROLLBACK_FAILED++))
    fi
}

# List available versions for index.html
list_versions() {
    log_info "Available versions for index.html in $FRONTEND_BUCKET:"
    echo ""
    
    aws s3api list-object-versions \
        --bucket "$FRONTEND_BUCKET" \
        --prefix "index.html" \
        --region "$AWS_REGION" \
        --query "Versions[].{VersionId:VersionId,LastModified:LastModified,IsLatest:IsLatest}" \
        --output table 2>/dev/null || {
        log_error "Failed to list versions. Is versioning enabled on the bucket?"
        exit 1
    }
}

# Get previous version ID for a file
get_previous_version() {
    local key=$1
    
    # Get all versions sorted by last modified descending
    local versions
    versions=$(aws s3api list-object-versions \
        --bucket "$FRONTEND_BUCKET" \
        --prefix "$key" \
        --region "$AWS_REGION" \
        --query "Versions[?Key=='${key}'].{VersionId:VersionId,IsLatest:IsLatest}" \
        --output json 2>/dev/null)
    
    # Find the first non-latest version
    echo "$versions" | jq -r '[.[] | select(.IsLatest != true)][0].VersionId // empty'
}

# Restore a specific version of a file
restore_file_version() {
    local key=$1
    local version_id=$2
    
    log_info "Restoring $key to version $version_id"
    
    if [ "$DRY_RUN" == "true" ]; then
        log_info "  [DRY RUN] Would copy version $version_id to current"
        record_result "$key" "success" "Dry run - version $version_id"
        return 0
    fi
    
    # Copy the old version to become the new current version
    aws s3api copy-object \
        --bucket "$FRONTEND_BUCKET" \
        --copy-source "${FRONTEND_BUCKET}/${key}?versionId=${version_id}" \
        --key "$key" \
        --region "$AWS_REGION" \
        --output json >/dev/null 2>&1 || {
        log_error "  Failed to restore $key"
        record_result "$key" "failed" "Copy failed"
        return 1
    }
    
    log_success "  Restored successfully"
    record_result "$key" "success" "Restored to version $version_id"
    return 0
}

# Rollback all HTML files
rollback_html_files() {
    local target_version=$1
    
    log_info "Finding HTML files to rollback"
    
    # List all HTML files
    local html_files
    html_files=$(aws s3api list-objects-v2 \
        --bucket "$FRONTEND_BUCKET" \
        --region "$AWS_REGION" \
        --query "Contents[?ends_with(Key, '.html')].Key" \
        --output text 2>/dev/null)
    
    if [ -z "$html_files" ]; then
        log_warning "No HTML files found in bucket"
        return 0
    fi
    
    for key in $html_files; do
        echo ""
        
        local version_to_restore
        if [ -n "$target_version" ]; then
            version_to_restore="$target_version"
        else
            version_to_restore=$(get_previous_version "$key")
            if [ -z "$version_to_restore" ]; then
                log_warning "No previous version found for $key, skipping"
                record_result "$key" "success" "Skipped - no previous version"
                continue
            fi
        fi
        
        restore_file_version "$key" "$version_to_restore" || true
    done
}

# Rollback _next directory (Next.js assets)
rollback_next_assets() {
    local target_version=$1
    
    log_info "Checking _next directory for rollback"
    
    # For Next.js, we typically need to rollback the entire _next directory
    # This is more complex as each build generates unique hashed filenames
    
    # List unique deployment timestamps from _next/static
    local deployments
    deployments=$(aws s3api list-objects-v2 \
        --bucket "$FRONTEND_BUCKET" \
        --prefix "_next/static/" \
        --region "$AWS_REGION" \
        --query "Contents[].Key" \
        --output text 2>/dev/null | tr '\t' '\n' | cut -d'/' -f3 | sort -u | head -5)
    
    if [ -z "$deployments" ]; then
        log_warning "No _next/static deployments found"
        return 0
    fi
    
    log_info "Recent deployment hashes:"
    for deployment in $deployments; do
        echo "  - $deployment"
    done
    
    log_warning "Note: Next.js assets use content hashing. Full rollback requires restoring HTML files which reference the correct asset hashes."
    
    record_result "_next assets" "success" "HTML rollback will reference correct assets"
}

# Invalidate CloudFront cache
invalidate_cloudfront() {
    if [ -z "$CLOUDFRONT_DISTRIBUTION" ]; then
        log_warning "CloudFront distribution ID not found, skipping invalidation"
        return 0
    fi
    
    log_info "Invalidating CloudFront cache"
    
    if [ "$DRY_RUN" == "true" ]; then
        log_info "  [DRY RUN] Would create invalidation for /*"
        record_result "CloudFront Invalidation" "success" "Dry run"
        return 0
    fi
    
    local invalidation_id
    invalidation_id=$(aws cloudfront create-invalidation \
        --distribution-id "$CLOUDFRONT_DISTRIBUTION" \
        --paths "/*" \
        --query "Invalidation.Id" \
        --output text 2>/dev/null) || {
        log_error "  Failed to create invalidation"
        record_result "CloudFront Invalidation" "failed" "Creation failed"
        return 1
    }
    
    log_success "  Invalidation created: $invalidation_id"
    
    # Optionally wait for invalidation to complete
    log_info "  Waiting for invalidation to complete..."
    
    aws cloudfront wait invalidation-completed \
        --distribution-id "$CLOUDFRONT_DISTRIBUTION" \
        --id "$invalidation_id" 2>/dev/null || {
        log_warning "  Invalidation still in progress"
        record_result "CloudFront Invalidation" "success" "In progress: $invalidation_id"
        return 0
    }
    
    log_success "  Invalidation completed"
    record_result "CloudFront Invalidation" "success" "Completed: $invalidation_id"
    return 0
}

# Print rollback summary
print_summary() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Frontend Rollback Summary${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "Environment: $ENVIRONMENT"
    echo "S3 Bucket: $FRONTEND_BUCKET"
    echo "CloudFront: $CLOUDFRONT_DISTRIBUTION"
    echo "Dry Run: $DRY_RUN"
    echo ""
    echo "Results:"
    echo "----------------------------------------"
    
    for entry in "${ROLLBACK_RESULTS[@]}"; do
        IFS='|' read -r item status details <<< "$entry"
        if [ "$status" == "success" ]; then
            echo -e "  ${GREEN}✓${NC} $item"
            echo -e "    ${details}"
        else
            echo -e "  ${RED}✗${NC} $item"
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
    DRY_RUN="false"
    LIST_VERSIONS="false"
    
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
            --dry-run)
                DRY_RUN="true"
                shift
                ;;
            --list-versions)
                LIST_VERSIONS="true"
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
    echo -e "${BLUE}  Frontend Rollback - ${ENVIRONMENT}${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    # Load environment configuration
    load_environment_config "$ENVIRONMENT"
    
    # Load manifest
    load_manifest "$ENVIRONMENT"
    
    log_info "S3 Bucket: $FRONTEND_BUCKET"
    log_info "CloudFront Distribution: $CLOUDFRONT_DISTRIBUTION"
    log_info "AWS Region: $AWS_REGION"
    echo ""
    
    # List versions mode
    if [ "$LIST_VERSIONS" == "true" ]; then
        list_versions
        exit 0
    fi
    
    if [ "$DRY_RUN" == "true" ]; then
        log_warning "DRY RUN MODE - No changes will be made"
        echo ""
    fi
    
    # Confirm rollback
    if [ "$DRY_RUN" != "true" ]; then
        log_warning "This will rollback the frontend to a previous version"
        read -p "Continue? (yes/no): " confirmation
        
        if [ "$confirmation" != "yes" ]; then
            log_error "Rollback cancelled by user"
            exit 1
        fi
        echo ""
    fi
    
    # Rollback HTML files
    rollback_html_files "$TARGET_VERSION"
    echo ""
    
    # Check _next assets
    rollback_next_assets "$TARGET_VERSION"
    echo ""
    
    # Invalidate CloudFront cache
    invalidate_cloudfront
    
    # Print summary
    print_summary
    
    # Return exit code based on results
    if [ $ROLLBACK_FAILED -gt 0 ]; then
        log_error "Rollback completed with failures"
        exit 1
    else
        log_success "Rollback completed successfully"
        log_info "Frontend URL: https://${DOMAIN}"
        exit 0
    fi
}

# Run main function
main "$@"
