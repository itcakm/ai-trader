#!/bin/bash
#
# deploy.sh - Deploy infrastructure to a specified environment
#
# This script deploys the Terraform infrastructure to either the test or
# production environment. It includes validation, planning, and optional
# auto-approval for non-production environments.
#
# Requirements: 1.2, 1.3
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"

# Default values
ENVIRONMENT=""
AUTO_APPROVE="false"
PLAN_ONLY="false"
DESTROY="false"
VAR_FILE=""

# Functions
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

usage() {
    echo "Usage: $0 -e ENVIRONMENT [OPTIONS]"
    echo ""
    echo "Deploy infrastructure to the specified environment."
    echo ""
    echo "Required:"
    echo "  -e, --environment ENV   Environment to deploy (test|production)"
    echo ""
    echo "Options:"
    echo "  -a, --auto-approve      Auto-approve the deployment (not allowed for production)"
    echo "  -p, --plan-only         Only run terraform plan, do not apply"
    echo "  -v, --var-file FILE     Additional variable file to use"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  AWS_PROFILE             AWS CLI profile to use"
    echo "  TF_LOG                  Terraform log level (TRACE, DEBUG, INFO, WARN, ERROR)"
    echo ""
    echo "Examples:"
    echo "  $0 -e test                    Deploy to test environment"
    echo "  $0 -e test -a                 Deploy to test with auto-approve"
    echo "  $0 -e production              Deploy to production (requires manual approval)"
    echo "  $0 -e test -p                 Plan only for test environment"
}

check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check for Terraform
    if ! command -v terraform &> /dev/null; then
        print_error "Terraform is not installed. Please install Terraform >= 1.0.0"
        exit 1
    fi
    print_success "Terraform found: $(terraform version -json | jq -r '.terraform_version' 2>/dev/null || terraform version | head -1)"
    
    # Check for AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install AWS CLI v2"
        exit 1
    fi
    print_success "AWS CLI found"
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured or invalid"
        print_info "Please configure AWS credentials using 'aws configure' or set AWS_PROFILE"
        exit 1
    fi
    
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    AWS_USER_ARN=$(aws sts get-caller-identity --query Arn --output text)
    print_success "AWS credentials valid"
    print_info "Account ID: $AWS_ACCOUNT_ID"
    print_info "User/Role: $AWS_USER_ARN"
}

validate_environment() {
    print_header "Validating Environment"
    
    if [[ -z "$ENVIRONMENT" ]]; then
        print_error "Environment is required. Use -e test or -e production"
        usage
        exit 1
    fi
    
    if [[ "$ENVIRONMENT" != "test" && "$ENVIRONMENT" != "production" ]]; then
        print_error "Invalid environment: $ENVIRONMENT. Must be 'test' or 'production'"
        exit 1
    fi
    print_success "Environment: $ENVIRONMENT"
    
    ENV_DIR="$INFRA_DIR/environments/$ENVIRONMENT"
    if [[ ! -d "$ENV_DIR" ]]; then
        print_error "Environment directory not found: $ENV_DIR"
        exit 1
    fi
    print_success "Environment directory found"
    
    # Check for required files
    if [[ ! -f "$ENV_DIR/main.tf" ]]; then
        print_error "main.tf not found in $ENV_DIR"
        exit 1
    fi
    print_success "main.tf found"
    
    if [[ ! -f "$ENV_DIR/terraform.tfvars" ]]; then
        print_warning "terraform.tfvars not found, using defaults"
    else
        print_success "terraform.tfvars found"
    fi
    
    # Production safety checks
    if [[ "$ENVIRONMENT" == "production" ]]; then
        if [[ "$AUTO_APPROVE" == "true" ]]; then
            print_error "Auto-approve is not allowed for production deployments"
            print_info "Production deployments require manual approval for safety"
            exit 1
        fi
        print_warning "Production deployment - manual approval will be required"
    fi
}

