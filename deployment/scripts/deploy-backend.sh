#!/bin/bash
#
# Backend Deployment Script
# AI-Assisted Crypto Trading System
#
# Usage: ./deploy-backend.sh <environment> [--skip-tests]
#
# Arguments:
#   environment    Target environment (test|production)
#   --skip-tests   Skip running tests during deployment (optional)
#
# Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6

set -e

# Script directory for relative paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKEND_DIR="${PROJECT_ROOT}/backend"

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

# Deployment tracking
DEPLOYED_FUNCTIONS=()
FAILED_FUNCTIONS=()
SKIPPED_FUNCTIONS=()


# ============================================================================
# Phase 1: Build and Test (Requirements 2.1, 2.2, 2.3)
# ============================================================================

# Install dependencies
install_dependencies() {
    log_info "Installing backend dependencies..."
    
    cd "$BACKEND_DIR"
    
    if npm ci; then
        log_success "Dependencies installed successfully"
    else
        log_error "Failed to install dependencies"
        log_error "Check package.json and package-lock.json"
        exit 1
    fi
}

# Build TypeScript
build_typescript() {
    log_info "Building TypeScript..."
    
    cd "$BACKEND_DIR"
    
    if npm run build; then
        log_success "TypeScript build completed successfully"
    else
        log_error "TypeScript build failed"
        log_error "Check for compilation errors above"
        exit 1
    fi
    
    # Verify dist directory was created
    if [ ! -d "${BACKEND_DIR}/dist" ]; then
        log_error "Build output directory not found: ${BACKEND_DIR}/dist"
        exit 1
    fi
    
    log_info "Build output: ${BACKEND_DIR}/dist"
}

# Run tests
run_tests() {
    local skip_tests=$1
    
    if [ "$skip_tests" == "true" ]; then
        log_warning "Skipping tests (--skip-tests flag provided)"
        return 0
    fi
    
    log_info "Running backend tests..."
    
    cd "$BACKEND_DIR"
    
    if npm test; then
        log_success "All tests passed"
    else
        log_error "============================================"
        log_error "TESTS FAILED - DEPLOYMENT ABORTED"
        log_error "============================================"
        log_error ""
        log_error "Backend tests must pass before deployment."
        log_error "Please fix the failing tests and try again."
        log_error ""
        log_error "To skip tests (not recommended for production):"
        log_error "  $0 $ENVIRONMENT --skip-tests"
        log_error ""
        exit 1
    fi
}


# ============================================================================
# Phase 2: Lambda Packaging (Requirements 2.4, 2.5, 2.6, 2.7)
# ============================================================================

# Get list of handler files (excluding test files and index files)
get_handler_files() {
    find "${BACKEND_DIR}/src/handlers" -name "*.ts" ! -name "*.test.ts" ! -name "index.ts" -type f | sort
}

# Get package name from handler file path
# Converts nested paths to hyphenated names:
#   handlers/strategies.ts -> strategies
#   handlers/auth/triggers/pre-signup.ts -> auth-pre-signup
get_package_name() {
    local handler_file=$1
    local relative_path="${handler_file#${BACKEND_DIR}/src/handlers/}"
    local name_without_ext="${relative_path%.ts}"
    
    # Replace directory separators with hyphens
    local package_name="${name_without_ext//\//-}"
    
    # Handle special case for auth/triggers - remove 'triggers' from name
    # auth/triggers/pre-signup -> auth-pre-signup
    package_name="${package_name/auth-triggers-/auth-}"
    
    echo "$package_name"
}

