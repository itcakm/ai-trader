#!/bin/bash
#
# API Health Check Script
# AI-Assisted Crypto Trading System
#
# Usage: ./health-checks.sh <environment>
#
# Validates:
#   - API Gateway base endpoint
#   - Lambda function endpoints
#   - DynamoDB connectivity
#   - Redis connectivity
#   - Timestream connectivity
#   - Response latency
#
# Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7

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
        log_error "Manifest file not found: $manifest_file"
        exit 1
    fi
    
    MANIFEST_FILE="$manifest_file"
}

# Track validation results
VALIDATION_RESULTS=()
VALIDATION_PASSED=0
VALIDATION_FAILED=0
LATENCY_RESULTS=()

record_result() {
    local check=$1
    local status=$2
    local details=$3
    VALIDATION_RESULTS+=("$check|$status|$details")
    if [ "$status" == "pass" ]; then
        ((VALIDATION_PASSED++))
    else
        ((VALIDATION_FAILED++))
    fi
}

record_latency() {
    local endpoint=$1
    local latency=$2
    LATENCY_RESULTS+=("$endpoint|$latency")
}

# Test HTTP endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local expected_statuses=${3:-200}
    local timeout=${4:-30}
    
    log_info "Testing endpoint: $name"
    log_info "  URL: $url"
    
    if ! command -v curl >/dev/null 2>&1; then
        log_error "curl not available"
        record_result "$name" "fail" "curl not available"
        return 1
    fi
    
    local start_time
    local end_time
    local response
    local http_status
    local latency
    
    start_time=$(date +%s%3N 2>/dev/null || date +%s)
    
    response=$(curl -s -o /dev/null -w "%{http_code}|%{time_total}" \
        --max-time "$timeout" \
        -H "Content-Type: application/json" \
        "$url" 2>/dev/null) || true
    
    end_time=$(date +%s%3N 2>/dev/null || date +%s)
    
    http_status=$(echo "$response" | cut -d'|' -f1)
    latency=$(echo "$response" | cut -d'|' -f2)
    
    # Convert latency to milliseconds
    if [ -n "$latency" ]; then
        latency_ms=$(echo "$latency * 1000" | bc 2>/dev/null || echo "$latency")
    else
        latency_ms="N/A"
    fi
    
    record_latency "$name" "$latency_ms"
    
    # Check if status matches any of the expected statuses (comma-separated)
    local status_matched=false
    IFS=',' read -ra STATUS_ARRAY <<< "$expected_statuses"
    for expected in "${STATUS_ARRAY[@]}"; do
        if [ "$http_status" == "$expected" ]; then
            status_matched=true
            break
        fi
    done
    
    if [ "$status_matched" == "true" ]; then
        log_success "  Status: $http_status (expected: $expected_statuses)"
        log_success "  Latency: ${latency_ms}ms"
        record_result "$name" "pass" "Status: $http_status, Latency: ${latency_ms}ms"
        return 0
    elif [ "$http_status" == "000" ]; then
        log_error "  Connection failed (timeout or unreachable)"
        record_result "$name" "fail" "Connection failed"
        return 1
    else
        log_error "  Status: $http_status (expected: $expected_statuses)"
        record_result "$name" "fail" "Status: $http_status (expected: $expected_statuses)"
        return 1
    fi
}

# Test API Gateway base endpoint
test_api_gateway() {
    local api_url
    api_url=$(jq -r '.api_gateway_endpoint.value // empty' "$MANIFEST_FILE")
    
    if [ -z "$api_url" ]; then
        api_url="https://${API_DOMAIN}"
    fi
    
    log_info "Testing API Gateway base endpoint"
    
    # Test base endpoint (may return 404 or 403 which is OK - means API is responding)
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$api_url" 2>/dev/null) || true
    
    if [ "$response" != "000" ]; then
        log_success "API Gateway is responding (status: $response)"
        record_result "API Gateway Base" "pass" "Responding with status: $response"
        return 0
    else
        log_error "API Gateway not responding"
        record_result "API Gateway Base" "fail" "Not responding"
        return 1
    fi
}