confirm_deployment() {
    if [[ "$AUTO_APPROVE" == "true" ]]; then
        print_info "Auto-approve enabled, skipping confirmation"
        return 0
    fi
    
    if [[ "$PLAN_ONLY" == "true" ]]; then
        return 0
    fi
    
    print_header "Deployment Confirmation"
    
    echo "You are about to deploy to the $ENVIRONMENT environment."
    echo ""
    
    if [[ "$ENVIRONMENT" == "production" ]]; then
        print_warning "⚠️  PRODUCTION DEPLOYMENT ⚠️"
        echo ""
        echo "This will modify production infrastructure."
        echo "Please review the plan carefully before proceeding."
        echo ""
    fi
    
    read -p "Do you want to proceed with the deployment? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Deployment cancelled by user"
        exit 0
    fi
}

run_deployment() {
    print_header "Deploying to $ENVIRONMENT"
    
    cd "$ENV_DIR"
    
    # Initialize Terraform
    print_info "Running terraform init..."
    if ! terraform init -upgrade; then
        print_error "Terraform init failed"
        exit 1
    fi
    print_success "Terraform initialized"
    
    # Validate configuration
    print_info "Validating Terraform configuration..."
    if ! terraform validate; then
        print_error "Terraform validation failed"
        exit 1
    fi
    print_success "Configuration valid"
    
    # Format check
    print_info "Checking Terraform formatting..."
    if ! terraform fmt -check -recursive "$INFRA_DIR/modules" 2>/dev/null; then
        print_warning "Some files are not properly formatted. Run 'terraform fmt -recursive' to fix."
    else
        print_success "Formatting check passed"
    fi
    
    # Build plan command
    PLAN_CMD="terraform plan"
    
    if [[ -f "$ENV_DIR/terraform.tfvars" ]]; then
        PLAN_CMD="$PLAN_CMD -var-file=terraform.tfvars"
    fi
    
    if [[ -n "$VAR_FILE" ]]; then
        if [[ -f "$VAR_FILE" ]]; then
            PLAN_CMD="$PLAN_CMD -var-file=$VAR_FILE"
        else
            print_error "Variable file not found: $VAR_FILE"
            exit 1
        fi
    fi
    
    PLAN_CMD="$PLAN_CMD -out=tfplan"
    
    # Plan
    print_info "Running terraform plan..."
    echo "Command: $PLAN_CMD"
    echo ""
    
    if ! eval "$PLAN_CMD"; then
        print_error "Terraform plan failed"
        exit 1
    fi
    print_success "Plan created"
    
    # If plan only, stop here
    if [[ "$PLAN_ONLY" == "true" ]]; then
        print_header "Plan Complete"
        echo "Plan has been saved to: $ENV_DIR/tfplan"
        echo ""
        echo "To apply this plan, run:"
        echo "  cd $ENV_DIR && terraform apply tfplan"
        echo ""
        echo "Or run this script without -p flag:"
        echo "  $0 -e $ENVIRONMENT"
        exit 0
    fi
    
    # Confirm before apply
    confirm_deployment
    
    # Apply
    print_info "Running terraform apply..."
    if ! terraform apply tfplan; then
        print_error "Terraform apply failed"
        # Clean up plan file on failure
        rm -f tfplan
        exit 1
    fi
    print_success "Deployment complete"
    
    # Clean up plan file
    rm -f tfplan
    
    # Show outputs
    print_header "Deployment Outputs"
    terraform output
}

show_summary() {
    print_header "Deployment Summary"
    
    echo "Environment: $ENVIRONMENT"
    echo "Status: SUCCESS"
    echo ""
    echo "Next steps:"
    
    if [[ "$ENVIRONMENT" == "test" ]]; then
        echo "  1. Verify the deployment by checking AWS Console"
        echo "  2. Run integration tests against the test environment"
        echo "  3. When ready, deploy to production:"
        echo "     $0 -e production"
    else
        echo "  1. Verify the deployment by checking AWS Console"
        echo "  2. Run smoke tests against production"
        echo "  3. Monitor CloudWatch dashboards for any issues"
    fi
    echo ""
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -a|--auto-approve)
            AUTO_APPROVE="true"
            shift
            ;;
        -p|--plan-only)
            PLAN_ONLY="true"
            shift
            ;;
        -v|--var-file)
            VAR_FILE="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Main execution
print_header "Infrastructure Deployment"

check_prerequisites
validate_environment
run_deployment
show_summary

print_success "Deployment to $ENVIRONMENT completed successfully!"
