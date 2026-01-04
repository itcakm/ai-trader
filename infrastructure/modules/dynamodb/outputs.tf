# DynamoDB Module Outputs

#------------------------------------------------------------------------------
# Table ARNs
#------------------------------------------------------------------------------
output "table_arns" {
  description = "Map of all DynamoDB table ARNs by table name"
  value = {
    for k, v in aws_dynamodb_table.tables : k => v.arn
  }
}

output "table_names" {
  description = "Map of all DynamoDB table names (with environment prefix) by logical name"
  value = {
    for k, v in aws_dynamodb_table.tables : k => v.name
  }
}

output "table_ids" {
  description = "Map of all DynamoDB table IDs by table name"
  value = {
    for k, v in aws_dynamodb_table.tables : k => v.id
  }
}

#------------------------------------------------------------------------------
# Individual Table Outputs (for commonly accessed tables)
#------------------------------------------------------------------------------
output "strategies_table_name" {
  description = "Name of the strategies table"
  value       = aws_dynamodb_table.tables["strategies"].name
}

output "strategies_table_arn" {
  description = "ARN of the strategies table"
  value       = aws_dynamodb_table.tables["strategies"].arn
}

output "deployments_table_name" {
  description = "Name of the deployments table"
  value       = aws_dynamodb_table.tables["deployments"].name
}

output "deployments_table_arn" {
  description = "ARN of the deployments table"
  value       = aws_dynamodb_table.tables["deployments"].arn
}

output "risk_events_table_name" {
  description = "Name of the risk-events table"
  value       = aws_dynamodb_table.tables["risk-events"].name
}

output "risk_events_table_arn" {
  description = "ARN of the risk-events table"
  value       = aws_dynamodb_table.tables["risk-events"].arn
}

output "trade_lifecycle_table_name" {
  description = "Name of the trade-lifecycle table"
  value       = aws_dynamodb_table.tables["trade-lifecycle"].name
}

output "trade_lifecycle_table_arn" {
  description = "ARN of the trade-lifecycle table"
  value       = aws_dynamodb_table.tables["trade-lifecycle"].arn
}

output "circuit_breakers_table_name" {
  description = "Name of the circuit-breakers table"
  value       = aws_dynamodb_table.tables["circuit-breakers"].name
}

output "circuit_breakers_table_arn" {
  description = "ARN of the circuit-breakers table"
  value       = aws_dynamodb_table.tables["circuit-breakers"].arn
}

output "kill_switch_state_table_name" {
  description = "Name of the kill-switch-state table"
  value       = aws_dynamodb_table.tables["kill-switch-state"].name
}

output "kill_switch_state_table_arn" {
  description = "ARN of the kill-switch-state table"
  value       = aws_dynamodb_table.tables["kill-switch-state"].arn
}

#------------------------------------------------------------------------------
# Stream ARNs (for tables with streams enabled)
#------------------------------------------------------------------------------
output "table_stream_arns" {
  description = "Map of DynamoDB table stream ARNs (for tables with streams enabled)"
  value = {
    for k, v in aws_dynamodb_table.tables : k => v.stream_arn if v.stream_arn != null
  }
}

#------------------------------------------------------------------------------
# Table Count
#------------------------------------------------------------------------------
output "table_count" {
  description = "Total number of DynamoDB tables created"
  value       = length(aws_dynamodb_table.tables)
}

#------------------------------------------------------------------------------
# All Table ARNs as List (for IAM policies)
#------------------------------------------------------------------------------
output "all_table_arns_list" {
  description = "List of all DynamoDB table ARNs (for IAM policies)"
  value       = [for k, v in aws_dynamodb_table.tables : v.arn]
}

#------------------------------------------------------------------------------
# GSI ARNs (for IAM policies)
#------------------------------------------------------------------------------
output "all_gsi_arns" {
  description = "List of all GSI ARNs (for IAM policies)"
  value = flatten([
    for table_name, table in aws_dynamodb_table.tables : [
      for gsi in local.tables[table_name].gsi : "${table.arn}/index/${gsi.name}"
    ]
  ])
}