# Create deployment package for a single handler
create_deployment_package() {
    local handler_file=$1
    local package_name=$(get_package_name "$handler_file")
    local package_dir="${BACKEND_DIR}/packages"
    local package_file="${package_dir}/${package_name}.zip"
    
    log_info "Creating package for: $package_name"
    
    # Create packages directory if it doesn't exist
    mkdir -p "$package_dir"
    
    # Remove existing package
    rm -f "$package_file"
    
    cd "$BACKEND_DIR"
    
    # Create ZIP package with dist/ and node_modules/
    # Exclude test files, source maps, and dev dependencies
    if zip -rq "$package_file" \
        dist/ \
        node_modules/ \
        -x "*.test.*" \
        -x "*.spec.*" \
        -x "*.map" \
        -x "node_modules/.cache/*" \
        -x "node_modules/@types/*" \
        -x "node_modules/typescript/*" \
        -x "node_modules/jest/*" \
        -x "node_modules/ts-jest/*" \
        -x "node_modules/@jest/*" \
        -x "node_modules/fast-check/*" \
        -x "node_modules/eslint*" \
        -x "node_modules/@typescript-eslint/*" \
        -x "*.d.ts" \
        2>/dev/null; then
        
        local size=$(du -h "$package_file" | cut -f1)
        log_success "  Package created: ${package_name}.zip ($size)"
        return 0
    else
        log_error "  Failed to create package for: $package_name"
        return 1
    fi
}

# Upload package to S3
upload_package_to_s3() {
    local package_name=$1
    local bucket_name=$2
    local region=$3
    local package_file="${BACKEND_DIR}/packages/${package_name}.zip"
    local s3_key="lambda/${package_name}.zip"
    
    log_info "Uploading $package_name to S3..."
    
    if [ ! -f "$package_file" ]; then
        log_error "Package file not found: $package_file"
        return 1
    fi
    
    if aws s3 cp "$package_file" "s3://${bucket_name}/${s3_key}" \
        --region "$region" \
        --quiet; then
        log_success "  Uploaded: s3://${bucket_name}/${s3_key}"
        return 0
    else
        log_error "  Failed to upload: $package_name"
        return 1
    fi
}

# Create all deployment packages
create_all_packages() {
    log_info "Creating deployment packages..."
    
    local handler_files
    handler_files=$(get_handler_files)
    
    local total=0
    local success=0
    local failed=0
    
    for handler_file in $handler_files; do
        total=$((total + 1))
        if create_deployment_package "$handler_file"; then
            success=$((success + 1))
        else
            failed=$((failed + 1))
        fi
    done
    
    log_info "Packaging complete: $success/$total succeeded, $failed failed"
    
    if [ $failed -gt 0 ]; then
        log_error "Some packages failed to create"
        return 1
    fi
    
    return 0
}

# Upload all packages to S3
upload_all_packages() {
    local bucket_name=$1
    local region=$2
    
    log_info "Uploading packages to S3 bucket: $bucket_name"
    
    local handler_files
    handler_files=$(get_handler_files)
    
    local total=0
    local success=0
    local failed=0
    
    for handler_file in $handler_files; do
        local package_name=$(get_package_name "$handler_file")
        total=$((total + 1))
        
        if upload_package_to_s3 "$package_name" "$bucket_name" "$region"; then
            success=$((success + 1))
        else
            failed=$((failed + 1))
        fi
    done
    
    log_info "Upload complete: $success/$total succeeded, $failed failed"
    
    if [ $failed -gt 0 ]; then
        log_warning "Some packages failed to upload"
        return 1
    fi
    
    return 0
}


# ============================================================================
# Phase 3: Lambda Function Update (Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6)
# ============================================================================

# Get Lambda function name from manifest
get_lambda_function_name() {
    local handler_name=$1
    local manifest_file=$2
    local environment=$3
    
    # Try to get function name from manifest
    local function_name
    function_name=$(jq -r ".lambda_function_names.value.${handler_name} // .lambda_function_names.${handler_name} // empty" "$manifest_file" 2>/dev/null)
    
    # If not found in manifest, construct default name
    if [ -z "$function_name" ] || [ "$function_name" == "null" ]; then
        function_name="${environment}-crypto-trading-${handler_name}"
    fi
    
    echo "$function_name"
}

