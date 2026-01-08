#!/bin/bash
#
# Frontend Deployment Script
# AI-Assisted Crypto Trading System
#
# Usage: ./deploy-frontend.sh <environment> [--skip-tests]
#
# Arguments:
#   environment    Target environment (test|production)
#   --skip-tests   Skip running tests during deployment (optional)
#
# Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9

set -e

# Script directory for relative paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
FRONTEND_DIR="${PROJECT_ROOT}/frontend"

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

# ============================================================================
# Phase 1: Install Dependencies (Requirement 6.1)
# ============================================================================

install_dependencies() {
    log_info "Installing frontend dependencies..."
    
    cd "$FRONTEND_DIR"
    
    if npm ci; then
        log_success "Dependencies installed successfully"
    else
        log_error "Failed to install dependencies"
        log_error "Check package.json and package-lock.json"
        exit 1
    fi
}

# ============================================================================
# Phase 2: Generate Frontend Configuration (Requirements 5.1-5.6)
# ============================================================================

generate_configuration() {
    local environment=$1
    
    log_info "Generating frontend configuration..."
    
    if "${SCRIPT_DIR}/generate-frontend-config.sh" "$environment"; then
        log_success "Frontend configuration generated"
    else
        log_error "Failed to generate frontend configuration"
        exit 1
    fi
}

# ============================================================================
# Phase 3: Build Frontend (Requirement 6.2)
# ============================================================================

build_frontend() {
    log_info "Building Next.js application..."
    
    cd "$FRONTEND_DIR"
    
    if npm run build; then
        log_success "Next.js build completed successfully"
    else
        log_error "Next.js build failed"
        log_error "Check for compilation errors above"
        exit 1
    fi
    
    # Verify build output exists
    if [ ! -d "${FRONTEND_DIR}/.next" ]; then
        log_error "Build output directory not found: ${FRONTEND_DIR}/.next"
        exit 1
    fi
    
    log_info "Build output: ${FRONTEND_DIR}/.next"
}

# ============================================================================
# Phase 4: Run Tests (Requirements 6.3, 6.4)
# ============================================================================

run_tests() {
    local skip_tests=$1
    
    if [ "$skip_tests" == "true" ]; then
        log_warning "Skipping tests (--skip-tests flag provided)"
        return 0
    fi
    
    log_info "Running frontend tests..."
    
    cd "$FRONTEND_DIR"
    
    if npm test; then
        log_success "All tests passed"
    else
        log_error "============================================"
        log_error "TESTS FAILED - DEPLOYMENT ABORTED"
        log_error "============================================"
        log_error ""
        log_error "Frontend tests must pass before deployment."
        log_error "Please fix the failing tests and try again."
        log_error ""
        log_error "To skip tests (not recommended for production):"
        log_error "  $0 $ENVIRONMENT --skip-tests"
        log_error ""
        exit 1
    fi
}

# ============================================================================
# Phase 5: Export Static Files (Requirement 6.5)
# ============================================================================

export_static_files() {
    log_info "Checking static export output..."
    
    cd "$FRONTEND_DIR"
    
    local out_dir="${FRONTEND_DIR}/out"
    
    # With Next.js 14+ and 'output: export' in next.config.js,
    # the 'out' directory is created automatically by 'npm run build'
    # No need to run 'next export' separately
    
    # Verify output directory exists
    if [ ! -d "$out_dir" ]; then
        log_error "Output directory not found: $out_dir"
        log_error "Make sure next.config.js has 'output: \"export\"' configured"
        exit 1
    fi
    
    # Verify index.html exists and is not a placeholder
    if [ ! -f "${out_dir}/index.html" ]; then
        log_error "index.html not found in output directory"
        exit 1
    fi
    
    # Check if index.html is a placeholder (contains meta refresh to /)
    if grep -q 'meta http-equiv="refresh"' "${out_dir}/index.html" 2>/dev/null; then
        log_error "index.html appears to be a placeholder with redirect"
        log_error "This usually means the build failed or next.config.js is misconfigured"
        log_error "Make sure next.config.js has: output: 'export'"
        exit 1
    fi
    
    # Count files
    local file_count=$(find "$out_dir" -type f | wc -l | tr -d ' ')
    log_info "Total files to upload: $file_count"
    
    # List top-level contents
    log_info "Output directory contents:"
    ls -la "$out_dir" | head -15
    
    log_success "Static export verified: $out_dir"
}

# ============================================================================
# Phase 6: Upload to S3 (Requirements 6.6, 6.7, 6.8)
# ============================================================================

