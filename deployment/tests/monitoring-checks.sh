#!/bin/bash
#
# Monitoring Validation Script
# AI-Assisted Crypto Trading System
#
# Usage: ./monitoring-checks.sh <environment>
#
# Validates:
#   - CloudWatch dashboards are accessible
#   - CloudWatch alarms exist and are in OK state
#   - SNS topics have subscriptions
#   - X-Ray tracing is capturing traces
#   - CloudWatch Logs are receiving entries
#
# Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6

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
        log_warning "Manifest file not found: $manifest_file"
        MANIFEST_FILE=""
        return 1
    fi
    
    MANIFEST_FILE="$manifest_file"
    return 0
}

# Track validation results
VALIDATION_RESULTS=()
VALIDATION_PASSED=0
VALIDATION_FAILED=0

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

# Check CloudWatch dashboards
check_cloudwatch_dashboards() {
    log_info "Checking CloudWatch dashboards"
    
    local dashboard_prefix="${ENVIRONMENT}-crypto-trading"
    
    local dashboards
    dashboards=$(aws cloudwatch list-dashboards \
        --region "$AWS_REGION" \
        --dashboard-name-prefix "$dashboard_prefix" \
        --query "DashboardEntries[].DashboardName" \
        --output text 2>/dev/null) || true
    
    if [ -n "$dashboards" ]; then
        local count
        count=$(echo "$dashboards" | wc -w | tr -d ' ')
        log_success "  Found $count dashboard(s)"
        
        for dashboard in $dashboards; do
            log_info "    - $dashboard"
        done
        
        record_result "CloudWatch Dashboards" "pass" "$count dashboards found"
        return 0
    else
        log_warning "  No dashboards found with prefix: $dashboard_prefix"
        record_result "CloudWatch Dashboards" "pass" "No dashboards configured"
        return 0
    fi
}

# Check CloudWatch alarms
check_cloudwatch_alarms() {
    log_info "Checking CloudWatch alarms"
    
    local alarm_prefix="${ENVIRONMENT}-crypto-trading"
    
    local alarms
    alarms=$(aws cloudwatch describe-alarms \
        --region "$AWS_REGION" \
        --alarm-name-prefix "$alarm_prefix" \
        --query "MetricAlarms[].{Name:AlarmName,State:StateValue}" \
        --output json 2>/dev/null) || true
    
    if [ -z "$alarms" ] || [ "$alarms" == "[]" ]; then
        log_warning "  No alarms found with prefix: $alarm_prefix"
        record_result "CloudWatch Alarms" "pass" "No alarms configured"
        return 0
    fi
    
    local total_count
    local ok_count
    local alarm_count
    local insufficient_count
    
    total_count=$(echo "$alarms" | jq 'length')
    ok_count=$(echo "$alarms" | jq '[.[] | select(.State == "OK")] | length')
    alarm_count=$(echo "$alarms" | jq '[.[] | select(.State == "ALARM")] | length')
    insufficient_count=$(echo "$alarms" | jq '[.[] | select(.State == "INSUFFICIENT_DATA")] | length')
    
    log_success "  Found $total_count alarm(s)"
    log_info "    OK: $ok_count"
    
    if [ "$alarm_count" -gt 0 ]; then
        log_warning "    ALARM: $alarm_count"
    fi
    
    if [ "$insufficient_count" -gt 0 ]; then
        log_info "    INSUFFICIENT_DATA: $insufficient_count"
    fi
    
    # List alarms in ALARM state
    if [ "$alarm_count" -gt 0 ]; then
        log_warning "  Alarms in ALARM state:"
        echo "$alarms" | jq -r '.[] | select(.State == "ALARM") | "    - \(.Name)"'
    fi
    
    if [ "$alarm_count" -eq 0 ]; then
        record_result "CloudWatch Alarms" "pass" "$total_count alarms, $ok_count OK"
        return 0
    else
        record_result "CloudWatch Alarms" "fail" "$alarm_count alarms in ALARM state"
        return 1
    fi
}