# Get environment variables from manifest for Lambda configuration
get_lambda_env_vars() {
    local manifest_file=$1
    local environment=$2
    
    # Build environment variables JSON from manifest
    local env_vars="{}"
    
    # Add DynamoDB table names
    local dynamodb_tables
    dynamodb_tables=$(jq -r '.dynamodb_table_names.value // .dynamodb_table_names // {}' "$manifest_file" 2>/dev/null)
    if [ -n "$dynamodb_tables" ] && [ "$dynamodb_tables" != "null" ] && [ "$dynamodb_tables" != "{}" ]; then
        # Convert table names to environment variables
        env_vars=$(echo "$dynamodb_tables" | jq 'to_entries | map({key: ("DYNAMODB_TABLE_" + (.key | gsub("-"; "_") | ascii_upcase)), value: .value}) | from_entries')
    fi
    
    # Add Redis endpoint
    local redis_endpoint
    redis_endpoint=$(jq -r '.redis_endpoint.value // .redis_endpoint // empty' "$manifest_file" 2>/dev/null)
    if [ -n "$redis_endpoint" ] && [ "$redis_endpoint" != "null" ]; then
        env_vars=$(echo "$env_vars" | jq --arg redis "$redis_endpoint" '. + {REDIS_ENDPOINT: $redis}')
    fi
    
    # Add Redis port
    local redis_port
    redis_port=$(jq -r '.redis_port.value // .redis_port // "6379"' "$manifest_file" 2>/dev/null)
    if [ -n "$redis_port" ] && [ "$redis_port" != "null" ]; then
        env_vars=$(echo "$env_vars" | jq --arg port "$redis_port" '. + {REDIS_PORT: $port}')
    fi
    
    # Add Timestream database
    local timestream_db
    timestream_db=$(jq -r '.timestream_database_name.value // .timestream_database_name // empty' "$manifest_file" 2>/dev/null)
    if [ -n "$timestream_db" ] && [ "$timestream_db" != "null" ]; then
        env_vars=$(echo "$env_vars" | jq --arg db "$timestream_db" '. + {TIMESTREAM_DATABASE: $db}')
    fi
    
    # Add environment
    env_vars=$(echo "$env_vars" | jq --arg env "$environment" '. + {ENVIRONMENT: $env}')
    
    # Add exchange secret ARNs
    local exchange_secrets
    exchange_secrets=$(jq -r '.exchange_secret_arns.value // .exchange_secret_arns // {}' "$manifest_file" 2>/dev/null)
    if [ -n "$exchange_secrets" ] && [ "$exchange_secrets" != "null" ] && [ "$exchange_secrets" != "{}" ]; then
        local secret_arns
        secret_arns=$(echo "$exchange_secrets" | jq 'to_entries | map({key: ("SECRET_ARN_" + (.key | gsub("-"; "_") | ascii_upcase)), value: .value}) | from_entries')
        env_vars=$(echo "$env_vars" "$secret_arns" | jq -s '.[0] * .[1]')
    fi
    
    # Add AI provider secret ARNs
    local ai_secrets
    ai_secrets=$(jq -r '.ai_provider_secret_arns.value // .ai_provider_secret_arns // {}' "$manifest_file" 2>/dev/null)
    if [ -n "$ai_secrets" ] && [ "$ai_secrets" != "null" ] && [ "$ai_secrets" != "{}" ]; then
        local ai_arns
        ai_arns=$(echo "$ai_secrets" | jq 'to_entries | map({key: ("SECRET_ARN_AI_" + (.key | gsub("-"; "_") | ascii_upcase)), value: .value}) | from_entries')
        env_vars=$(echo "$env_vars" "$ai_arns" | jq -s '.[0] * .[1]')
    fi
    
    # Add Cognito configuration for auth handlers
    local cognito_user_pool_id
    cognito_user_pool_id=$(jq -r '.cognito_user_pool_id.value // .cognito_user_pool_id // empty' "$manifest_file" 2>/dev/null)
    if [ -n "$cognito_user_pool_id" ] && [ "$cognito_user_pool_id" != "null" ]; then
        env_vars=$(echo "$env_vars" | jq --arg val "$cognito_user_pool_id" '. + {COGNITO_USER_POOL_ID: $val}')
    fi
    
    local cognito_app_client_id
    cognito_app_client_id=$(jq -r '.cognito_app_client_id.value // .cognito_app_client_id // empty' "$manifest_file" 2>/dev/null)
    if [ -n "$cognito_app_client_id" ] && [ "$cognito_app_client_id" != "null" ]; then
        env_vars=$(echo "$env_vars" | jq --arg val "$cognito_app_client_id" '. + {COGNITO_CLIENT_ID: $val}')
    fi
    
    local cognito_jwks_uri
    cognito_jwks_uri=$(jq -r '.cognito_jwks_uri.value // .cognito_jwks_uri // empty' "$manifest_file" 2>/dev/null)
    if [ -n "$cognito_jwks_uri" ] && [ "$cognito_jwks_uri" != "null" ]; then
        env_vars=$(echo "$env_vars" | jq --arg val "$cognito_jwks_uri" '. + {COGNITO_JWKS_URI: $val}')
    fi
    
    local cognito_issuer
    cognito_issuer=$(jq -r '.cognito_issuer.value // .cognito_issuer // empty' "$manifest_file" 2>/dev/null)
    if [ -n "$cognito_issuer" ] && [ "$cognito_issuer" != "null" ]; then
        env_vars=$(echo "$env_vars" | jq --arg val "$cognito_issuer" '. + {COGNITO_ISSUER: $val}')
    fi
    
    # Add SSO configuration if enabled
    local sso_enabled
    sso_enabled=$(jq -r '.cognito_sso_enabled.value // .cognito_sso_enabled // "false"' "$manifest_file" 2>/dev/null)
    if [ "$sso_enabled" == "true" ]; then
        env_vars=$(echo "$env_vars" | jq '. + {SSO_ENABLED: "true"}')
        
        local cognito_domain_url
        cognito_domain_url=$(jq -r '.cognito_domain_url.value // .cognito_domain_url // empty' "$manifest_file" 2>/dev/null)
        if [ -n "$cognito_domain_url" ] && [ "$cognito_domain_url" != "null" ]; then
            env_vars=$(echo "$env_vars" | jq --arg val "$cognito_domain_url" '. + {COGNITO_DOMAIN_URL: $val}')
        fi
        
        local sso_client_id
        sso_client_id=$(jq -r '.cognito_sso_client_id.value // .cognito_sso_client_id // empty' "$manifest_file" 2>/dev/null)
        if [ -n "$sso_client_id" ] && [ "$sso_client_id" != "null" ]; then
            env_vars=$(echo "$env_vars" | jq --arg val "$sso_client_id" '. + {SSO_CLIENT_ID: $val}')
        fi
        
        local sso_providers_table
        sso_providers_table=$(jq -r '.sso_providers_table_name.value // .sso_providers_table_name // empty' "$manifest_file" 2>/dev/null)
        if [ -n "$sso_providers_table" ] && [ "$sso_providers_table" != "null" ]; then
            env_vars=$(echo "$env_vars" | jq --arg val "$sso_providers_table" '. + {SSO_PROVIDERS_TABLE: $val}')
        fi
        
        local sso_state_table
        sso_state_table=$(jq -r '.sso_state_table_name.value // .sso_state_table_name // empty' "$manifest_file" 2>/dev/null)
        if [ -n "$sso_state_table" ] && [ "$sso_state_table" != "null" ]; then
            env_vars=$(echo "$env_vars" | jq --arg val "$sso_state_table" '. + {SSO_STATE_TABLE: $val}')
        fi
    fi
    
    # Add auth audit table
    local auth_audit_table
    auth_audit_table=$(jq -r '.auth_audit_table_name.value // .auth_audit_table_name // empty' "$manifest_file" 2>/dev/null)
    if [ -n "$auth_audit_table" ] && [ "$auth_audit_table" != "null" ]; then
        env_vars=$(echo "$env_vars" | jq --arg val "$auth_audit_table" '. + {AUTH_AUDIT_TABLE: $val}')
    fi
    
    echo "$env_vars"
}

