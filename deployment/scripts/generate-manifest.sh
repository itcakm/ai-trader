#!/bin/bash
#
# Manifest Generation Utility
# AI-Assisted Crypto Trading System
#
# Usage: ./generate-manifest.sh <environment> [--validate-only]
#
# Arguments:
#   environment      Target environment (test|production)
#   --validate-only  Only validate existing manifest, don't regenerate
#
# Requirements: 1.3, 1.6

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
    echo "Usage: $0 <environment> [--validate-only]"
    echo ""
    echo "Arguments:"
    echo "  environment      Target environment (test|production)"
    echo "  --validate-only  Only validate existing manifest"
    echo ""
    echo "Examples:"
    echo "  $0 test                    # Generate manifest for test"
    echo "  $0 production              # Generate manifest for production"
    echo "  $0 test --validate-only    # Validate test manifest"
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

# Required fields in the manifest
REQUIRED_FIELDS=(
    "environment"
    "aws_region"
    "account_id"
    "vpc_id"
    "public_subnet_ids"
    "private_subnet_ids"
    "api_gateway_endpoint"
    "frontend_assets_bucket_id"
    "lambda_deployment_bucket_id"
    "lambda_function_names"
    "dynamodb_table_names"
    "exchange_secret_arns"
    "ai_provider_secret_arns"
    "cognito_user_pool_id"
    "cognito_app_client_id"
)

# Optional fields (warning if missing, not error)
OPTIONAL_FIELDS=(
    "redis_endpoint"
    "redis_port"
    "timestream_database_name"
    "step_functions_state_machine_arns"
    "eventbridge_event_bus_arn"
    "cloudfront_distribution_id"
    "cloudfront_domain_name"
    "cognito_user_pool_arn"
    "cognito_jwks_uri"
    "cognito_issuer"
    "cognito_sso_enabled"
    "cognito_domain_url"
    "cognito_sso_client_id"
    "sso_providers_table_name"
    "sso_state_table_name"
    "auth_audit_table_name"
)