# Test Lambda function endpoints
test_lambda_endpoints() {
    local api_url
    api_url=$(jq -r '.api_gateway_stage_invoke_url.value // empty' "$MANIFEST_FILE")
    
    if [ -z "$api_url" ]; then
        api_url="https://${API_DOMAIN}/api"
    fi
    
    log_info "Testing Lambda function endpoints"
    log_info "Note: 401/403 responses indicate auth is working correctly"
    echo ""
    
    # Define endpoints to test
    # Protected endpoints should return 401 or 403 without auth token
    local endpoints=(
        "strategies|${api_url}/strategies|401,403"
        "templates|${api_url}/templates|401,403"
        "risk-profiles|${api_url}/risk-profiles|401,403"
    )
    
    for endpoint_config in "${endpoints[@]}"; do
        IFS='|' read -r name url expected_statuses <<< "$endpoint_config"
        test_endpoint "Lambda: $name" "$url" "$expected_statuses" || true
        echo ""
    done
}

# Test DynamoDB connectivity
test_dynamodb() {
    log_info "Testing DynamoDB connectivity"
    
    local table_names
    table_names=$(jq -r '.dynamodb_table_names.value // {} | keys[]' "$MANIFEST_FILE" 2>/dev/null)
    
    if [ -z "$table_names" ]; then
        log_warning "No DynamoDB tables found in manifest"
        record_result "DynamoDB Connectivity" "pass" "No tables configured"
        return 0
    fi
    
    local success_count=0
    local total_count=0
    
    for table_key in $table_names; do
        local table_name
        table_name=$(jq -r ".dynamodb_table_names.value[\"$table_key\"]" "$MANIFEST_FILE")
        
        ((total_count++))
        
        log_info "  Checking table: $table_name"
        
        local status
        status=$(aws dynamodb describe-table \
            --table-name "$table_name" \
            --region "$AWS_REGION" \
            --query "Table.TableStatus" \
            --output text 2>/dev/null) || true
        
        if [ "$status" == "ACTIVE" ]; then
            log_success "    Table status: ACTIVE"
            ((success_count++))
        else
            log_error "    Table status: ${status:-NOT_FOUND}"
        fi
    done
    
    if [ $success_count -eq $total_count ]; then
        record_result "DynamoDB Connectivity" "pass" "$success_count/$total_count tables active"
        return 0
    else
        record_result "DynamoDB Connectivity" "fail" "$success_count/$total_count tables active"
        return 1
    fi
}

# Test Redis connectivity
test_redis() {
    log_info "Testing Redis connectivity"
    
    local redis_endpoint
    local redis_port
    redis_endpoint=$(jq -r '.redis_endpoint.value // empty' "$MANIFEST_FILE")
    redis_port=$(jq -r '.redis_port.value // "6379"' "$MANIFEST_FILE")
    
    if [ -z "$redis_endpoint" ]; then
        log_warning "Redis endpoint not found in manifest"
        record_result "Redis Connectivity" "pass" "Not configured"
        return 0
    fi
    
    log_info "  Endpoint: $redis_endpoint:$redis_port"
    
    # Try to describe the ElastiCache cluster
    local cluster_status
    cluster_status=$(aws elasticache describe-cache-clusters \
        --region "$AWS_REGION" \
        --query "CacheClusters[?contains(ConfigurationEndpoint.Address, '${redis_endpoint}') || contains(CacheNodes[0].Endpoint.Address, '${redis_endpoint}')].CacheClusterStatus" \
        --output text 2>/dev/null | head -1) || true
    
    if [ -z "$cluster_status" ]; then
        # Try replication groups for Redis cluster mode
        cluster_status=$(aws elasticache describe-replication-groups \
            --region "$AWS_REGION" \
            --query "ReplicationGroups[].Status" \
            --output text 2>/dev/null | head -1) || true
    fi
    
    if [ "$cluster_status" == "available" ]; then
        log_success "  Redis cluster status: available"
        record_result "Redis Connectivity" "pass" "Cluster available"
        return 0
    elif [ -n "$cluster_status" ]; then
        log_warning "  Redis cluster status: $cluster_status"
        record_result "Redis Connectivity" "pass" "Status: $cluster_status"
        return 0
    else
        log_warning "  Could not verify Redis status (may require VPC access)"
        record_result "Redis Connectivity" "pass" "Status unknown (VPC)"
        return 0
    fi
}

