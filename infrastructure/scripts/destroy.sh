#!/bin/bash
#
# destroy.sh - Tear down infrastructure from a specified environment
#
# This script destroys the Terraform infrastructure from either the test or
# production environment. It includes multiple safety checks and confirmation
# prompts to prevent accidental destruction.
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
FORCE="false"
PLAN_ONLY="false"
TARGET=""

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
    echo "Destroy infrastructure in the specified environment."
    echo ""
    echo "Required:"
    echo "  -e, --environment ENV   Environment to destroy (test|production)"
    echo ""
    echo "Options:"
    echo "  -f, --force             Skip confirmation prompts (DANGEROUS)"
    echo "  -p, --plan-only         Only show what would be destroyed"
    echo "  -t, --target RESOURCE   Target specific resource for destruction"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  AWS_PROFILE             AWS CLI profile to use"
    echo "  TF_LOG                  Terraform log level"
    echo ""
    echo "Examples:"
    echo "  $0 -e test                    Destroy test environment"
    echo "  $0 -e test -p                 Plan destruction only"
    echo "  $0 -e test -t module.vpc      Destroy only VPC module"
    echo ""
    echo "WARNING: This operation is destructive and cannot be undone!"
}

check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check for Terraform
    if ! command -v terraform &> /dev/null; then
        print_error "Terraform is not installed. Please install Terraform >= 1.0.0"
        exit 1
    fi
    print_success "Terraform found"
    
    # Check for AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install AWS CLI v2"
        exit 1
    fi
    print_success "AWS CLI found"
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured or invalid"
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
    
    # Production safety checks
    if [[ "$ENVIRONMENT" == "production" ]]; then
        print_warning "⚠️  PRODUCTION ENVIRONMENT SELECTED ⚠️"
        
        if [[ "$FORCE" == "true" ]]; then
            print_error "Force flag is not allowed for production destruction"
            print_info "Production destruction requires explicit confirmation"
            exit 1
        fi
    fi
}

confirm_destruction() {
    if [[ "$FORCE" == "true" && "$ENVIRONMENT" != "production" ]]; then
        print_warning "Force flag enabled, skipping confirmation"
        return 0
    fi
    
    if [[ "$PLAN_ONLY" == "true" ]]; then
        return 0
    fi
    
    print_header "⚠️  DESTRUCTION WARNING ⚠️"
    
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                                                            ║${NC}"
    echo -e "${RED}║   YOU ARE ABOUT TO DESTROY INFRASTRUCTURE                  ║${NC}"
    echo -e "${RED}║                                                            ║${NC}"
    echo -e "${RED}║   Environment: $(printf '%-42s' "$ENVIRONMENT")║${NC}"
    echo -e "${RED}║                                                            ║${NC}"
    echo -e "${RED}║   THIS ACTION CANNOT BE UNDONE!                            ║${NC}"
    echo -e "${RED}║                                                            ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    if [[ "$ENVIRONMENT" == "production" ]]; then
        echo -e "${RED}PRODUCTION DESTRUCTION REQUIRES ADDITIONAL CONFIRMATION${NC}"
        echo ""
        echo "This will destroy ALL production resources including:"
        echo "  - All DynamoDB tables and data"
        echo "  - All S3 buckets and objects"
        echo "  - All Lambda functions"
        echo "  - All API Gateway endpoints"
        echo "  - All networking resources"
        echo "  - All secrets and encryption keys"
        echo ""
        
        # First confirmation
        read -p "Type 'destroy-production' to confirm: " CONFIRM1
        if [[ "$CONFIRM1" != "destroy-production" ]]; then
            print_info "Destruction cancelled - confirmation text did not match"
            exit 0
        fi
        
        # Second confirmation
        echo ""
        read -p "Are you ABSOLUTELY SURE? Type 'YES' in uppercase: " CONFIRM2
        if [[ "$CONFIRM2" != "YES" ]]; then
            print_info "Destruction cancelled - final confirmation not received"
            exit 0
        fi
    else
        # Test environment confirmation
        echo "This will destroy ALL resources in the $ENVIRONMENT environment."
        echo ""
        
        read -p "Type the environment name to confirm ($ENVIRONMENT): " CONFIRM
        if [[ "$CONFIRM" != "$ENVIRONMENT" ]]; then
            print_info "Destruction cancelled - environment name did not match"
            exit 0
        fi
    fi
    
    echo ""
    print_warning "Proceeding with destruction in 5 seconds..."
    print_info "Press Ctrl+C to cancel"
    sleep 5
}