# Update a single Lambda function
update_lambda_function() {
    local package_name=$1
    local function_name=$2
    local bucket_name=$3
    local region=$4
    local env_vars=$5
    
    local s3_key="lambda/${package_name}.zip"
    
    log_info "Updating Lambda function: $function_name"
    
    # Update function code from S3
    if ! aws lambda update-function-code \
        --function-name "$function_name" \
        --s3-bucket "$bucket_name" \
        --s3-key "$s3_key" \
        --region "$region" \
        --output text \
        --query 'FunctionArn' 2>/dev/null; then
        log_error "  Failed to update function code: $function_name"
        return 1
    fi
    
    log_success "  Code updated for: $function_name"
    
    # Wait for function to be ready
    log_info "  Waiting for function to be ready..."
    if ! aws lambda wait function-updated \
        --function-name "$function_name" \
        --region "$region" 2>/dev/null; then
        log_warning "  Timeout waiting for function update"
    fi
    
    # Update environment variables if provided
    if [ -n "$env_vars" ] && [ "$env_vars" != "{}" ]; then
        log_info "  Configuring environment variables..."
        if ! aws lambda update-function-configuration \
            --function-name "$function_name" \
            --environment "Variables=$env_vars" \
            --region "$region" \
            --output text \
            --query 'FunctionArn' 2>/dev/null; then
            log_warning "  Failed to update environment variables (may not be critical)"
        else
            log_success "  Environment variables configured"
        fi
        
        # Wait for configuration update
        aws lambda wait function-updated \
            --function-name "$function_name" \
            --region "$region" 2>/dev/null || true
    fi
    
    return 0
}

