#!/bin/bash
#
# Frontend Configuration Generator Script
# AI-Assisted Crypto Trading System
#
# Usage: ./generate-frontend-config.sh <environment>
#
# Arguments:
#   environment    Target environment (test|production)
#
# Requirements: 5.1, 5.2, 5.3, 5.4, 5.5

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
        log_error "Environment must be 'test' or 'production'"
        exit 1
    fi
}

# Read API Gateway endpoint from manifest
get_api_endpoint() {
    local manifest_file=$1
    
    local api_endpoint
    api_endpoint=$(jq -r '.api_gateway_endpoint.value // .api_gateway_endpoint // empty' "$manifest_file" 2>/dev/null)
    
    if [ -z "$api_endpoint" ] || [ "$api_endpoint" == "null" ]; then
        # Try alternative keys
        api_endpoint=$(jq -r '.api_gateway_stage_invoke_url.value // .api_gateway_stage_invoke_url // empty' "$manifest_file" 2>/dev/null)
    fi
    
    echo "$api_endpoint"
}

# Read WebSocket endpoint from manifest (if applicable)
get_websocket_endpoint() {
    local manifest_file=$1
    
    local ws_endpoint
    ws_endpoint=$(jq -r '.websocket_endpoint.value // .websocket_endpoint // empty' "$manifest_file" 2>/dev/null)
    
    # If not found, derive from API endpoint
    if [ -z "$ws_endpoint" ] || [ "$ws_endpoint" == "null" ]; then
        local api_endpoint
        api_endpoint=$(get_api_endpoint "$manifest_file")
        if [ -n "$api_endpoint" ]; then
            # Convert https:// to wss:// and /api to /ws
            ws_endpoint=$(echo "$api_endpoint" | sed 's|https://|wss://|' | sed 's|/api$|/ws|')
        fi
    fi
    
    echo "$ws_endpoint"
}

# Get environment-specific feature flags
get_feature_flags() {
    local environment=$1
    local config_file="${PROJECT_ROOT}/deployment/config/${environment}.env"
    
    local enable_analytics="false"
    local enable_error_tracking="false"
    local enable_real_time_updates="true"
    
    if [ -f "$config_file" ]; then
        # Read feature flags from environment config
        enable_analytics=$(grep -E "^ENABLE_ANALYTICS=" "$config_file" | cut -d'=' -f2 || echo "false")
        enable_error_tracking=$(grep -E "^ENABLE_ERROR_TRACKING=" "$config_file" | cut -d'=' -f2 || echo "false")
        enable_real_time_updates=$(grep -E "^ENABLE_REAL_TIME_UPDATES=" "$config_file" | cut -d'=' -f2 || echo "true")
    fi
    
    # Set defaults based on environment if not found
    if [ "$environment" == "production" ]; then
        enable_analytics=${enable_analytics:-"true"}
        enable_error_tracking=${enable_error_tracking:-"true"}
    else
        enable_analytics=${enable_analytics:-"false"}
        enable_error_tracking=${enable_error_tracking:-"false"}
    fi
    
    echo "ENABLE_ANALYTICS=${enable_analytics}"
    echo "ENABLE_ERROR_TRACKING=${enable_error_tracking}"
    echo "ENABLE_REAL_TIME_UPDATES=${enable_real_time_updates}"
}

