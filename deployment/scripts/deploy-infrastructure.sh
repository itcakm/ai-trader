#!/bin/bash
#
# Infrastructure Deployment Script
# AI-Assisted Crypto Trading System
#
# Usage: ./deploy-infrastructure.sh <environment>
#
# Arguments:
#   environment    Target environment (test|production)
#
# Requirements: 1.3, 1.4, 1.5, 1.6

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
        log_error "Environment must be 'test' or 'production'"
        exit 1
    fi
}

# Check Terraform is installed
check_terraform() {
    if ! command -v terraform >/dev/null 2>&1; then
        log_error "Terraform is not installed"
        log_error "Please install Terraform and try again"
        exit 1
    fi
    
    local tf_version=$(terraform version -json | jq -r '.terraform_version')
    log_info "Terraform version: $tf_version"
}

# Initialize Terraform
terraform_init() {
    local infra_dir=$1
    
    log_info "Initializing Terraform..."
    
    cd "$infra_dir"
    
    if terraform init -reconfigure; then
        log_success "Terraform initialized successfully"
    else
        log_error "Terraform initialization failed"
        log_error "Check your backend configuration and AWS credentials"
        exit 1
    fi
}

# Run Terraform plan
terraform_plan() {
    local infra_dir=$1
    local plan_file="${infra_dir}/tfplan"
    
    log_info "Running Terraform plan..."
    
    cd "$infra_dir"
    
    if terraform plan -out="$plan_file" -detailed-exitcode; then
        log_success "Terraform plan completed - no changes detected"
        return 0
    else
        local exit_code=$?
        if [ $exit_code -eq 2 ]; then
            log_success "Terraform plan completed - changes detected"
            return 0
        else
            log_error "Terraform plan failed"
            log_error "Review the error messages above"
            exit 1
        fi
    fi
}

# Run Terraform apply
terraform_apply() {
    local infra_dir=$1
    local plan_file="${infra_dir}/tfplan"
    
    log_info "Applying Terraform changes..."
    
    cd "$infra_dir"
    
    if [ ! -f "$plan_file" ]; then
        log_error "Plan file not found: $plan_file"
        log_error "Run terraform plan first"
        exit 1
    fi
    
    if terraform apply "$plan_file"; then
        log_success "Terraform apply completed successfully"
        rm -f "$plan_file"
    else
        log_error "Terraform apply failed"
        log_error ""
        log_error "ROLLBACK GUIDANCE:"
        log_error "1. Review the error messages above"
        log_error "2. Check AWS Console for partially created resources"
        log_error "3. If needed, run 'terraform destroy' to clean up"
        log_error "4. Fix the issue and re-run deployment"
        log_error ""
        log_error "For state issues, consider:"
        log_error "  - terraform state list"
        log_error "  - terraform state rm <resource>"
        log_error "  - terraform import <resource> <id>"
        exit 1
    fi
}

# Capture Terraform outputs to manifest
capture_outputs() {
    local infra_dir=$1
    local environment=$2
    local manifest_dir="${PROJECT_ROOT}/deployment/manifests"
    local manifest_file="${manifest_dir}/${environment}-manifest.json"
    
    log_info "Capturing Terraform outputs..."
    
    # Ensure manifest directory exists
    mkdir -p "$manifest_dir"
    
    cd "$infra_dir"
    
    # Get Terraform outputs as JSON
    local outputs
    if outputs=$(terraform output -json 2>/dev/null); then
        # Add metadata to the manifest
        local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        
        # Create manifest with metadata
        echo "$outputs" | jq --arg env "$environment" --arg ts "$timestamp" \
            '. + {
                "_metadata": {
                    "environment": $env,
                    "generated_at": $ts,
                    "generator": "deploy-infrastructure.sh"
                }
            }' > "$manifest_file"
        
        log_success "Manifest saved to: $manifest_file"
        
        # Validate manifest using the utility script
        if [ -x "${SCRIPT_DIR}/generate-manifest.sh" ]; then
            "${SCRIPT_DIR}/generate-manifest.sh" "$environment" --validate-only
        fi
    else
        log_error "Failed to capture Terraform outputs"
        exit 1
    fi
}