# Publish new version for a Lambda function
publish_lambda_version() {
    local function_name=$1
    local region=$2
    
    log_info "  Publishing new version..."
    
    local version
    version=$(aws lambda publish-version \
        --function-name "$function_name" \
        --region "$region" \
        --output text \
        --query 'Version' 2>/dev/null)
    
    if [ -n "$version" ]; then
        log_success "  Published version: $version"
        echo "$version"
        return 0
    else
        log_warning "  Failed to publish version"
        return 1
    fi
}

# Update Lambda alias to point to new version
update_lambda_alias() {
    local function_name=$1
    local version=$2
    local region=$3
    local alias_name=${4:-"live"}
    
    log_info "  Updating alias '$alias_name' to version $version..."
    
    # Check if alias exists
    if aws lambda get-alias \
        --function-name "$function_name" \
        --name "$alias_name" \
        --region "$region" \
        --output text 2>/dev/null; then
        
        # Update existing alias
        if aws lambda update-alias \
            --function-name "$function_name" \
            --name "$alias_name" \
            --function-version "$version" \
            --region "$region" \
            --output text \
            --query 'AliasArn' 2>/dev/null; then
            log_success "  Alias '$alias_name' updated to version $version"
            return 0
        fi
    else
        # Create new alias
        if aws lambda create-alias \
            --function-name "$function_name" \
            --name "$alias_name" \
            --function-version "$version" \
            --region "$region" \
            --output text \
            --query 'AliasArn' 2>/dev/null; then
            log_success "  Alias '$alias_name' created pointing to version $version"
            return 0
        fi
    fi
    
    log_warning "  Failed to update alias"
    return 1
}


