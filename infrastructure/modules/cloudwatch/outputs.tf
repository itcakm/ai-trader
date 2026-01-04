# CloudWatch Module Outputs

#------------------------------------------------------------------------------
# Dashboard ARNs
#------------------------------------------------------------------------------
output "api_performance_dashboard_arn" {
  description = "ARN of the API performance dashboard"
  value       = aws_cloudwatch_dashboard.api_performance.dashboard_arn
}

output "lambda_metrics_dashboard_arn" {
  description = "ARN of the Lambda metrics dashboard"
  value       = aws_cloudwatch_dashboard.lambda_metrics.dashboard_arn
}

output "dynamodb_metrics_dashboard_arn" {
  description = "ARN of the DynamoDB metrics dashboard"
  value       = aws_cloudwatch_dashboard.dynamodb_metrics.dashboard_arn
}

output "trading_activity_dashboard_arn" {
  description = "ARN of the trading activity dashboard"
  value       = aws_cloudwatch_dashboard.trading_activity.dashboard_arn
}

output "dashboard_arns" {
  description = "Map of all dashboard ARNs"
  value = {
    api_performance  = aws_cloudwatch_dashboard.api_performance.dashboard_arn
    lambda_metrics   = aws_cloudwatch_dashboard.lambda_metrics.dashboard_arn
    dynamodb_metrics = aws_cloudwatch_dashboard.dynamodb_metrics.dashboard_arn
    trading_activity = aws_cloudwatch_dashboard.trading_activity.dashboard_arn
  }
}

#------------------------------------------------------------------------------
# Log Group ARNs
#------------------------------------------------------------------------------
output "lambda_log_group_arns" {
  description = "Map of Lambda function log group ARNs"
  value = {
    for k, v in aws_cloudwatch_log_group.lambda : k => v.arn
  }
}

output "lambda_log_group_names" {
  description = "Map of Lambda function log group names"
  value = {
    for k, v in aws_cloudwatch_log_group.lambda : k => v.name
  }
}

output "api_gateway_log_group_arn" {
  description = "ARN of the API Gateway log group"
  value       = length(aws_cloudwatch_log_group.api_gateway) > 0 ? aws_cloudwatch_log_group.api_gateway[0].arn : null
}

output "api_gateway_log_group_name" {
  description = "Name of the API Gateway log group"
  value       = length(aws_cloudwatch_log_group.api_gateway) > 0 ? aws_cloudwatch_log_group.api_gateway[0].name : null
}

#------------------------------------------------------------------------------
# Alarm ARNs
#------------------------------------------------------------------------------
output "lambda_error_alarm_arns" {
  description = "Map of Lambda error alarm ARNs"
  value = {
    for k, v in aws_cloudwatch_metric_alarm.lambda_errors : k => v.arn
  }
}

output "api_gateway_5xx_alarm_arn" {
  description = "ARN of the API Gateway 5xx error alarm"
  value       = length(aws_cloudwatch_metric_alarm.api_gateway_5xx_errors) > 0 ? aws_cloudwatch_metric_alarm.api_gateway_5xx_errors[0].arn : null
}

output "dynamodb_read_throttling_alarm_arns" {
  description = "Map of DynamoDB read throttling alarm ARNs"
  value = {
    for k, v in aws_cloudwatch_metric_alarm.dynamodb_read_throttling : k => v.arn
  }
}

output "dynamodb_write_throttling_alarm_arns" {
  description = "Map of DynamoDB write throttling alarm ARNs"
  value = {
    for k, v in aws_cloudwatch_metric_alarm.dynamodb_write_throttling : k => v.arn
  }
}

output "redis_memory_alarm_arn" {
  description = "ARN of the Redis memory utilization alarm"
  value       = length(aws_cloudwatch_metric_alarm.redis_memory_utilization) > 0 ? aws_cloudwatch_metric_alarm.redis_memory_utilization[0].arn : null
}

output "redis_cpu_alarm_arn" {
  description = "ARN of the Redis CPU utilization alarm"
  value       = length(aws_cloudwatch_metric_alarm.redis_cpu_utilization) > 0 ? aws_cloudwatch_metric_alarm.redis_cpu_utilization[0].arn : null
}

output "kill_switch_alarm_arn" {
  description = "ARN of the kill switch error alarm"
  value       = length(aws_cloudwatch_metric_alarm.kill_switch_errors) > 0 ? aws_cloudwatch_metric_alarm.kill_switch_errors[0].arn : null
}

output "circuit_breakers_alarm_arn" {
  description = "ARN of the circuit breakers error alarm"
  value       = length(aws_cloudwatch_metric_alarm.circuit_breakers_errors) > 0 ? aws_cloudwatch_metric_alarm.circuit_breakers_errors[0].arn : null
}

#------------------------------------------------------------------------------
# All Alarm ARNs as List
#------------------------------------------------------------------------------
output "all_alarm_arns" {
  description = "List of all CloudWatch alarm ARNs"
  value = concat(
    [for k, v in aws_cloudwatch_metric_alarm.lambda_errors : v.arn],
    length(aws_cloudwatch_metric_alarm.api_gateway_5xx_errors) > 0 ? [aws_cloudwatch_metric_alarm.api_gateway_5xx_errors[0].arn] : [],
    [for k, v in aws_cloudwatch_metric_alarm.dynamodb_read_throttling : v.arn],
    [for k, v in aws_cloudwatch_metric_alarm.dynamodb_write_throttling : v.arn],
    length(aws_cloudwatch_metric_alarm.redis_memory_utilization) > 0 ? [aws_cloudwatch_metric_alarm.redis_memory_utilization[0].arn] : [],
    length(aws_cloudwatch_metric_alarm.redis_cpu_utilization) > 0 ? [aws_cloudwatch_metric_alarm.redis_cpu_utilization[0].arn] : [],
    length(aws_cloudwatch_metric_alarm.kill_switch_errors) > 0 ? [aws_cloudwatch_metric_alarm.kill_switch_errors[0].arn] : [],
    length(aws_cloudwatch_metric_alarm.circuit_breakers_errors) > 0 ? [aws_cloudwatch_metric_alarm.circuit_breakers_errors[0].arn] : []
  )
}

#------------------------------------------------------------------------------
# Custom Metric Namespace
#------------------------------------------------------------------------------
output "custom_metric_namespace" {
  description = "Custom metric namespace for application metrics"
  value       = "${var.project_name}/${var.environment}"
}

#------------------------------------------------------------------------------
# Log Retention Configuration
#------------------------------------------------------------------------------
output "log_retention_days" {
  description = "Configured log retention period in days"
  value       = var.log_retention_days
}