# Deploy API Gateway changes to stage
deploy_api_gateway() {
    local infra_dir=$1
    local environment=$2
    
    log_info "Deploying API Gateway changes to stage..."
    
    cd "$infra_dir"
    
    # Get API Gateway REST API ID and stage name from Terraform outputs
    local rest_api_id=$(terraform output -raw api_gateway_rest_api_id 2>/dev/null || echo "")
    local stage_name=$(terraform output -raw api_gateway_stage_name 2>/dev/null || echo "$environment")
    local aws_region=$(terraform output -raw aws_region 2>/dev/null || echo "eu-central-1")
    
    if [ -z "$rest_api_id" ]; then
        log_warning "Could not get API Gateway REST API ID from Terraform outputs"
        log_warning "Skipping API Gateway deployment"
        return 0
    fi
    
    log_info "  REST API ID: $rest_api_id"
    log_info "  Stage: $stage_name"
    log_info "  Region: $aws_region"
    
    # Create a new deployment
    local deployment_id
    if deployment_id=$(aws apigateway create-deployment \
        --rest-api-id "$rest_api_id" \
        --stage-name "$stage_name" \
        --description "Deployment from deploy-infrastructure.sh at $(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --region "$aws_region" \
        --query 'id' \
        --output text 2>&1); then
        log_success "API Gateway deployment created: $deployment_id"
    else
        log_warning "Failed to create API Gateway deployment: $deployment_id"
        log_warning "You may need to manually deploy the API Gateway stage"
        return 0
    fi
}

# Verify critical resources were created
verify_resources() {
    local environment=$1
    local manifest_file="${PROJECT_ROOT}/deployment/manifests/${environment}-manifest.json"
    
    log_info "Verifying critical resources..."
    
    if [ ! -f "$manifest_file" ]; then
        log_error "Manifest file not found: $manifest_file"
        exit 1
    fi
    
    local missing_resources=()
    
    # Check VPC
    local vpc_id=$(jq -r '.vpc_id.value // empty' "$manifest_file")
    if [ -z "$vpc_id" ]; then
        missing_resources+=("VPC")
    else
        log_info "  VPC: $vpc_id"
    fi
    
    # Check DynamoDB tables
    local dynamodb_tables=$(jq -r '.dynamodb_table_names.value // empty' "$manifest_file")
    if [ -z "$dynamodb_tables" ] || [ "$dynamodb_tables" == "null" ]; then
        missing_resources+=("DynamoDB tables")
    else
        local table_count=$(echo "$dynamodb_tables" | jq 'length')
        log_info "  DynamoDB tables: $table_count tables"
    fi
    
    # Check Lambda functions
    local lambda_functions=$(jq -r '.lambda_function_names.value // empty' "$manifest_file")
    if [ -z "$lambda_functions" ] || [ "$lambda_functions" == "null" ]; then
        missing_resources+=("Lambda functions")
    else
        local function_count=$(echo "$lambda_functions" | jq 'length')
        log_info "  Lambda functions: $function_count functions"
    fi
    
    # Check API Gateway
    local api_endpoint=$(jq -r '.api_gateway_endpoint.value // empty' "$manifest_file")
    if [ -z "$api_endpoint" ]; then
        missing_resources+=("API Gateway")
    else
        log_info "  API Gateway: $api_endpoint"
    fi
    
    # Check S3 buckets
    local frontend_bucket=$(jq -r '.frontend_assets_bucket_id.value // empty' "$manifest_file")
    if [ -z "$frontend_bucket" ]; then
        missing_resources+=("Frontend S3 bucket")
    else
        log_info "  Frontend bucket: $frontend_bucket"
    fi
    
    local lambda_bucket=$(jq -r '.lambda_deployment_bucket_id.value // empty' "$manifest_file")
    if [ -z "$lambda_bucket" ]; then
        missing_resources+=("Lambda deployment S3 bucket")
    else
        log_info "  Lambda bucket: $lambda_bucket"
    fi
    
    # Check Redis
    local redis_endpoint=$(jq -r '.redis_endpoint.value // empty' "$manifest_file")
    if [ -z "$redis_endpoint" ]; then
        log_warning "  Redis endpoint not found (may be optional)"
    else
        log_info "  Redis: $redis_endpoint"
    fi
    
    # Check Secrets Manager
    local exchange_secrets=$(jq -r '.exchange_secret_arns.value // empty' "$manifest_file")
    if [ -z "$exchange_secrets" ] || [ "$exchange_secrets" == "null" ]; then
        missing_resources+=("Exchange secrets")
    else
        local secret_count=$(echo "$exchange_secrets" | jq 'length')
        log_info "  Exchange secrets: $secret_count secrets"
    fi
    
    # Report missing resources
    if [ ${#missing_resources[@]} -ne 0 ]; then
        log_error "Missing critical resources:"
        for resource in "${missing_resources[@]}"; do
            log_error "  - $resource"
        done
        log_error ""
        log_error "Infrastructure deployment may be incomplete."
        log_error "Review Terraform output and AWS Console."
        exit 1
    fi
    
    log_success "All critical resources verified"
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
    
    log_info "Starting infrastructure deployment for: $environment"
    
    # Set infrastructure directory
    local infra_dir="${PROJECT_ROOT}/infrastructure/environments/${environment}"
    
    if [ ! -d "$infra_dir" ]; then
        log_error "Infrastructure directory not found: $infra_dir"
        exit 1
    fi
    
    log_info "Infrastructure directory: $infra_dir"
    
    # Check Terraform
    check_terraform
    
    # Initialize Terraform
    terraform_init "$infra_dir"
    
    # Run Terraform plan
    terraform_plan "$infra_dir"
    
    # Run Terraform apply
    terraform_apply "$infra_dir"
    
    # Deploy API Gateway changes to stage
    deploy_api_gateway "$infra_dir" "$environment"
    
    # Capture outputs to manifest
    capture_outputs "$infra_dir" "$environment"
    
    # Verify critical resources
    verify_resources "$environment"
    
    log_success "Infrastructure deployment completed successfully"
    
    # Print summary
    echo ""
    log_info "Deployment Summary:"
    echo "  Environment: $environment"
    echo "  Manifest: ${PROJECT_ROOT}/deployment/manifests/${environment}-manifest.json"
    echo ""
    log_info "Next steps:"
    echo "  1. Review the manifest file"
    echo "  2. Run backend deployment: ./deploy-backend.sh $environment"
}

# Run main function
main "$@"