# Generate .env.local file for frontend
generate_env_local() {
    local environment=$1
    local manifest_file=$2
    local output_file="${FRONTEND_DIR}/.env.local"
    
    log_info "Generating frontend configuration..."
    
    # Get API endpoint
    local api_endpoint
    api_endpoint=$(get_api_endpoint "$manifest_file")
    
    if [ -z "$api_endpoint" ]; then
        log_error "API Gateway endpoint not found in manifest"
        exit 1
    fi
    
    log_info "API Endpoint: $api_endpoint"
    
    # Get WebSocket endpoint
    local ws_endpoint
    ws_endpoint=$(get_websocket_endpoint "$manifest_file")
    
    if [ -n "$ws_endpoint" ]; then
        log_info "WebSocket Endpoint: $ws_endpoint"
    fi
    
    # Get Cognito configuration
    local cognito_user_pool_id
    cognito_user_pool_id=$(jq -r '.cognito_user_pool_id.value // .cognito_user_pool_id // empty' "$manifest_file" 2>/dev/null)
    
    local cognito_app_client_id
    cognito_app_client_id=$(jq -r '.cognito_app_client_id.value // .cognito_app_client_id // empty' "$manifest_file" 2>/dev/null)
    
    local cognito_issuer
    cognito_issuer=$(jq -r '.cognito_issuer.value // .cognito_issuer // empty' "$manifest_file" 2>/dev/null)
    
    local sso_enabled
    sso_enabled=$(jq -r '.cognito_sso_enabled.value // .cognito_sso_enabled // "false"' "$manifest_file" 2>/dev/null)
    
    local cognito_domain_url
    cognito_domain_url=$(jq -r '.cognito_domain_url.value // .cognito_domain_url // empty' "$manifest_file" 2>/dev/null)
    
    # Get feature flags
    local feature_flags
    feature_flags=$(get_feature_flags "$environment")
    
    # Create .env.local file
    cat > "$output_file" << EOF
# Frontend Environment Configuration
# Generated by generate-frontend-config.sh
# Environment: ${environment}
# Generated at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# API Configuration (Requirements 5.1, 5.2)
NEXT_PUBLIC_API_URL=${api_endpoint}
EOF

    # Add WebSocket endpoint if available (Requirement 5.3)
    if [ -n "$ws_endpoint" ] && [ "$ws_endpoint" != "null" ]; then
        echo "NEXT_PUBLIC_WS_URL=${ws_endpoint}" >> "$output_file"
    fi

    # Add environment identifier
    echo "" >> "$output_file"
    echo "# Environment" >> "$output_file"
    echo "NEXT_PUBLIC_ENVIRONMENT=${environment}" >> "$output_file"

    # Add Cognito Authentication Configuration
    echo "" >> "$output_file"
    echo "# Cognito Authentication Configuration" >> "$output_file"
    if [ -n "$cognito_user_pool_id" ] && [ "$cognito_user_pool_id" != "null" ]; then
        echo "NEXT_PUBLIC_COGNITO_USER_POOL_ID=${cognito_user_pool_id}" >> "$output_file"
    fi
    if [ -n "$cognito_app_client_id" ] && [ "$cognito_app_client_id" != "null" ]; then
        echo "NEXT_PUBLIC_COGNITO_CLIENT_ID=${cognito_app_client_id}" >> "$output_file"
    fi
    if [ -n "$cognito_issuer" ] && [ "$cognito_issuer" != "null" ]; then
        echo "NEXT_PUBLIC_COGNITO_ISSUER=${cognito_issuer}" >> "$output_file"
    fi
    
    # Add SSO Configuration
    echo "" >> "$output_file"
    echo "# SSO Configuration" >> "$output_file"
    echo "NEXT_PUBLIC_SSO_ENABLED=${sso_enabled}" >> "$output_file"
    if [ "$sso_enabled" == "true" ] && [ -n "$cognito_domain_url" ] && [ "$cognito_domain_url" != "null" ]; then
        echo "NEXT_PUBLIC_COGNITO_DOMAIN_URL=${cognito_domain_url}" >> "$output_file"
    fi

    # Add feature flags (Requirement 5.4)
    echo "" >> "$output_file"
    echo "# Feature Flags (Requirement 5.4)" >> "$output_file"
    
    # Parse and add feature flags
    while IFS= read -r flag; do
        local flag_name=$(echo "$flag" | cut -d'=' -f1)
        local flag_value=$(echo "$flag" | cut -d'=' -f2)
        echo "NEXT_PUBLIC_${flag_name}=${flag_value}" >> "$output_file"
    done <<< "$feature_flags"

    # Add error tracking and analytics endpoints (Requirement 5.5)
    echo "" >> "$output_file"
    echo "# Error Tracking and Analytics (Requirement 5.5)" >> "$output_file"
    
    if [ "$environment" == "production" ]; then
        # Production-specific endpoints
        echo "NEXT_PUBLIC_SENTRY_DSN=" >> "$output_file"
        echo "NEXT_PUBLIC_ANALYTICS_ID=" >> "$output_file"
    else
        # Test environment - disabled
        echo "# Disabled in test environment" >> "$output_file"
        echo "NEXT_PUBLIC_SENTRY_DSN=" >> "$output_file"
        echo "NEXT_PUBLIC_ANALYTICS_ID=" >> "$output_file"
    fi

    # Add production optimizations flag (Requirement 5.6)
    echo "" >> "$output_file"
    echo "# Production Optimizations (Requirement 5.6)" >> "$output_file"
    if [ "$environment" == "production" ]; then
        echo "NEXT_PUBLIC_ENABLE_PRODUCTION_OPTIMIZATIONS=true" >> "$output_file"
    else
        echo "NEXT_PUBLIC_ENABLE_PRODUCTION_OPTIMIZATIONS=false" >> "$output_file"
    fi

    log_success "Configuration file created: $output_file"
    
    # Display generated configuration
    echo ""
    log_info "Generated configuration:"
    echo "----------------------------------------"
    cat "$output_file"
    echo "----------------------------------------"
}