# Parse Terraform output JSON and extract values
parse_terraform_output() {
    local infra_dir=$1
    local environment=$2
    local manifest_dir="${PROJECT_ROOT}/deployment/manifests"
    local manifest_file="${manifest_dir}/${environment}-manifest.json"
    
    log_info "Parsing Terraform outputs..."
    
    cd "$infra_dir"
    
    # Get raw Terraform outputs
    local raw_outputs
    if ! raw_outputs=$(terraform output -json 2>/dev/null); then
        log_error "Failed to get Terraform outputs"
        log_error "Make sure Terraform has been applied successfully"
        exit 1
    fi
    
    # Create manifest directory if it doesn't exist
    mkdir -p "$manifest_dir"
    
    # Generate timestamp
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Transform outputs to a cleaner format
    # Extract .value from each output and add metadata
    local manifest
    manifest=$(echo "$raw_outputs" | jq --arg env "$environment" --arg ts "$timestamp" '
        # Transform each key to extract just the value
        to_entries | map(
            if .value | type == "object" and has("value") then
                {key: .key, value: .value.value}
            else
                {key: .key, value: .value}
            end
        ) | from_entries |
        # Add metadata
        . + {
            "_metadata": {
                "environment": $env,
                "generated_at": $ts,
                "generator": "generate-manifest.sh",
                "version": "1.0.0"
            }
        }
    ')
    
    # Save manifest
    echo "$manifest" > "$manifest_file"
    
    log_success "Manifest generated: $manifest_file"
    
    return 0
}

# Validate manifest contains all required fields
validate_manifest() {
    local environment=$1
    local manifest_file="${PROJECT_ROOT}/deployment/manifests/${environment}-manifest.json"
    
    log_info "Validating manifest..."
    
    if [ ! -f "$manifest_file" ]; then
        log_error "Manifest file not found: $manifest_file"
        exit 1
    fi
    
    # Check if file is valid JSON
    if ! jq empty "$manifest_file" 2>/dev/null; then
        log_error "Manifest is not valid JSON"
        exit 1
    fi
    
    local missing_required=()
    local missing_optional=()
    local validation_passed=true
    
    # Check required fields
    for field in "${REQUIRED_FIELDS[@]}"; do
        local value
        value=$(jq -r ".$field // empty" "$manifest_file")
        
        if [ -z "$value" ] || [ "$value" == "null" ]; then
            # Also check for .value nested structure (raw terraform output)
            value=$(jq -r ".${field}.value // empty" "$manifest_file")
            if [ -z "$value" ] || [ "$value" == "null" ]; then
                missing_required+=("$field")
                validation_passed=false
            fi
        fi
    done
    
    # Check optional fields
    for field in "${OPTIONAL_FIELDS[@]}"; do
        local value
        value=$(jq -r ".$field // empty" "$manifest_file")
        
        if [ -z "$value" ] || [ "$value" == "null" ]; then
            value=$(jq -r ".${field}.value // empty" "$manifest_file")
            if [ -z "$value" ] || [ "$value" == "null" ]; then
                missing_optional+=("$field")
            fi
        fi
    done
    
    # Report results
    if [ ${#missing_required[@]} -ne 0 ]; then
        log_error "Missing required fields:"
        for field in "${missing_required[@]}"; do
            log_error "  - $field"
        done
    fi
    
    if [ ${#missing_optional[@]} -ne 0 ]; then
        log_warning "Missing optional fields:"
        for field in "${missing_optional[@]}"; do
            log_warning "  - $field"
        done
    fi
    
    if [ "$validation_passed" = true ]; then
        log_success "Manifest validation passed"
        return 0
    else
        log_error "Manifest validation failed"
        return 1
    fi
}

# Extract specific resource identifiers
extract_resource_ids() {
    local environment=$1
    local manifest_file="${PROJECT_ROOT}/deployment/manifests/${environment}-manifest.json"
    
    log_info "Extracting resource identifiers..."
    
    echo ""
    echo "=== Resource Identifiers ==="
    echo ""
    
    # VPC Resources
    echo "VPC Resources:"
    echo "  VPC ID: $(jq -r '.vpc_id // .vpc_id.value // "N/A"' "$manifest_file")"
    echo "  Public Subnets: $(jq -r '(.public_subnet_ids // .public_subnet_ids.value // []) | join(", ")' "$manifest_file")"
    echo "  Private Subnets: $(jq -r '(.private_subnet_ids // .private_subnet_ids.value // []) | join(", ")' "$manifest_file")"
    echo ""
    
    # API Resources
    echo "API Resources:"
    echo "  API Gateway Endpoint: $(jq -r '.api_gateway_endpoint // .api_gateway_endpoint.value // "N/A"' "$manifest_file")"
    echo "  Stage Invoke URL: $(jq -r '.api_gateway_stage_invoke_url // .api_gateway_stage_invoke_url.value // "N/A"' "$manifest_file")"
    echo ""
    
    # Storage Resources
    echo "Storage Resources:"
    echo "  Frontend Bucket: $(jq -r '.frontend_assets_bucket_id // .frontend_assets_bucket_id.value // "N/A"' "$manifest_file")"
    echo "  Lambda Bucket: $(jq -r '.lambda_deployment_bucket_id // .lambda_deployment_bucket_id.value // "N/A"' "$manifest_file")"
    echo ""
    
    # Lambda Functions
    echo "Lambda Functions:"
    local functions=$(jq -r '(.lambda_function_names // .lambda_function_names.value // {}) | to_entries[] | "  \(.key): \(.value)"' "$manifest_file" 2>/dev/null)
    if [ -n "$functions" ]; then
        echo "$functions"
    else
        echo "  No Lambda functions found"
    fi
    echo ""
    
    # DynamoDB Tables
    echo "DynamoDB Tables:"
    local tables=$(jq -r '(.dynamodb_table_names // .dynamodb_table_names.value // {}) | to_entries[] | "  \(.key): \(.value)"' "$manifest_file" 2>/dev/null)
    if [ -n "$tables" ]; then
        echo "$tables"
    else
        echo "  No DynamoDB tables found"
    fi
    echo ""
    
    # Secrets
    echo "Secrets Manager:"
    local exchange_secrets=$(jq -r '(.exchange_secret_arns // .exchange_secret_arns.value // {}) | keys | join(", ")' "$manifest_file" 2>/dev/null)
    echo "  Exchange Secrets: ${exchange_secrets:-N/A}"
    local ai_secrets=$(jq -r '(.ai_provider_secret_arns // .ai_provider_secret_arns.value // {}) | keys | join(", ")' "$manifest_file" 2>/dev/null)
    echo "  AI Provider Secrets: ${ai_secrets:-N/A}"
    echo ""
    
    # Cache
    echo "Cache Resources:"
    echo "  Redis Endpoint: $(jq -r '.redis_endpoint // .redis_endpoint.value // "N/A"' "$manifest_file")"
    echo "  Redis Port: $(jq -r '.redis_port // .redis_port.value // "N/A"' "$manifest_file")"
    echo ""
    
    # Time Series
    echo "Time Series:"
    echo "  Timestream Database: $(jq -r '.timestream_database_name // .timestream_database_name.value // "N/A"' "$manifest_file")"
    echo ""
    
    # Cognito Authentication Resources
    echo "Cognito Authentication:"
    echo "  User Pool ID: $(jq -r '.cognito_user_pool_id // .cognito_user_pool_id.value // "N/A"' "$manifest_file")"
    echo "  App Client ID: $(jq -r '.cognito_app_client_id // .cognito_app_client_id.value // "N/A"' "$manifest_file")"
    echo "  User Pool ARN: $(jq -r '.cognito_user_pool_arn // .cognito_user_pool_arn.value // "N/A"' "$manifest_file")"
    echo "  JWKS URI: $(jq -r '.cognito_jwks_uri // .cognito_jwks_uri.value // "N/A"' "$manifest_file")"
    echo "  Issuer: $(jq -r '.cognito_issuer // .cognito_issuer.value // "N/A"' "$manifest_file")"
    echo ""
    
    # SSO Configuration
    local sso_enabled=$(jq -r '.cognito_sso_enabled // .cognito_sso_enabled.value // "false"' "$manifest_file")
    echo "SSO Configuration:"
    echo "  SSO Enabled: $sso_enabled"
    if [ "$sso_enabled" == "true" ]; then
        echo "  Domain URL: $(jq -r '.cognito_domain_url // .cognito_domain_url.value // "N/A"' "$manifest_file")"
        echo "  SSO Client ID: $(jq -r '.cognito_sso_client_id // .cognito_sso_client_id.value // "N/A"' "$manifest_file")"
        echo "  Providers Table: $(jq -r '.sso_providers_table_name // .sso_providers_table_name.value // "N/A"' "$manifest_file")"
        echo "  State Table: $(jq -r '.sso_state_table_name // .sso_state_table_name.value // "N/A"' "$manifest_file")"
    fi
    echo ""
    
    # Auth Audit
    echo "Auth Audit:"
    echo "  Audit Table: $(jq -r '.auth_audit_table_name // .auth_audit_table_name.value // "N/A"' "$manifest_file")"
    echo ""
}

# Get a specific value from manifest
get_manifest_value() {
    local environment=$1
    local key=$2
    local manifest_file="${PROJECT_ROOT}/deployment/manifests/${environment}-manifest.json"
    
    if [ ! -f "$manifest_file" ]; then
        echo ""
        return 1
    fi
    
    # Try direct access first, then .value nested
    local value
    value=$(jq -r ".$key // empty" "$manifest_file")
    
    if [ -z "$value" ] || [ "$value" == "null" ]; then
        value=$(jq -r ".${key}.value // empty" "$manifest_file")
    fi
    
    echo "$value"
}

# Main function
main() {
    # Parse arguments
    if [ $# -lt 1 ]; then
        log_error "Environment parameter is required"
        usage
    fi
    
    local environment=$1
    local validate_only=false
    
    # Handle help flag first
    if [[ "$environment" == "-h" || "$environment" == "--help" ]]; then
        usage
    fi
    
    shift
    while [[ $# -gt 0 ]]; do
        case $1 in
            --validate-only)
                validate_only=true
                shift
                ;;
            --extract)
                validate_environment "$environment"
                extract_resource_ids "$environment"
                exit 0
                ;;
            --get)
                if [ -z "$2" ]; then
                    log_error "--get requires a key argument"
                    exit 1
                fi
                validate_environment "$environment"
                get_manifest_value "$environment" "$2"
                exit 0
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
    
    # Validate environment
    validate_environment "$environment"
    
    local infra_dir="${PROJECT_ROOT}/infrastructure/environments/${environment}"
    local manifest_file="${PROJECT_ROOT}/deployment/manifests/${environment}-manifest.json"
    
    if [ "$validate_only" = true ]; then
        # Only validate existing manifest
        if [ ! -f "$manifest_file" ]; then
            log_error "Manifest file not found: $manifest_file"
            log_error "Run without --validate-only to generate manifest"
            exit 1
        fi
        
        validate_manifest "$environment"
        exit $?
    fi
    
    # Check infrastructure directory exists
    if [ ! -d "$infra_dir" ]; then
        log_error "Infrastructure directory not found: $infra_dir"
        exit 1
    fi
    
    # Check Terraform state exists
    if [ ! -f "${infra_dir}/.terraform/terraform.tfstate" ] && [ ! -f "${infra_dir}/terraform.tfstate" ]; then
        # Check for remote state
        if ! (cd "$infra_dir" && terraform state list >/dev/null 2>&1); then
            log_error "No Terraform state found"
            log_error "Run 'terraform apply' first to create infrastructure"
            exit 1
        fi
    fi
    
    log_info "Generating manifest for environment: $environment"
    
    # Parse Terraform outputs
    parse_terraform_output "$infra_dir" "$environment"
    
    # Validate the generated manifest
    validate_manifest "$environment"
    
    # Extract and display resource IDs
    extract_resource_ids "$environment"
    
    log_success "Manifest generation completed"
    echo ""
    log_info "Manifest saved to: $manifest_file"
}

# Run main function
main "$@"
