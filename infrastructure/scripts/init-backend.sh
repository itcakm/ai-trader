#!/bin/bash
#
# init-backend.sh - Initialize Terraform state bucket and DynamoDB lock table
#
# This script creates the S3 bucket and DynamoDB table required for Terraform
# remote state management. Run this once before deploying any environments.
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
STATE_BUCKET_DIR="$INFRA_DIR/global/state-bucket"

# Default values
AWS_REGION="${AWS_REGION:-eu-central-1}"
PROJECT_NAME="${PROJECT_NAME:-crypto-trading}"

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
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Initialize Terraform state bucket and DynamoDB lock table."
    echo ""
    echo "Options:"
    echo "  -r, --region REGION     AWS region (default: eu-central-1)"
    echo "  -p, --project NAME      Project name for resource naming (default: crypto-trading)"
    echo "  -y, --yes               Skip confirmation prompts"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  AWS_REGION              AWS region (overridden by -r flag)"
    echo "  PROJECT_NAME            Project name (overridden by -p flag)"
    echo "  AWS_PROFILE             AWS CLI profile to use"
    echo ""
    echo "Examples:"
    echo "  $0                      Initialize with defaults"
    echo "  $0 -r us-west-2         Initialize in us-west-2 region"
    echo "  $0 -y                   Initialize without confirmation"
}

check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check for Terraform
    if ! command -v terraform &> /dev/null; then
        print_error "Terraform is not installed. Please install Terraform >= 1.0.0"
        exit 1
    fi
    print_success "Terraform found: $(terraform version -json | jq -r '.terraform_version')"
    
    # Check for AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed. Please install AWS CLI v2"
        exit 1
    fi
    print_success "AWS CLI found: $(aws --version | cut -d' ' -f1)"
    
    # Check for jq
    if ! command -v jq &> /dev/null; then
        print_warning "jq is not installed. Some features may not work correctly."
    else
        print_success "jq found: $(jq --version)"
    fi
    
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

validate_inputs() {
    print_header "Validating Inputs"
    
    # Validate region
    if ! aws ec2 describe-regions --region-names "$AWS_REGION" &> /dev/null; then
        print_error "Invalid AWS region: $AWS_REGION"
        exit 1
    fi
    print_success "Region: $AWS_REGION"
    
    # Validate project name (alphanumeric and hyphens only)
    if [[ ! "$PROJECT_NAME" =~ ^[a-z0-9-]+$ ]]; then
        print_error "Project name must contain only lowercase letters, numbers, and hyphens"
        exit 1
    fi
    print_success "Project name: $PROJECT_NAME"
    
    # Check if state bucket directory exists
    if [[ ! -d "$STATE_BUCKET_DIR" ]]; then
        print_error "State bucket directory not found: $STATE_BUCKET_DIR"
        exit 1
    fi
    print_success "State bucket directory found"
}

confirm_action() {
    if [[ "$SKIP_CONFIRM" == "true" ]]; then
        return 0
    fi
    
    print_header "Confirmation"
    
    BUCKET_NAME="${PROJECT_NAME}-terraform-state-${AWS_ACCOUNT_ID}"
    TABLE_NAME="${PROJECT_NAME}-terraform-locks"
    
    echo "This script will create the following resources:"
    echo ""
    echo "  S3 Bucket:       $BUCKET_NAME"
    echo "  DynamoDB Table:  $TABLE_NAME"
    echo "  Region:          $AWS_REGION"
    echo ""
    print_warning "These resources are designed to be permanent and should not be deleted."
    echo ""
    
    read -p "Do you want to proceed? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Operation cancelled by user"
        exit 0
    fi
}

initialize_backend() {
    print_header "Initializing State Backend"
    
    cd "$STATE_BUCKET_DIR"
    
    # Initialize Terraform
    print_info "Running terraform init..."
    if ! terraform init; then
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
    
    # Plan
    print_info "Running terraform plan..."
    if ! terraform plan \
        -var="aws_region=$AWS_REGION" \
        -var="project_name=$PROJECT_NAME" \
        -out=tfplan; then
        print_error "Terraform plan failed"
        exit 1
    fi
    print_success "Plan created"
    
    # Apply
    print_info "Running terraform apply..."
    if ! terraform apply tfplan; then
        print_error "Terraform apply failed"
        exit 1
    fi
    print_success "State backend resources created"
    
    # Clean up plan file
    rm -f tfplan
    
    # Get outputs
    BUCKET_NAME=$(terraform output -raw state_bucket_name)
    TABLE_NAME=$(terraform output -raw dynamodb_table_name)
    
    print_header "Backend Initialization Complete"
    
    echo "State bucket and lock table have been created successfully."
    echo ""
    echo "Resources created:"
    echo "  S3 Bucket:       $BUCKET_NAME"
    echo "  DynamoDB Table:  $TABLE_NAME"
    echo "  Region:          $AWS_REGION"
    echo ""
    print_warning "IMPORTANT: Update the backend.tf files in each environment with the bucket name:"
    echo ""
    echo "  File: environments/test/backend.tf"
    echo "  File: environments/production/backend.tf"
    echo ""
    echo "  Replace: bucket = \"crypto-trading-terraform-state-ACCOUNT_ID\""
    echo "  With:    bucket = \"$BUCKET_NAME\""
    echo ""
}

# Parse command line arguments
SKIP_CONFIRM="false"

while [[ $# -gt 0 ]]; do
    case $1 in
        -r|--region)
            AWS_REGION="$2"
            shift 2
            ;;
        -p|--project)
            PROJECT_NAME="$2"
            shift 2
            ;;
        -y|--yes)
            SKIP_CONFIRM="true"
            shift
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
print_header "Terraform State Backend Initialization"
print_info "Project: $PROJECT_NAME"
print_info "Region: $AWS_REGION"

check_prerequisites
validate_inputs
confirm_action
initialize_backend

print_success "Backend initialization completed successfully!"