# Validate generated configuration
validate_configuration() {
    local output_file="${FRONTEND_DIR}/.env.local"
    
    log_info "Validating configuration..."
    
    if [ ! -f "$output_file" ]; then
        log_error "Configuration file not found: $output_file"
        exit 1
    fi
    
    # Check required variables
    local required_vars=("NEXT_PUBLIC_API_URL" "NEXT_PUBLIC_ENVIRONMENT")
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" "$output_file"; then
            missing_vars+=("$var")
        else
            local value=$(grep "^${var}=" "$output_file" | cut -d'=' -f2)
            if [ -z "$value" ]; then
                missing_vars+=("$var (empty)")
            fi
        fi
    done
    
    if [ ${#missing_vars[@]} -ne 0 ]; then
        log_error "Missing or empty required variables:"
        for var in "${missing_vars[@]}"; do
            log_error "  - $var"
        done
        exit 1
    fi
    
    log_success "Configuration validation passed"
}

# Main function
main() {
    # Parse arguments
    if [ $# -lt 1 ]; then
        log_error "Environment parameter is required"
        usage
    fi
    
    local environment=$1
    
    # Handle help flag
    if [[ "$environment" == "-h" || "$environment" == "--help" ]]; then
        usage
    fi
    
    # Validate environment
    validate_environment "$environment"
    
    log_info "Generating frontend configuration for: $environment"
    
    # Check manifest file exists
    local manifest_file="${PROJECT_ROOT}/deployment/manifests/${environment}-manifest.json"
    if [ ! -f "$manifest_file" ]; then
        log_error "Manifest file not found: $manifest_file"
        log_error "Run deploy-infrastructure.sh first to create the manifest"
        exit 1
    fi
    
    log_info "Reading manifest from: $manifest_file"
    
    # Check frontend directory exists
    if [ ! -d "$FRONTEND_DIR" ]; then
        log_error "Frontend directory not found: $FRONTEND_DIR"
        exit 1
    fi
    
    # Generate configuration
    generate_env_local "$environment" "$manifest_file"
    
    # Validate configuration
    validate_configuration
    
    log_success "Frontend configuration generated successfully"
    
    # Print next steps
    echo ""
    log_info "Next steps:"
    echo "  1. Review the generated .env.local file"
    echo "  2. Run frontend build: npm run build"
    echo "  3. Deploy frontend: ./deploy-frontend.sh $environment"
}

# Run main function
main "$@"