# Get content type based on file extension
get_content_type() {
    local file=$1
    local extension="${file##*.}"
    
    case "$extension" in
        html)
            echo "text/html"
            ;;
        css)
            echo "text/css"
            ;;
        js)
            echo "application/javascript"
            ;;
        json)
            echo "application/json"
            ;;
        png)
            echo "image/png"
            ;;
        jpg|jpeg)
            echo "image/jpeg"
            ;;
        gif)
            echo "image/gif"
            ;;
        svg)
            echo "image/svg+xml"
            ;;
        ico)
            echo "image/x-icon"
            ;;
        woff)
            echo "font/woff"
            ;;
        woff2)
            echo "font/woff2"
            ;;
        ttf)
            echo "font/ttf"
            ;;
        eot)
            echo "application/vnd.ms-fontobject"
            ;;
        map)
            echo "application/json"
            ;;
        txt)
            echo "text/plain"
            ;;
        xml)
            echo "application/xml"
            ;;
        webp)
            echo "image/webp"
            ;;
        webm)
            echo "video/webm"
            ;;
        mp4)
            echo "video/mp4"
            ;;
        *)
            echo "application/octet-stream"
            ;;
    esac
}

# Check if file should have long cache
is_hashed_asset() {
    local file=$1
    
    # Files in _next/static are hashed and can be cached long-term
    if [[ "$file" == *"_next/static"* ]]; then
        return 0
    fi
    
    # Files with hash patterns in name (e.g., main.abc123.js)
    if [[ "$file" =~ \.[a-f0-9]{8,}\. ]]; then
        return 0
    fi
    
    return 1
}

upload_to_s3() {
    local bucket_name=$1
    local region=$2
    local out_dir="${FRONTEND_DIR}/out"
    
    log_info "Uploading to S3 bucket: $bucket_name"
    
    # First, sync all non-HTML files with long cache (Requirement 6.8)
    log_info "Uploading hashed assets with long cache..."
    
    aws s3 sync "$out_dir" "s3://${bucket_name}/" \
        --region "$region" \
        --delete \
        --exclude "*.html" \
        --cache-control "max-age=31536000,public,immutable" \
        --metadata-directive REPLACE
    
    log_success "Hashed assets uploaded"
    
    # Then, sync HTML files with no-cache (Requirement 6.8)
    log_info "Uploading HTML files with no-cache..."
    
    aws s3 sync "$out_dir" "s3://${bucket_name}/" \
        --region "$region" \
        --exclude "*" \
        --include "*.html" \
        --cache-control "no-cache,no-store,must-revalidate" \
        --content-type "text/html" \
        --metadata-directive REPLACE
    
    log_success "HTML files uploaded"
    
    # Verify upload
    local s3_count=$(aws s3 ls "s3://${bucket_name}/" --recursive --region "$region" | wc -l | tr -d ' ')
    log_info "Files in S3 bucket: $s3_count"
}

# Alternative upload method with explicit content-type per file
upload_to_s3_with_content_types() {
    local bucket_name=$1
    local region=$2
    local out_dir="${FRONTEND_DIR}/out"
    
    log_info "Uploading to S3 bucket with explicit content types: $bucket_name"
    
    local uploaded=0
    local failed=0
    
    # Find all files and upload with correct headers
    while IFS= read -r -d '' file; do
        local relative_path="${file#$out_dir/}"
        local content_type=$(get_content_type "$file")
        local cache_control
        
        # Determine cache control based on file type (Requirements 6.7, 6.8)
        if [[ "$relative_path" == *.html ]]; then
            cache_control="no-cache,no-store,must-revalidate"
        elif is_hashed_asset "$relative_path"; then
            cache_control="max-age=31536000,public,immutable"
        else
            cache_control="max-age=86400,public"
        fi
        
        # Upload file
        if aws s3 cp "$file" "s3://${bucket_name}/${relative_path}" \
            --region "$region" \
            --content-type "$content_type" \
            --cache-control "$cache_control" \
            --quiet 2>/dev/null; then
            uploaded=$((uploaded + 1))
        else
            log_warning "Failed to upload: $relative_path"
            failed=$((failed + 1))
        fi
    done < <(find "$out_dir" -type f -print0)
    
    log_info "Upload complete: $uploaded succeeded, $failed failed"
    
    if [ $failed -gt 0 ]; then
        log_warning "Some files failed to upload"
        return 1
    fi
    
    return 0
}

# ============================================================================
# Phase 7: CloudFront Cache Invalidation (Requirement 6.9)
# ============================================================================