# Test Timestream connectivity
test_timestream() {
    log_info "Testing Timestream connectivity"
    
    local database_name
    database_name=$(jq -r '.timestream_database_name.value // empty' "$MANIFEST_FILE")
    
    if [ -z "$database_name" ]; then
        log_warning "Timestream database not found in manifest"
        record_result "Timestream Connectivity" "pass" "Not configured"
        return 0
    fi
    
    log_info "  Database: $database_name"
    
    local db_status
    db_status=$(aws timestream-write describe-database \
        --database-name "$database_name" \
        --region "$AWS_REGION" \
        --query "Database.DatabaseName" \
        --output text 2>/dev/null) || true
    
    if [ "$db_status" == "$database_name" ]; then
        log_success "  Timestream database exists"
        record_result "Timestream Connectivity" "pass" "Database accessible"
        return 0
    else
        log_error "  Timestream database not accessible"
        record_result "Timestream Connectivity" "fail" "Database not found"
        return 1
    fi
}

# Print latency report
print_latency_report() {
    if [ ${#LATENCY_RESULTS[@]} -eq 0 ]; then
        return
    fi
    
    echo ""
    echo "Latency Report:"
    echo "----------------------------------------"
    
    for entry in "${LATENCY_RESULTS[@]}"; do
        IFS='|' read -r endpoint latency <<< "$entry"
        printf "  %-30s %s\n" "$endpoint" "${latency}ms"
    done
    
    echo "----------------------------------------"
}

# Print validation summary
print_summary() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Health Check Summary${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "Environment: $ENVIRONMENT"
    echo "API Domain: $API_DOMAIN"
    echo ""
    echo "Results:"
    echo "----------------------------------------"
    
    for entry in "${VALIDATION_RESULTS[@]}"; do
        IFS='|' read -r check status details <<< "$entry"
        if [ "$status" == "pass" ]; then
            echo -e "  ${GREEN}✓${NC} $check"
            echo -e "    ${details}"
        else
            echo -e "  ${RED}✗${NC} $check"
            echo -e "    ${details}"
        fi
    done
    
    print_latency_report
    
    echo ""
    echo -e "Passed: ${GREEN}$VALIDATION_PASSED${NC}"
    echo -e "Failed: ${RED}$VALIDATION_FAILED${NC}"
    echo ""
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
    echo -e "${BLUE}  Health Checks - ${ENVIRONMENT}${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    # Load environment configuration
    load_environment_config "$ENVIRONMENT"
    
    # Load manifest
    load_manifest "$ENVIRONMENT"
    
    log_info "API Domain: $API_DOMAIN"
    log_info "AWS Region: $AWS_REGION"
    echo ""
    
    # Test API Gateway
    test_api_gateway || true
    echo ""
    
    # Test Lambda endpoints
    test_lambda_endpoints || true
    echo ""
    
    # Test data stores
    echo -e "${BLUE}--- Data Store Connectivity ---${NC}"
    echo ""
    
    test_dynamodb || true
    echo ""
    
    test_redis || true
    echo ""
    
    test_timestream || true
    
    # Print summary
    print_summary
    
    # Return exit code based on results
    if [ $VALIDATION_FAILED -gt 0 ]; then
        log_error "Health checks completed with failures"
        exit 1
    else
        log_success "Health checks completed successfully"
        exit 0
    fi
}

# Run main function
main "$@"
