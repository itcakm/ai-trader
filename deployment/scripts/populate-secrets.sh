#!/bin/bash
#
# Secrets Population Script
# AI-Assisted Crypto Trading System
#
# Usage: ./populate-secrets.sh <environment>
#
# Arguments:
#   environment    Target environment (test|production)
#
# This script securely populates AWS Secrets Manager with:
# - Exchange API credentials (Binance, Coinbase, Kraken, OKX, BSDEX, BISON, FINOA, BYBIT)
# - AI provider API keys (Gemini, OpenAI, DeepSeek)
#
# Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7

set -e

# Script directory for relative paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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

log_secure() {
    echo -e "${CYAN}[SECURE]${NC} $1"
}

# Usage information
usage() {
    echo "Usage: $0 <environment>"
    echo ""
    echo "Arguments:"
    echo "  environment    Target environment (test|production)"
    echo ""
    echo "Examples:"
    echo "  $0 test        # Populate secrets for test environment"
    echo "  $0 production  # Populate secrets for production environment"
    echo ""
    echo "Security Notes:"
    echo "  - Credentials are entered securely (hidden input)"
    echo "  - Credentials are NOT logged or displayed"
    echo "  - All secrets are encrypted with KMS"
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

# Tracking arrays
UPDATED_SECRETS=()
SKIPPED_SECRETS=()
FAILED_SECRETS=()
FUNCTIONS_TO_REFRESH=()

# ============================================================================
# Credential Validation Functions (Requirement 4.3)
# ============================================================================

# Validate API key format (basic validation)
validate_api_key() {
    local key=$1
    local provider=$2
    
    # Check if empty
    if [ -z "$key" ]; then
        return 1
    fi
    
    # Check minimum length (most API keys are at least 16 characters)
    if [ ${#key} -lt 8 ]; then
        log_error "API key too short (minimum 8 characters)"
        return 1
    fi
    
    # Check for placeholder values
    if [[ "$key" == *"<"* ]] || [[ "$key" == *">"* ]]; then
        log_error "API key appears to contain placeholder characters"
        return 1
    fi
    
    # Provider-specific validation
    case $provider in
        binance)
            # Binance API keys are 64 characters
            if [ ${#key} -lt 32 ]; then
                log_warning "Binance API key seems short (expected ~64 chars)"
            fi
            ;;
        coinbase)
            # Coinbase API keys vary in format
            ;;
        openai)
            # OpenAI keys start with sk-
            if [[ ! "$key" =~ ^sk- ]]; then
                log_warning "OpenAI API key typically starts with 'sk-'"
            fi
            ;;
        *)
            # Generic validation passed
            ;;
    esac
    
    return 0
}

# Validate API secret format
validate_api_secret() {
    local secret=$1
    local provider=$2
    
    # Check if empty
    if [ -z "$secret" ]; then
        return 1
    fi
    
    # Check minimum length
    if [ ${#secret} -lt 8 ]; then
        log_error "API secret too short (minimum 8 characters)"
        return 1
    fi
    
    # Check for placeholder values
    if [[ "$secret" == *"<"* ]] || [[ "$secret" == *">"* ]]; then
        log_error "API secret appears to contain placeholder characters"
        return 1
    fi
    
    return 0
}

# ============================================================================
# Secret Storage Functions (Requirement 4.4)
# ============================================================================

# Store secret in AWS Secrets Manager
store_secret() {
    local secret_arn=$1
    local secret_value=$2
    local region=$3
    
    # Use put-secret-value to update the secret
    if aws secretsmanager put-secret-value \
        --secret-id "$secret_arn" \
        --secret-string "$secret_value" \
        --region "$region" \
        --output text \
        --query 'ARN' 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Get secret ARN from manifest
get_secret_arn() {
    local manifest_file=$1
    local secret_type=$2  # "exchange" or "ai_provider"
    local provider_name=$3
    
    local arn=""
    
    if [ "$secret_type" == "exchange" ]; then
        arn=$(jq -r ".exchange_secret_arns.value.${provider_name} // .exchange_secret_arns.${provider_name} // empty" "$manifest_file" 2>/dev/null)
    elif [ "$secret_type" == "ai_provider" ]; then
        arn=$(jq -r ".ai_provider_secret_arns.value.${provider_name} // .ai_provider_secret_arns.${provider_name} // empty" "$manifest_file" 2>/dev/null)
    fi
    
    # Return empty if null or not found
    if [ "$arn" == "null" ] || [ -z "$arn" ]; then
        echo ""
    else
        echo "$arn"
    fi
}

# ============================================================================
# Exchange Credential Collection (Requirement 4.1)
# ============================================================================

# Collect and store exchange credentials
collect_exchange_credentials() {
    local exchange=$1
    local secret_arn=$2
    local region=$3
    
    echo ""
    local exchange_upper
    exchange_upper=$(echo "$exchange" | tr '[:lower:]' '[:upper:]')
    log_info "=== ${exchange_upper} Exchange Credentials ==="
    echo ""
    
    # Prompt for API key
    echo -n "Enter API Key for ${exchange} (or press Enter to skip): "
    read -s API_KEY
    echo ""
    
    # Check if skipped
    if [ -z "$API_KEY" ]; then
        log_warning "Skipped ${exchange} credentials"
        SKIPPED_SECRETS+=("${exchange}")
        return 0
    fi
    
    # Validate API key
    if ! validate_api_key "$API_KEY" "$exchange"; then
        log_error "Invalid API key format for ${exchange}"
        FAILED_SECRETS+=("${exchange}")
        # Clear sensitive data
        unset API_KEY
        return 1
    fi
    
    # Prompt for API secret
    echo -n "Enter API Secret for ${exchange}: "
    read -s API_SECRET
    echo ""
    
    # Validate API secret
    if ! validate_api_secret "$API_SECRET" "$exchange"; then
        log_error "Invalid API secret format for ${exchange}"
        FAILED_SECRETS+=("${exchange}")
        # Clear sensitive data
        unset API_KEY API_SECRET
        return 1
    fi
    
    # Handle OKX passphrase (special case)
    local PASSPHRASE=""
    if [ "$exchange" == "okx" ]; then
        echo -n "Enter Passphrase for ${exchange}: "
        read -s PASSPHRASE
        echo ""
        
        if [ -z "$PASSPHRASE" ]; then
            log_error "OKX requires a passphrase"
            FAILED_SECRETS+=("${exchange}")
            unset API_KEY API_SECRET
            return 1
        fi
    fi
    
    # Build secret JSON
    local secret_json
    if [ -n "$PASSPHRASE" ]; then
        secret_json=$(jq -n \
            --arg key "$API_KEY" \
            --arg secret "$API_SECRET" \
            --arg pass "$PASSPHRASE" \
            '{apiKey: $key, apiSecret: $secret, passphrase: $pass}')
    else
        secret_json=$(jq -n \
            --arg key "$API_KEY" \
            --arg secret "$API_SECRET" \
            '{apiKey: $key, apiSecret: $secret}')
    fi
    
    # Clear sensitive variables immediately after use
    unset API_KEY API_SECRET PASSPHRASE
    
    # Store in Secrets Manager
    log_secure "Storing ${exchange} credentials in Secrets Manager..."
    
    if store_secret "$secret_arn" "$secret_json" "$region"; then
        log_success "${exchange} credentials stored successfully"
        UPDATED_SECRETS+=("${exchange}")
        
        # Track functions that need refresh
        FUNCTIONS_TO_REFRESH+=("exchange-${exchange}")
    else
        log_error "Failed to store ${exchange} credentials"
        FAILED_SECRETS+=("${exchange}")
    fi
    
    # Clear secret JSON
    unset secret_json
    
    return 0
}

# ============================================================================
# AI Provider Credential Collection (Requirement 4.2)
# ============================================================================

# Collect and store AI provider credentials
collect_ai_provider_credentials() {
    local provider=$1
    local secret_arn=$2
    local region=$3
    
    echo ""
    local provider_upper
    provider_upper=$(echo "$provider" | tr '[:lower:]' '[:upper:]')
    log_info "=== ${provider_upper} AI Provider API Key ==="
    echo ""
    
    # Prompt for API key
    echo -n "Enter API Key for ${provider} (or press Enter to skip): "
    read -s API_KEY
    echo ""
    
    # Check if skipped
    if [ -z "$API_KEY" ]; then
        log_warning "Skipped ${provider} API key"
        SKIPPED_SECRETS+=("ai-${provider}")
        return 0
    fi
    
    # Validate API key
    if ! validate_api_key "$API_KEY" "$provider"; then
        log_error "Invalid API key format for ${provider}"
        FAILED_SECRETS+=("ai-${provider}")
        unset API_KEY
        return 1
    fi
    
    # Build secret JSON
    local secret_json
    secret_json=$(jq -n --arg key "$API_KEY" '{apiKey: $key}')
    
    # Clear sensitive variable immediately
    unset API_KEY
    
    # Store in Secrets Manager
    log_secure "Storing ${provider} API key in Secrets Manager..."
    
    if store_secret "$secret_arn" "$secret_json" "$region"; then
        log_success "${provider} API key stored successfully"
        UPDATED_SECRETS+=("ai-${provider}")
        
        # Track functions that need refresh
        FUNCTIONS_TO_REFRESH+=("ai-${provider}")
    else
        log_error "Failed to store ${provider} API key"
        FAILED_SECRETS+=("ai-${provider}")
    fi
    
    # Clear secret JSON
    unset secret_json
    
    return 0
}

# ============================================================================
# Lambda Refresh Functions (Requirements 4.6, 4.7)
# ============================================================================

# Get Lambda functions that use a specific secret type
get_functions_for_secret_type() {
    local secret_type=$1
    local manifest_file=$2
    
    # Map secret types to Lambda function patterns
    case $secret_type in
        exchange-*)
            # Exchange-related functions
            echo "exchange-connections exchange-orders exchange-positions exchange-config"
            ;;
        ai-*)
            # AI-related functions
            echo "ai-traces analysis ensemble"
            ;;
        *)
            echo ""
            ;;
    esac
}

# Refresh Lambda function to pick up new secrets
refresh_lambda_function() {
    local function_name=$1
    local region=$2
    
    log_info "Refreshing Lambda function: $function_name"
    
    # Update function configuration with a dummy environment variable change
    # This forces Lambda to fetch fresh secrets on next invocation
    local timestamp=$(date +%s)
    
    # Get current environment variables
    local current_env
    current_env=$(aws lambda get-function-configuration \
        --function-name "$function_name" \
        --region "$region" \
        --query 'Environment.Variables' \
        --output json 2>/dev/null)
    
    if [ -z "$current_env" ] || [ "$current_env" == "null" ]; then
        current_env="{}"
    fi
    
    # Add/update SECRETS_REFRESH_TIMESTAMP to force refresh
    local updated_env
    updated_env=$(echo "$current_env" | jq --arg ts "$timestamp" '. + {SECRETS_REFRESH_TIMESTAMP: $ts}')
    
    # Update function configuration
    if aws lambda update-function-configuration \
        --function-name "$function_name" \
        --environment "Variables=$updated_env" \
        --region "$region" \
        --output text \
        --query 'FunctionArn' 2>/dev/null; then
        log_success "  Refreshed: $function_name"
        return 0
    else
        log_warning "  Failed to refresh: $function_name (function may not exist)"
        return 1
    fi
}

# Refresh all Lambda functions that need new secrets
refresh_lambda_functions() {
    local environment=$1
    local manifest_file=$2
    local region=$3
    
    if [ ${#UPDATED_SECRETS[@]} -eq 0 ]; then
        log_info "No secrets were updated, skipping Lambda refresh"
        return 0
    fi
    
    echo ""
    log_info "=== Refreshing Lambda Functions ==="
    echo ""
    
    # Get unique function patterns to refresh
    local functions_to_refresh=()
    
    for secret_type in "${UPDATED_SECRETS[@]}"; do
        local funcs
        funcs=$(get_functions_for_secret_type "$secret_type" "$manifest_file")
        for func in $funcs; do
            # Add to array if not already present
            if [[ ! " ${functions_to_refresh[*]} " =~ " ${func} " ]]; then
                functions_to_refresh+=("$func")
            fi
        done
    done
    
    # Refresh each function
    local refreshed=0
    local failed=0
    
    for func_pattern in "${functions_to_refresh[@]}"; do
        local function_name="${environment}-crypto-trading-${func_pattern}"
        
        if refresh_lambda_function "$function_name" "$region"; then
            refreshed=$((refreshed + 1))
        else
            failed=$((failed + 1))
        fi
    done
    
    echo ""
    log_info "Lambda refresh complete: $refreshed refreshed, $failed failed"
    
    return 0
}

# Verify Lambda functions can access secrets
verify_secret_access() {
    local environment=$1
    local manifest_file=$2
    local region=$3
    
    echo ""
    log_info "=== Verifying Secret Access ==="
    echo ""
    
    # For each updated secret, verify the corresponding Lambda can access it
    local verified=0
    local failed=0
    
    for secret_type in "${UPDATED_SECRETS[@]}"; do
        local secret_arn=""
        
        if [[ "$secret_type" == ai-* ]]; then
            local provider=${secret_type#ai-}
            secret_arn=$(get_secret_arn "$manifest_file" "ai_provider" "$provider")
        else
            secret_arn=$(get_secret_arn "$manifest_file" "exchange" "$secret_type")
        fi
        
        if [ -n "$secret_arn" ]; then
            # Verify secret exists and is accessible
            if aws secretsmanager describe-secret \
                --secret-id "$secret_arn" \
                --region "$region" \
                --output text \
                --query 'ARN' 2>/dev/null; then
                log_success "  Verified: $secret_type"
                verified=$((verified + 1))
            else
                log_error "  Cannot access: $secret_type"
                failed=$((failed + 1))
            fi
        fi
    done
    
    echo ""
    log_info "Verification complete: $verified verified, $failed failed"
    
    return 0
}

# ============================================================================
# Main Function
# ============================================================================

main() {
    # Parse arguments
    ENVIRONMENT=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            test|production)
                ENVIRONMENT="$1"
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
    local env_upper
    env_upper=$(echo "$ENVIRONMENT" | tr '[:lower:]' '[:upper:]')
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Secrets Population - ${env_upper}${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    log_warning "SECURITY NOTICE:"
    echo "  - You will be prompted to enter sensitive credentials"
    echo "  - Input will be HIDDEN (not displayed on screen)"
    echo "  - Credentials are NOT logged or stored locally"
    echo "  - All secrets are encrypted with KMS in AWS"
    echo ""
    
    # Check manifest file exists
    local manifest_file="${PROJECT_ROOT}/deployment/manifests/${ENVIRONMENT}-manifest.json"
    if [ ! -f "$manifest_file" ]; then
        log_error "Manifest file not found: $manifest_file"
        log_error "Run deploy-infrastructure.sh first to create the manifest"
        exit 1
    fi
    
    # Get AWS region from manifest
    local region
    region=$(jq -r '.aws_region.value // .aws_region // "eu-central-1"' "$manifest_file")
    
    log_info "Environment: $ENVIRONMENT"
    log_info "AWS Region: $region"
    log_info "Manifest: $manifest_file"
    
    # ========================================================================
    # Exchange Credentials (Requirement 4.1)
    # ========================================================================
    
    echo ""
    log_info "=========================================="
    log_info "  EXCHANGE CREDENTIALS"
    log_info "=========================================="
    
    # List of supported exchanges
    EXCHANGES=("binance" "coinbase" "kraken" "okx" "bsdex" "bison" "finoa" "bybit")
    
    for exchange in "${EXCHANGES[@]}"; do
        local secret_arn
        secret_arn=$(get_secret_arn "$manifest_file" "exchange" "$exchange")
        
        if [ -n "$secret_arn" ]; then
            collect_exchange_credentials "$exchange" "$secret_arn" "$region"
        else
            log_warning "No secret ARN found for exchange: $exchange (skipping)"
            SKIPPED_SECRETS+=("${exchange}")
        fi
    done
    
    # ========================================================================
    # AI Provider Credentials (Requirement 4.2)
    # ========================================================================
    
    echo ""
    log_info "=========================================="
    log_info "  AI PROVIDER API KEYS"
    log_info "=========================================="
    
    # List of supported AI providers
    AI_PROVIDERS=("gemini" "openai" "deepseek")
    
    for provider in "${AI_PROVIDERS[@]}"; do
        local secret_arn
        secret_arn=$(get_secret_arn "$manifest_file" "ai_provider" "$provider")
        
        if [ -n "$secret_arn" ]; then
            collect_ai_provider_credentials "$provider" "$secret_arn" "$region"
        else
            log_warning "No secret ARN found for AI provider: $provider (skipping)"
            SKIPPED_SECRETS+=("ai-${provider}")
        fi
    done
    
    # ========================================================================
    # Lambda Refresh (Requirements 4.6, 4.7)
    # ========================================================================
    
    refresh_lambda_functions "$ENVIRONMENT" "$manifest_file" "$region"
    
    # ========================================================================
    # Verification
    # ========================================================================
    
    verify_secret_access "$ENVIRONMENT" "$manifest_file" "$region"
    
    # ========================================================================
    # Summary
    # ========================================================================
    
    echo ""
    log_info "=========================================="
    log_info "  SECRETS POPULATION SUMMARY"
    log_info "=========================================="
    echo ""
    
    if [ ${#UPDATED_SECRETS[@]} -gt 0 ]; then
        log_success "Successfully stored secrets:"
        for secret in "${UPDATED_SECRETS[@]}"; do
            echo "  ✓ $secret"
        done
    fi
    
    if [ ${#SKIPPED_SECRETS[@]} -gt 0 ]; then
        echo ""
        log_warning "Skipped secrets:"
        for secret in "${SKIPPED_SECRETS[@]}"; do
            echo "  ⊘ $secret"
        done
    fi
    
    if [ ${#FAILED_SECRETS[@]} -gt 0 ]; then
        echo ""
        log_error "Failed secrets:"
        for secret in "${FAILED_SECRETS[@]}"; do
            echo "  ✗ $secret"
        done
    fi
    
    echo ""
    
    # Determine exit status
    if [ ${#FAILED_SECRETS[@]} -gt 0 ]; then
        log_warning "Secrets population completed with some failures"
        log_info "Review failed secrets and try again if needed"
        # Don't exit with error - partial success is acceptable
    else
        log_success "Secrets population completed successfully"
    fi
    
    echo ""
    log_info "Next steps:"
    echo "  1. Verify Lambda functions can access secrets"
    echo "  2. Test API endpoints that use these credentials"
    echo "  3. Continue with frontend deployment: ./deploy-frontend.sh $ENVIRONMENT"
}

# Run main function
main "$@"