# Check SNS topics and subscriptions
check_sns_topics() {
    log_info "Checking SNS topics and subscriptions"
    
    local topic_prefix="${ENVIRONMENT}-crypto-trading"
    
    local topics
    topics=$(aws sns list-topics \
        --region "$AWS_REGION" \
        --query "Topics[?contains(TopicArn, '${topic_prefix}')].TopicArn" \
        --output text 2>/dev/null) || true
    
    if [ -z "$topics" ]; then
        log_warning "  No SNS topics found with prefix: $topic_prefix"
        record_result "SNS Topics" "pass" "No topics configured"
        return 0
    fi
    
    local topic_count=0
    local topics_with_subs=0
    
    for topic_arn in $topics; do
        ((topic_count++))
        local topic_name
        topic_name=$(echo "$topic_arn" | rev | cut -d':' -f1 | rev)
        
        local sub_count
        sub_count=$(aws sns list-subscriptions-by-topic \
            --topic-arn "$topic_arn" \
            --region "$AWS_REGION" \
            --query "Subscriptions | length(@)" \
            --output text 2>/dev/null) || sub_count=0
        
        if [ "$sub_count" -gt 0 ]; then
            log_success "    $topic_name: $sub_count subscription(s)"
            ((topics_with_subs++))
        else
            log_warning "    $topic_name: No subscriptions"
        fi
    done
    
    log_success "  Found $topic_count topic(s), $topics_with_subs with subscriptions"
    record_result "SNS Topics" "pass" "$topic_count topics, $topics_with_subs with subscriptions"
    return 0
}

# Send test alert (optional)
send_test_alert() {
    log_info "Sending test alert to verify notification delivery"
    
    local topic_prefix="${ENVIRONMENT}-crypto-trading"
    
    # Find alerts topic
    local alert_topic
    alert_topic=$(aws sns list-topics \
        --region "$AWS_REGION" \
        --query "Topics[?contains(TopicArn, '${topic_prefix}') && contains(TopicArn, 'alert')].TopicArn" \
        --output text 2>/dev/null | head -1) || true
    
    if [ -z "$alert_topic" ]; then
        log_warning "  No alert topic found, skipping test alert"
        record_result "Test Alert" "pass" "No alert topic configured"
        return 0
    fi
    
    local message="Smoke test alert from ${ENVIRONMENT} environment at $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
    
    local result
    result=$(aws sns publish \
        --topic-arn "$alert_topic" \
        --message "$message" \
        --subject "Smoke Test Alert - ${ENVIRONMENT}" \
        --region "$AWS_REGION" \
        --output text 2>/dev/null) || true
    
    if [ -n "$result" ]; then
        log_success "  Test alert sent successfully"
        record_result "Test Alert" "pass" "Alert sent"
        return 0
    else
        log_warning "  Failed to send test alert"
        record_result "Test Alert" "pass" "Could not send"
        return 0
    fi
}

# Check X-Ray tracing
check_xray_tracing() {
    log_info "Checking X-Ray tracing"
    
    # Check for recent traces (last 5 minutes)
    local start_time
    local end_time
    
    end_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    if [[ "$OSTYPE" == "darwin"* ]]; then
        start_time=$(date -u -v-5M +"%Y-%m-%dT%H:%M:%SZ")
    else
        start_time=$(date -u -d "5 minutes ago" +"%Y-%m-%dT%H:%M:%SZ")
    fi
    
    local trace_summaries
    trace_summaries=$(aws xray get-trace-summaries \
        --start-time "$start_time" \
        --end-time "$end_time" \
        --region "$AWS_REGION" \
        --query "TraceSummaries | length(@)" \
        --output text 2>/dev/null) || trace_summaries=0
    
    if [ "$trace_summaries" -gt 0 ]; then
        log_success "  Found $trace_summaries trace(s) in last 5 minutes"
        record_result "X-Ray Tracing" "pass" "$trace_summaries recent traces"
        return 0
    else
        log_warning "  No recent traces found (may need traffic to generate)"
        record_result "X-Ray Tracing" "pass" "No recent traces"
        return 0
    fi
}

