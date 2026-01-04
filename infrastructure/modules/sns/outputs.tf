# SNS Module Outputs

#------------------------------------------------------------------------------
# Topic ARNs
#------------------------------------------------------------------------------
output "topic_arns" {
  description = "Map of SNS topic ARNs by topic name"
  value = {
    for k, v in aws_sns_topic.topics : k => v.arn
  }
}

output "critical_alerts_topic_arn" {
  description = "ARN of the critical-alerts SNS topic"
  value       = aws_sns_topic.topics["critical-alerts"].arn
}

output "risk_events_topic_arn" {
  description = "ARN of the risk-events SNS topic"
  value       = aws_sns_topic.topics["risk-events"].arn
}

output "system_health_topic_arn" {
  description = "ARN of the system-health SNS topic"
  value       = aws_sns_topic.topics["system-health"].arn
}

output "audit_notifications_topic_arn" {
  description = "ARN of the audit-notifications SNS topic"
  value       = aws_sns_topic.topics["audit-notifications"].arn
}

#------------------------------------------------------------------------------
# Topic Names
#------------------------------------------------------------------------------
output "topic_names" {
  description = "Map of SNS topic names by topic key"
  value = {
    for k, v in aws_sns_topic.topics : k => v.name
  }
}

#------------------------------------------------------------------------------
# Topic IDs
#------------------------------------------------------------------------------
output "topic_ids" {
  description = "Map of SNS topic IDs by topic key"
  value = {
    for k, v in aws_sns_topic.topics : k => v.id
  }
}

#------------------------------------------------------------------------------
# All Topic ARNs as List
#------------------------------------------------------------------------------
output "all_topic_arns" {
  description = "List of all SNS topic ARNs"
  value       = [for k, v in aws_sns_topic.topics : v.arn]
}

#------------------------------------------------------------------------------
# KMS Key ARN
#------------------------------------------------------------------------------
output "kms_key_arn" {
  description = "ARN of the KMS key used for SNS encryption"
  value       = local.effective_kms_key_arn
}

output "kms_key_id" {
  description = "ID of the KMS key used for SNS encryption (if created by this module)"
  value       = length(aws_kms_key.sns) > 0 ? aws_kms_key.sns[0].key_id : null
}