# Update all Lambda functions
update_all_lambda_functions() {
    local environment=$1
    local manifest_file=$2
    local bucket_name=$3
    local region=$4
    
    log_info "Updating Lambda functions..."
    
    # Get environment variables for all functions
    local env_vars
    env_vars=$(get_lambda_env_vars "$manifest_file" "$environment")
    
    local handler_files
    handler_files=$(get_handler_files)
    
    local total=0
    
    for handler_file in $handler_files; do
        local package_name=$(get_package_name "$handler_file")
        local function_name
        function_name=$(get_lambda_function_name "$package_name" "$manifest_file" "$environment")
        
        total=$((total + 1))
        
        echo ""
        log_info "[$total] Processing: $package_name -> $function_name"
        
        # Check if function exists
        if ! aws lambda get-function \
            --function-name "$function_name" \
            --region "$region" \
            --output text 2>/dev/null; then
            log_warning "  Function does not exist: $function_name (skipping)"
            SKIPPED_FUNCTIONS+=("$package_name")
            continue
        fi
        
        # Update function
        if update_lambda_function "$package_name" "$function_name" "$bucket_name" "$region" "$env_vars"; then
            # Publish new version
            local version
            version=$(publish_lambda_version "$function_name" "$region")
            
            if [ -n "$version" ]; then
                # Update alias
                update_lambda_alias "$function_name" "$version" "$region" "live"
            fi
            
            DEPLOYED_FUNCTIONS+=("$package_name")
        else
            FAILED_FUNCTIONS+=("$package_name")
        fi
    done
    
    echo ""
    log_info "Lambda update complete"
    log_info "  Deployed: ${#DEPLOYED_FUNCTIONS[@]}"
    log_info "  Failed: ${#FAILED_FUNCTIONS[@]}"
    log_info "  Skipped: ${#SKIPPED_FUNCTIONS[@]}"
    
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
    
    log_info "Starting backend deployment for: $ENVIRONMENT"
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
    bucket_name=$(jq -r '.lambda_deployment_bucket_id.value // .lambda_deployment_bucket_id // empty' "$manifest_file")
    if [ -z "$bucket_name" ] || [ "$bucket_name" == "null" ]; then
        log_error "Lambda deployment bucket not found in manifest"
        exit 1
    fi
    
    local region
    region=$(jq -r '.aws_region.value // .aws_region // "eu-central-1"' "$manifest_file")
    
    log_info "Lambda deployment bucket: $bucket_name"
    log_info "AWS Region: $region"
    
    # Phase 1: Install dependencies
    echo ""
    log_info "=== Phase 1: Install Dependencies ==="
    install_dependencies
    
    # Phase 2: Build TypeScript
    echo ""
    log_info "=== Phase 2: Build TypeScript ==="
    build_typescript
    
    # Phase 3: Run tests
    echo ""
    log_info "=== Phase 3: Run Tests ==="
    run_tests "$SKIP_TESTS"
    
    # Phase 4: Create deployment packages
    echo ""
    log_info "=== Phase 4: Create Deployment Packages ==="
    create_all_packages
    
    # Phase 5: Upload packages to S3
    echo ""
    log_info "=== Phase 5: Upload Packages to S3 ==="
    upload_all_packages "$bucket_name" "$region"
    
    # Phase 6: Update Lambda functions
    echo ""
    log_info "=== Phase 6: Update Lambda Functions ==="
    update_all_lambda_functions "$ENVIRONMENT" "$manifest_file" "$bucket_name" "$region"
    
    # Print summary
    echo ""
    log_info "=== Deployment Summary ==="
    echo ""
    
    if [ ${#DEPLOYED_FUNCTIONS[@]} -gt 0 ]; then
        log_success "Successfully deployed functions:"
        for func in "${DEPLOYED_FUNCTIONS[@]}"; do
            echo "  ✓ $func"
        done
    fi
    
    if [ ${#FAILED_FUNCTIONS[@]} -gt 0 ]; then
        echo ""
        log_error "Failed functions:"
        for func in "${FAILED_FUNCTIONS[@]}"; do
            echo "  ✗ $func"
        done
    fi
    
    if [ ${#SKIPPED_FUNCTIONS[@]} -gt 0 ]; then
        echo ""
        log_warning "Skipped functions (not found in AWS):"
        for func in "${SKIPPED_FUNCTIONS[@]}"; do
            echo "  ⊘ $func"
        done
    fi
    
    echo ""
    
    # Determine exit status
    if [ ${#FAILED_FUNCTIONS[@]} -gt 0 ]; then
        log_warning "Backend deployment completed with some failures"
        log_info "Review failed functions and check CloudWatch logs"
        # Don't exit with error - allow deployment to continue
        # Individual function failures are logged but not fatal
    else
        log_success "Backend deployment completed successfully"
    fi
    
    # Clean up packages directory
    log_info "Cleaning up temporary packages..."
    rm -rf "${BACKEND_DIR}/packages"
    
    log_info "Next steps:"
    echo "  1. Check CloudWatch logs for any errors"
    echo "  2. Run health checks: ./validate-deployment.sh $ENVIRONMENT"
    echo "  3. Continue with secrets population: ./populate-secrets.sh $ENVIRONMENT"
}

# Run main function
main "$@"
