# Step Functions Module Outputs

#------------------------------------------------------------------------------
# State Machine ARNs
#------------------------------------------------------------------------------
output "state_machine_arns" {
  description = "Map of state machine ARNs by name"
  value = {
    trade-lifecycle = aws_sfn_state_machine.trade_lifecycle.arn
    audit-package   = aws_sfn_state_machine.audit_package.arn
    data-backfill   = aws_sfn_state_machine.data_backfill.arn
  }
}

output "trade_lifecycle_state_machine_arn" {
  description = "ARN of the trade lifecycle state machine"
  value       = aws_sfn_state_machine.trade_lifecycle.arn
}

output "audit_package_state_machine_arn" {
  description = "ARN of the audit package generation state machine"
  value       = aws_sfn_state_machine.audit_package.arn
}

output "data_backfill_state_machine_arn" {
  description = "ARN of the data backfill state machine"
  value       = aws_sfn_state_machine.data_backfill.arn
}

#------------------------------------------------------------------------------
# State Machine Names
#------------------------------------------------------------------------------
output "state_machine_names" {
  description = "Map of state machine names by logical name"
  value = {
    trade-lifecycle = aws_sfn_state_machine.trade_lifecycle.name
    audit-package   = aws_sfn_state_machine.audit_package.name
    data-backfill   = aws_sfn_state_machine.data_backfill.name
  }
}

output "trade_lifecycle_state_machine_name" {
  description = "Name of the trade lifecycle state machine"
  value       = aws_sfn_state_machine.trade_lifecycle.name
}

output "audit_package_state_machine_name" {
  description = "Name of the audit package generation state machine"
  value       = aws_sfn_state_machine.audit_package.name
}

output "data_backfill_state_machine_name" {
  description = "Name of the data backfill state machine"
  value       = aws_sfn_state_machine.data_backfill.name
}

#------------------------------------------------------------------------------
# CloudWatch Log Groups
#------------------------------------------------------------------------------
output "log_group_arns" {
  description = "Map of CloudWatch log group ARNs by state machine name"
  value = {
    for k, v in aws_cloudwatch_log_group.step_functions : k => v.arn
  }
}

output "log_group_names" {
  description = "Map of CloudWatch log group names by state machine name"
  value = {
    for k, v in aws_cloudwatch_log_group.step_functions : k => v.name
  }
}

#------------------------------------------------------------------------------
# All State Machine ARNs as List (for IAM policies)
#------------------------------------------------------------------------------
output "all_state_machine_arns_list" {
  description = "List of all state machine ARNs"
  value = [
    aws_sfn_state_machine.trade_lifecycle.arn,
    aws_sfn_state_machine.audit_package.arn,
    aws_sfn_state_machine.data_backfill.arn
  ]
}

#------------------------------------------------------------------------------
# State Machine Count
#------------------------------------------------------------------------------
output "state_machine_count" {
  description = "Total number of state machines created"
  value       = 3
}
