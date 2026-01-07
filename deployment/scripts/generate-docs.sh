#!/bin/bash
#
# Documentation Generation Script
# AI-Assisted Crypto Trading System
#
# Usage: ./generate-docs.sh <environment>
#
# Generates:
#   - Deployment summary with all endpoints
#   - Environment variables documentation
#   - Deployment timestamp and version
#   - Manual steps documentation
#
# Requirements: 12.1, 12.2, 12.3, 12.4

set -e

# Script directory for relative paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DOCS_DIR="${PROJECT_ROOT}/deployment/docs"

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
        log_warning "Manifest file not found: $manifest_file"
        MANIFEST_FILE=""
        return 1
    fi
    
    MANIFEST_FILE="$manifest_file"
    return 0
}

# Get Git information
get_git_info() {
    GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    GIT_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "none")
}

# Generate deployment summary
generate_deployment_summary() {
    local output_file="${DOCS_DIR}/deployment-summary-${ENVIRONMENT}.md"
    
    log_info "Generating deployment summary"
    
    mkdir -p "$DOCS_DIR"
    
    # Capitalize environment name (compatible with bash 3.x)
    local env_capitalized
    env_capitalized=$(echo "$ENVIRONMENT" | awk '{print toupper(substr($0,1,1)) tolower(substr($0,2))}')
    
    cat > "$output_file" <<EOF
# Deployment Summary - ${env_capitalized}

## Overview

| Property | Value |
|----------|-------|
| Environment | ${ENVIRONMENT} |
| Deployment Date | $(date -u +"%Y-%m-%d %H:%M:%S UTC") |
| Git Commit | ${GIT_COMMIT} |
| Git Branch | ${GIT_BRANCH} |
| Git Tag | ${GIT_TAG} |
| AWS Region | ${AWS_REGION} |

## Endpoints

### Frontend
- **URL:** https://${DOMAIN}
- **CloudFront Distribution:** $(jq -r '.cloudfront_distribution_id.value // "N/A"' "$MANIFEST_FILE" 2>/dev/null || echo "N/A")

### API
- **Base URL:** https://${API_DOMAIN}
- **API Gateway Endpoint:** $(jq -r '.api_gateway_endpoint.value // "N/A"' "$MANIFEST_FILE" 2>/dev/null || echo "N/A")
- **Stage URL:** $(jq -r '.api_gateway_stage_invoke_url.value // "N/A"' "$MANIFEST_FILE" 2>/dev/null || echo "N/A")

## Lambda Functions

EOF

    # Add Lambda function information
    if [ -n "$MANIFEST_FILE" ] && [ -f "$MANIFEST_FILE" ]; then
        local lambda_names
        lambda_names=$(jq -r '.lambda_function_names.value // {} | to_entries[] | "| \(.key) | \(.value) |"' "$MANIFEST_FILE" 2>/dev/null)
        
        if [ -n "$lambda_names" ]; then
            cat >> "$output_file" <<EOF
| Function | Name |
|----------|------|
${lambda_names}

EOF
        fi
    fi

    cat >> "$output_file" <<EOF
## Data Stores

### DynamoDB Tables

EOF

    # Add DynamoDB table information
    if [ -n "$MANIFEST_FILE" ] && [ -f "$MANIFEST_FILE" ]; then
        local dynamodb_tables
        dynamodb_tables=$(jq -r '.dynamodb_table_names.value // {} | to_entries[] | "| \(.key) | \(.value) |"' "$MANIFEST_FILE" 2>/dev/null)
        
        if [ -n "$dynamodb_tables" ]; then
            cat >> "$output_file" <<EOF
| Table | Name |
|-------|------|
${dynamodb_tables}

EOF
        fi
    fi

    cat >> "$output_file" <<EOF
### Redis
- **Endpoint:** $(jq -r '.redis_endpoint.value // "N/A"' "$MANIFEST_FILE" 2>/dev/null || echo "N/A")
- **Port:** $(jq -r '.redis_port.value // "6379"' "$MANIFEST_FILE" 2>/dev/null || echo "6379")

### Timestream
- **Database:** $(jq -r '.timestream_database_name.value // "N/A"' "$MANIFEST_FILE" 2>/dev/null || echo "N/A")

## S3 Buckets

| Purpose | Bucket Name |
|---------|-------------|
| Frontend Assets | $(jq -r '.frontend_assets_bucket_id.value // "N/A"' "$MANIFEST_FILE" 2>/dev/null || echo "N/A") |
| Lambda Deployment | $(jq -r '.lambda_deployment_bucket_id.value // "N/A"' "$MANIFEST_FILE" 2>/dev/null || echo "N/A") |

## Secrets

### Exchange Credentials

EOF

    # Add exchange secret ARNs
    if [ -n "$MANIFEST_FILE" ] && [ -f "$MANIFEST_FILE" ]; then
        local exchange_secrets
        exchange_secrets=$(jq -r '.exchange_secret_arns.value // {} | to_entries[] | "| \(.key) | \(.value) |"' "$MANIFEST_FILE" 2>/dev/null)
        
        if [ -n "$exchange_secrets" ]; then
            cat >> "$output_file" <<EOF
| Exchange | Secret ARN |
|----------|------------|
${exchange_secrets}

EOF
        fi
    fi

    cat >> "$output_file" <<EOF
### AI Provider Credentials

EOF

    # Add AI provider secret ARNs
    if [ -n "$MANIFEST_FILE" ] && [ -f "$MANIFEST_FILE" ]; then
        local ai_secrets
        ai_secrets=$(jq -r '.ai_provider_secret_arns.value // {} | to_entries[] | "| \(.key) | \(.value) |"' "$MANIFEST_FILE" 2>/dev/null)
        
        if [ -n "$ai_secrets" ]; then
            cat >> "$output_file" <<EOF
| Provider | Secret ARN |
|----------|------------|
${ai_secrets}

EOF
        fi
    fi

    cat >> "$output_file" <<EOF
## Environment Variables

The following environment variables are configured for this deployment:

| Variable | Value |
|----------|-------|
| ENVIRONMENT | ${ENVIRONMENT} |
| AWS_REGION | ${AWS_REGION} |
| DOMAIN | ${DOMAIN} |
| API_DOMAIN | ${API_DOMAIN} |
| LOG_LEVEL | ${LOG_LEVEL:-info} |
| ENABLE_ANALYTICS | ${ENABLE_ANALYTICS:-false} |
| ENABLE_ERROR_TRACKING | ${ENABLE_ERROR_TRACKING:-false} |
| ENABLE_REAL_TIME_UPDATES | ${ENABLE_REAL_TIME_UPDATES:-true} |

## Monitoring

### CloudWatch
- **Dashboard:** ${ENVIRONMENT}-crypto-trading-dashboard
- **Log Groups:** /aws/lambda/${ENVIRONMENT}-crypto-trading-*

### Alerts
- **SNS Topic:** ${ENVIRONMENT}-crypto-trading-alerts

---
*Generated on $(date -u +"%Y-%m-%d %H:%M:%S UTC")*
EOF

    log_success "  Deployment summary saved to: $output_file"
}