run_destruction() {
    print_header "Destroying $ENVIRONMENT Environment"
    
    cd "$ENV_DIR"
    
    # Initialize Terraform
    print_info "Running terraform init..."
    if ! terraform init -upgrade; then
        print_error "Terraform init failed"
        exit 1
    fi
    print_success "Terraform initialized"
    
    # Build destroy command
    DESTROY_CMD="terraform plan -destroy"
    
    if [[ -f "$ENV_DIR/terraform.tfvars" ]]; then
        DESTROY_CMD="$DESTROY_CMD -var-file=terraform.tfvars"
    fi
    
    if [[ -n "$TARGET" ]]; then
        DESTROY_CMD="$DESTROY_CMD -target=$TARGET"
        print_info "Targeting specific resource: $TARGET"
    fi
    
    DESTROY_CMD="$DESTROY_CMD -out=tfplan-destroy"
    
    # Plan destruction
    print_info "Planning destruction..."
    echo "Command: $DESTROY_CMD"
    echo ""
    
    if ! eval "$DESTROY_CMD"; then
        print_error "Terraform destroy plan failed"
        exit 1
    fi
    print_success "Destruction plan created"
    
    # If plan only, stop here
    if [[ "$PLAN_ONLY" == "true" ]]; then
        print_header "Destruction Plan Complete"
        echo "Plan has been saved to: $ENV_DIR/tfplan-destroy"
        echo ""
        echo "Review the plan above to see what would be destroyed."
        echo ""
        echo "To apply this destruction plan, run:"
        echo "  cd $ENV_DIR && terraform apply tfplan-destroy"
        echo ""
        echo "Or run this script without -p flag:"
        echo "  $0 -e $ENVIRONMENT"
        
        # Clean up plan file
        rm -f tfplan-destroy
        exit 0
    fi
    
    # Confirm before destruction
    confirm_destruction
    
    # Apply destruction
    print_info "Applying destruction plan..."
    if ! terraform apply tfplan-destroy; then
        print_error "Terraform destroy failed"
        rm -f tfplan-destroy
        exit 1
    fi
    print_success "Destruction complete"
    
    # Clean up plan file
    rm -f tfplan-destroy
}

show_summary() {
    print_header "Destruction Summary"
    
    echo "Environment: $ENVIRONMENT"
    echo "Status: DESTROYED"
    echo ""
    
    if [[ -n "$TARGET" ]]; then
        echo "Targeted resource: $TARGET"
        echo ""
        echo "Note: Only the targeted resource was destroyed."
        echo "Other resources in the environment remain intact."
    else
        echo "All resources in the $ENVIRONMENT environment have been destroyed."
    fi
    
    echo ""
    echo "Next steps:"
    echo "  1. Verify destruction in AWS Console"
    echo "  2. Check for any orphaned resources"
    echo "  3. Review CloudWatch logs for any errors during destruction"
    echo ""
    
    if [[ "$ENVIRONMENT" == "test" ]]; then
        echo "To redeploy the test environment:"
        echo "  ./deploy.sh -e test"
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
        -f|--force)
            FORCE="true"
            shift
            ;;
        -p|--plan-only)
            PLAN_ONLY="true"
            shift
            ;;
        -t|--target)
            TARGET="$2"
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
print_header "Infrastructure Destruction"

print_warning "This script will DESTROY infrastructure resources"
echo ""

check_prerequisites
validate_environment
run_destruction
show_summary

print_success "Destruction of $ENVIRONMENT completed!"
