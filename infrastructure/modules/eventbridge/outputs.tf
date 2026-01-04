# EventBridge Module - Outputs
# Exports EventBridge resource identifiers and ARNs

#------------------------------------------------------------------------------
# Event Bus Outputs
#------------------------------------------------------------------------------
output "application_event_bus_name" {
  description = "Name of the custom application event bus"
  value       = aws_cloudwatch_event_bus.application.name
}

output "application_event_bus_arn" {
  description = "ARN of the custom application event bus"
  value       = aws_cloudwatch_event_bus.application.arn
}

#------------------------------------------------------------------------------
# Scheduled Rule Outputs
#------------------------------------------------------------------------------
output "data_quality_rule_arn" {
  description = "ARN of the data quality checks scheduled rule"
  value       = aws_cloudwatch_event_rule.data_quality_checks.arn
}

output "data_quality_rule_name" {
  description = "Name of the data quality checks scheduled rule"
  value       = aws_cloudwatch_event_rule.data_quality_checks.name
}

output "retention_policy_rule_arn" {
  description = "ARN of the retention policy enforcement scheduled rule"
  value       = aws_cloudwatch_event_rule.retention_policy.arn
}

output "retention_policy_rule_name" {
  description = "Name of the retention policy enforcement scheduled rule"
  value       = aws_cloudwatch_event_rule.retention_policy.name
}

output "performance_aggregation_rule_arn" {
  description = "ARN of the performance metric aggregation scheduled rule"
  value       = aws_cloudwatch_event_rule.performance_aggregation.arn
}

output "performance_aggregation_rule_name" {
  description = "Name of the performance metric aggregation scheduled rule"
  value       = aws_cloudwatch_event_rule.performance_aggregation.name
}

#------------------------------------------------------------------------------
# Risk Event Rule Outputs
#------------------------------------------------------------------------------
output "risk_event_rule_arns" {
  description = "Map of risk event type to rule ARN"
  value       = { for k, v in aws_cloudwatch_event_rule.risk_events : k => v.arn }
}

output "risk_event_rule_names" {
  description = "Map of risk event type to rule name"
  value       = { for k, v in aws_cloudwatch_event_rule.risk_events : k => v.name }
}

#------------------------------------------------------------------------------
# Dead Letter Queue Outputs
#------------------------------------------------------------------------------
output "dlq_arn" {
  description = "ARN of the EventBridge dead letter queue"
  value       = aws_sqs_queue.eventbridge_dlq.arn
}

output "dlq_url" {
  description = "URL of the EventBridge dead letter queue"
  value       = aws_sqs_queue.eventbridge_dlq.url
}

output "dlq_name" {
  description = "Name of the EventBridge dead letter queue"
  value       = aws_sqs_queue.eventbridge_dlq.name
}

#------------------------------------------------------------------------------
# All Rule ARNs (for IAM policies)
#------------------------------------------------------------------------------
output "all_rule_arns" {
  description = "List of all EventBridge rule ARNs"
  value = concat(
    [
      aws_cloudwatch_event_rule.data_quality_checks.arn,
      aws_cloudwatch_event_rule.retention_policy.arn,
      aws_cloudwatch_event_rule.performance_aggregation.arn
    ],
    [for rule in aws_cloudwatch_event_rule.risk_events : rule.arn]
  )
}