# Generate runbook
generate_runbook() {
    local output_file="${DOCS_DIR}/runbook.md"
    
    log_info "Generating operational runbook"
    
    cat > "$output_file" <<'EOF'
# Operational Runbook

## Overview

This runbook provides guidance for common operational tasks, troubleshooting, and incident response for the AI-Assisted Crypto Trading System.

## Table of Contents

1. [Common Operations](#common-operations)
2. [Troubleshooting](#troubleshooting)
3. [Incident Response](#incident-response)
4. [Rollback Procedures](#rollback-procedures)

---

## Common Operations

### Deploying Updates

#### Backend Deployment
```bash
# Deploy to test environment
./deployment/scripts/deploy-backend.sh test

# Deploy to production environment
./deployment/scripts/deploy-backend.sh production
```

#### Frontend Deployment
```bash
# Deploy to test environment
./deployment/scripts/deploy-frontend.sh test

# Deploy to production environment
./deployment/scripts/deploy-frontend.sh production
```

### Checking System Health

```bash
# Run health checks
./deployment/tests/health-checks.sh <environment>

# Run full validation
./deployment/scripts/validate-deployment.sh <environment>
```

### Viewing Logs

```bash
# View Lambda logs
aws logs tail /aws/lambda/<environment>-crypto-trading-<function> --follow

# View recent errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/<environment>-crypto-trading-<function> \
  --filter-pattern "ERROR"
```

### Managing Secrets

```bash
# Update a secret
aws secretsmanager update-secret \
  --secret-id <secret-arn> \
  --secret-string '{"api_key":"...","api_secret":"..."}'

# Rotate Lambda to pick up new secrets
aws lambda update-function-configuration \
  --function-name <function-name> \
  --environment "Variables={FORCE_REFRESH=$(date +%s)}"
```

---

## Troubleshooting

### Lambda Function Errors

1. **Check CloudWatch Logs**
   ```bash
   aws logs tail /aws/lambda/<function-name> --since 1h
   ```

2. **Check Lambda metrics**
   - Go to CloudWatch > Metrics > Lambda
   - Check Errors, Duration, Throttles

3. **Common issues:**
   - Timeout: Increase timeout in Lambda configuration
   - Memory: Increase memory allocation
   - Permissions: Check IAM role permissions

### API Gateway Issues

1. **Check API Gateway logs**
   - Enable access logging in API Gateway
   - Check CloudWatch Logs for API Gateway

2. **Test endpoint directly**
   ```bash
   curl -v https://<api-domain>/api/<endpoint>
   ```

3. **Common issues:**
   - 403 Forbidden: Check API key or authorization
   - 502 Bad Gateway: Lambda function error
   - 504 Gateway Timeout: Lambda timeout

### Database Connectivity

1. **DynamoDB**
   ```bash
   aws dynamodb describe-table --table-name <table-name>
   aws dynamodb scan --table-name <table-name> --limit 1
   ```

2. **Redis**
   - Check ElastiCache cluster status
   - Verify security group allows Lambda access

3. **Timestream**
   ```bash
   aws timestream-write describe-database --database-name <database-name>
   ```

---

## Incident Response

### High Error Rate

1. **Identify affected functions**
   - Check CloudWatch alarms
   - Review error logs

2. **Assess impact**
   - Check affected endpoints
   - Determine user impact

3. **Mitigate**
   - Consider rollback if recent deployment
   - Scale resources if needed
   - Enable circuit breakers

4. **Communicate**
   - Update status page
   - Notify stakeholders

### Performance Degradation

1. **Check metrics**
   - Lambda duration
   - API Gateway latency
   - Database response times

2. **Identify bottleneck**
   - X-Ray traces
   - CloudWatch Insights queries

3. **Remediate**
   - Scale Lambda concurrency
   - Optimize database queries
   - Enable caching

---

## Rollback Procedures

### Lambda Rollback

```bash
# List available versions
aws lambda list-versions-by-function --function-name <function-name>

# Rollback to previous version
./deployment/scripts/rollback-backend.sh <environment>
```

### Frontend Rollback

```bash
# Rollback frontend
./deployment/scripts/rollback-frontend.sh <environment>
```

### Infrastructure Rollback

```bash
# Revert to previous Terraform state
cd infrastructure/environments/<environment>
terraform plan -target=<resource>
terraform apply -target=<resource>
```

---

## Contacts

| Role | Contact |
|------|---------|
| On-Call Engineer | [TBD] |
| Platform Team | [TBD] |
| Security Team | [TBD] |

---
EOF

    # Append the date separately to allow variable expansion
    echo "" >> "$output_file"
    echo "*Last updated: $(date -u +"%Y-%m-%d")*" >> "$output_file"

    log_success "  Runbook saved to: $output_file"
}

# Generate production readiness checklist
generate_checklist() {
    local output_file="${DOCS_DIR}/checklist.md"
    
    log_info "Generating production readiness checklist"
    
    cat > "$output_file" <<'EOF'
# Production Readiness Checklist

## Pre-Deployment Checks

### Infrastructure
- [ ] Terraform plan reviewed and approved
- [ ] All resources tagged appropriately
- [ ] VPC and security groups configured correctly
- [ ] IAM roles follow least privilege principle

### Backend
- [ ] All tests passing
- [ ] Code reviewed and approved
- [ ] No security vulnerabilities in dependencies
- [ ] Environment variables configured
- [ ] Secrets populated in Secrets Manager

### Frontend
- [ ] All tests passing
- [ ] Build successful
- [ ] Environment configuration correct
- [ ] Assets optimized

### Security
- [ ] SSL certificates valid (>30 days)
- [ ] API authentication configured
- [ ] CORS settings correct
- [ ] WAF rules in place (if applicable)

### Monitoring
- [ ] CloudWatch dashboards created
- [ ] Alarms configured for critical metrics
- [ ] SNS topics have subscriptions
- [ ] Log retention policies set

---

## Deployment Verification

### DNS & SSL
- [ ] DNS records resolving correctly
- [ ] SSL certificates valid
- [ ] HTTPS enforced

### API
- [ ] API Gateway responding
- [ ] All Lambda functions healthy
- [ ] Database connectivity verified

### Frontend
- [ ] CloudFront distribution enabled
- [ ] Frontend accessible
- [ ] Static assets loading

### End-to-End
- [ ] Smoke tests passing
- [ ] Critical user flows working
- [ ] Performance acceptable

---

## Post-Deployment

### Documentation
- [ ] Deployment summary generated
- [ ] Runbook updated
- [ ] Change log updated

### Communication
- [ ] Stakeholders notified
- [ ] Status page updated (if applicable)

### Monitoring
- [ ] Alarms in OK state
- [ ] No error spikes in logs
- [ ] Performance metrics normal

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| Reviewer | | | |
| Operations | | | |
| Security | | | |

---

## Notes

_Add any deployment-specific notes here_

---

*Checklist version: 1.0*
EOF

    # Append the date separately to allow variable expansion
    echo "*Last updated: $(date -u +"%Y-%m-%d")*" >> "$output_file"

    log_success "  Checklist saved to: $output_file"
}

# Main function
main() {
    # Parse arguments
    if [ $# -lt 1 ]; then
        usage
    fi
    
    ENVIRONMENT=$1
    validate_environment "$ENVIRONMENT"
    
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Documentation Generation - ${ENVIRONMENT}${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    # Load environment configuration
    load_environment_config "$ENVIRONMENT"
    
    # Load manifest
    load_manifest "$ENVIRONMENT" || true
    
    # Get Git information
    get_git_info
    
    log_info "Environment: $ENVIRONMENT"
    log_info "Git Commit: $GIT_COMMIT"
    log_info "Git Branch: $GIT_BRANCH"
    echo ""
    
    # Generate documentation
    generate_deployment_summary
    echo ""
    
    generate_runbook
    echo ""
    
    generate_checklist
    echo ""
    
    log_success "Documentation generation completed"
    log_info "Documentation saved to: $DOCS_DIR"
}

# Run main function
main "$@"