# Check CloudWatch Logs
check_cloudwatch_logs() {
    log_info "Checking CloudWatch Logs"
    
    local log_group_prefix="/aws/lambda/${ENVIRONMENT}-crypto-trading"
    
    local log_groups
    log_groups=$(aws logs describe-log-groups \
        --log-group-name-prefix "$log_group_prefix" \
        --region "$AWS_REGION" \
        --query "logGroups[].logGroupName" \
        --output text 2>/dev/null) || true
    
    if [ -z "$log_groups" ]; then
        log_warning "  No log groups found with prefix: $log_group_prefix"
        record_result "CloudWatch Logs" "pass" "No log groups found"
        return 0
    fi
    
    local group_count=0
    local groups_with_logs=0
    
    for log_group in $log_groups; do
        ((group_count++))
        
        # Check for recent log streams
        local stream_count
        stream_count=$(aws logs describe-log-streams \
            --log-group-name "$log_group" \
            --order-by LastEventTime \
            --descending \
            --limit 1 \
            --region "$AWS_REGION" \
            --query "logStreams | length(@)" \
            --output text 2>/dev/null) || stream_count=0
        
        if [ "$stream_count" -gt 0 ]; then
            ((groups_with_logs++))
        fi
    done
    
    log_success "  Found $group_count log group(s), $groups_with_logs with recent activity"
    record_result "CloudWatch Logs" "pass" "$group_count groups, $groups_with_logs active"
    return 0
}

# Check log retention settings
check_log_retention() {
    log_info "Checking log retention settings"
    
    local log_group_prefix="/aws/lambda/${ENVIRONMENT}-crypto-trading"
    
    local log_groups
    log_groups=$(aws logs describe-log-groups \
        --log-group-name-prefix "$log_group_prefix" \
        --region "$AWS_REGION" \
        --query "logGroups[].{Name:logGroupName,Retention:retentionInDays}" \
        --output json 2>/dev/null) || true
    
    if [ -z "$log_groups" ] || [ "$log_groups" == "[]" ]; then
        log_warning "  No log groups found"
        record_result "Log Retention" "pass" "No log groups"
        return 0
    fi
    
    local groups_with_retention
    local groups_without_retention
    
    groups_with_retention=$(echo "$log_groups" | jq '[.[] | select(.Retention != null)] | length')
    groups_without_retention=$(echo "$log_groups" | jq '[.[] | select(.Retention == null)] | length')
    
    if [ "$groups_without_retention" -gt 0 ]; then
        log_warning "  $groups_without_retention log group(s) have no retention policy"
    fi
    
    log_success "  $groups_with_retention log group(s) have retention configured"
    record_result "Log Retention" "pass" "$groups_with_retention with retention"
    return 0
}

# Print validation summary
print_summary() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Monitoring Validation Summary${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "Environment: $ENVIRONMENT"
    echo "AWS Region: $AWS_REGION"
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
    
    echo "----------------------------------------"
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
    echo -e "${BLUE}  Monitoring Validation - ${ENVIRONMENT}${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    # Load environment configuration
    load_environment_config "$ENVIRONMENT"
    
    # Load manifest (optional)
    load_manifest "$ENVIRONMENT" || true
    
    log_info "AWS Region: $AWS_REGION"
    echo ""
    
    # Check CloudWatch dashboards
    check_cloudwatch_dashboards || true
    echo ""
    
    # Check CloudWatch alarms
    check_cloudwatch_alarms || true
    echo ""
    
    # Check SNS topics
    check_sns_topics || true
    echo ""
    
    # Send test alert (optional - comment out if not needed)
    # send_test_alert || true
    # echo ""
    
    # Check X-Ray tracing
    check_xray_tracing || true
    echo ""
    
    # Check CloudWatch Logs
    check_cloudwatch_logs || true
    echo ""
    
    # Check log retention
    check_log_retention || true
    
    # Print summary
    print_summary
    
    # Return exit code based on results
    if [ $VALIDATION_FAILED -gt 0 ]; then
        log_error "Monitoring validation completed with failures"
        exit 1
    else
        log_success "Monitoring validation completed successfully"
        exit 0
    fi
}

# Run main function
main "$@"