invalidate_cloudfront_cache() {
    local distribution_id=$1
    local region=$2
    local wait_for_completion=${3:-false}
    
    log_info "Creating CloudFront cache invalidation..."
    log_info "Distribution ID: $distribution_id"
    
    # Create invalidation for all paths
    local invalidation_id
    invalidation_id=$(aws cloudfront create-invalidation \
        --distribution-id "$distribution_id" \
        --paths "/*" \
        --query 'Invalidation.Id' \
        --output text 2>/dev/null)
    
    if [ -z "$invalidation_id" ] || [ "$invalidation_id" == "None" ]; then
        log_error "Failed to create CloudFront invalidation"
        return 1
    fi
    
    log_success "Invalidation created: $invalidation_id"
    
    # Optionally wait for invalidation to complete
    if [ "$wait_for_completion" == "true" ]; then
        log_info "Waiting for invalidation to complete..."
        
        if aws cloudfront wait invalidation-completed \
            --distribution-id "$distribution_id" \
            --id "$invalidation_id" 2>/dev/null; then
            log_success "Invalidation completed"
        else
            log_warning "Timeout waiting for invalidation (may still be in progress)"
        fi
    else
        log_info "Invalidation in progress (not waiting for completion)"
    fi
    
    return 0
}

# ============================================================================
# Main Function
# ============================================================================

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
            --skip-tests|true)
                SKIP_TESTS="true"
                shift
                ;;
            false)
                SKIP_TESTS="false"
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
    
    log_info "Starting frontend deployment for: $ENVIRONMENT"
    log_info "Skip tests: $SKIP_TESTS"
    
    # Check manifest file exists
    local manifest_file="${PROJECT_ROOT}/deployment/manifests/${ENVIRONMENT}-manifest.json"
    if [ ! -f "$manifest_file" ]; then
        log_error "Manifest file not found: $manifest_file"
        log_error "Run deploy-infrastructure.sh first to create the manifest"
        exit 1
    fi
    
    # Read configuration from manifest
    local bucket_name
    bucket_name=$(jq -r '.frontend_assets_bucket_id.value // .frontend_assets_bucket_id // empty' "$manifest_file")
    if [ -z "$bucket_name" ] || [ "$bucket_name" == "null" ]; then
        log_error "Frontend assets bucket not found in manifest"
        exit 1
    fi
    
    local distribution_id
    distribution_id=$(jq -r '.cloudfront_distribution_id.value // .cloudfront_distribution_id // empty' "$manifest_file")
    if [ -z "$distribution_id" ] || [ "$distribution_id" == "null" ]; then
        log_warning "CloudFront distribution ID not found in manifest"
        log_warning "Cache invalidation will be skipped"
    fi
    
    local region
    region=$(jq -r '.aws_region.value // .aws_region // "eu-central-1"' "$manifest_file")
    
    log_info "Frontend bucket: $bucket_name"
    log_info "CloudFront distribution: ${distribution_id:-'not configured'}"
    log_info "AWS Region: $region"
    
    # Phase 1: Install dependencies
    echo ""
    log_info "=== Phase 1: Install Dependencies ==="
    install_dependencies
    
    # Phase 2: Generate configuration
    echo ""
    log_info "=== Phase 2: Generate Configuration ==="
    generate_configuration "$ENVIRONMENT"
    
    # Phase 3: Build frontend
    echo ""
    log_info "=== Phase 3: Build Frontend ==="
    build_frontend
    
    # Phase 4: Run tests
    echo ""
    log_info "=== Phase 4: Run Tests ==="
    run_tests "$SKIP_TESTS"
    
    # Phase 5: Export static files
    echo ""
    log_info "=== Phase 5: Export Static Files ==="
    export_static_files
    
    # Phase 6: Upload to S3
    echo ""
    log_info "=== Phase 6: Upload to S3 ==="
    upload_to_s3 "$bucket_name" "$region"
    
    # Phase 7: Invalidate CloudFront cache
    echo ""
    log_info "=== Phase 7: CloudFront Cache Invalidation ==="
    if [ -n "$distribution_id" ] && [ "$distribution_id" != "null" ]; then
        invalidate_cloudfront_cache "$distribution_id" "$region" "false"
    else
        log_warning "Skipping CloudFront invalidation (no distribution ID)"
    fi
    
    # Print summary
    echo ""
    log_info "=== Deployment Summary ==="
    echo ""
    log_success "Frontend deployment completed successfully"
    echo ""
    echo "  Environment: $ENVIRONMENT"
    echo "  S3 Bucket: $bucket_name"
    echo "  CloudFront: ${distribution_id:-'not configured'}"
    echo ""
    
    # Get domain from environment config
    local config_file="${PROJECT_ROOT}/deployment/config/${ENVIRONMENT}.env"
    if [ -f "$config_file" ]; then
        local domain=$(grep -E "^DOMAIN=" "$config_file" | cut -d'=' -f2)
        if [ -n "$domain" ]; then
            echo "  Frontend URL: https://${domain}"
        fi
    fi
    
    echo ""
    log_info "Next steps:"
    echo "  1. Verify frontend is accessible"
    echo "  2. Run validation: ./validate-deployment.sh $ENVIRONMENT"
    echo "  3. Check CloudWatch logs for any errors"
}

# Run main function
main "$@"
