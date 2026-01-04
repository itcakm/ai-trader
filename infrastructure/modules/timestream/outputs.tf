# Timestream Module Outputs

#------------------------------------------------------------------------------
# Database Outputs
#------------------------------------------------------------------------------
output "database_name" {
  description = "Name of the Timestream database"
  value       = aws_timestreamwrite_database.market_data.database_name
}

output "database_arn" {
  description = "ARN of the Timestream database"
  value       = aws_timestreamwrite_database.market_data.arn
}

#------------------------------------------------------------------------------
# Table Outputs
#------------------------------------------------------------------------------
output "table_names" {
  description = "Map of all Timestream table names by logical name"
  value = {
    for k, v in aws_timestreamwrite_table.tables : k => v.table_name
  }
}

output "table_arns" {
  description = "Map of all Timestream table ARNs by logical name"
  value = {
    for k, v in aws_timestreamwrite_table.tables : k => v.arn
  }
}

#------------------------------------------------------------------------------
# Individual Table Outputs (for commonly accessed tables)
#------------------------------------------------------------------------------
output "price_data_table_name" {
  description = "Name of the price-data table"
  value       = aws_timestreamwrite_table.tables["price-data"].table_name
}

output "price_data_table_arn" {
  description = "ARN of the price-data table"
  value       = aws_timestreamwrite_table.tables["price-data"].arn
}

output "volume_data_table_name" {
  description = "Name of the volume-data table"
  value       = aws_timestreamwrite_table.tables["volume-data"].table_name
}

output "volume_data_table_arn" {
  description = "ARN of the volume-data table"
  value       = aws_timestreamwrite_table.tables["volume-data"].arn
}

output "derived_metrics_table_name" {
  description = "Name of the derived-metrics table"
  value       = aws_timestreamwrite_table.tables["derived-metrics"].table_name
}

output "derived_metrics_table_arn" {
  description = "ARN of the derived-metrics table"
  value       = aws_timestreamwrite_table.tables["derived-metrics"].arn
}

#------------------------------------------------------------------------------
# All Table ARNs as List (for IAM policies)
#------------------------------------------------------------------------------
output "all_table_arns_list" {
  description = "List of all Timestream table ARNs (for IAM policies)"
  value       = [for k, v in aws_timestreamwrite_table.tables : v.arn]
}

#------------------------------------------------------------------------------
# Table Count
#------------------------------------------------------------------------------
output "table_count" {
  description = "Total number of Timestream tables created"
  value       = length(aws_timestreamwrite_table.tables)
}


#------------------------------------------------------------------------------
# IAM Policy Outputs
# Requirement 4.6: IAM policies for Lambda access
#------------------------------------------------------------------------------
output "write_policy_arn" {
  description = "ARN of the IAM policy for Timestream write access"
  value       = var.create_iam_policies ? aws_iam_policy.timestream_write[0].arn : null
}

output "read_policy_arn" {
  description = "ARN of the IAM policy for Timestream read access"
  value       = var.create_iam_policies ? aws_iam_policy.timestream_read[0].arn : null
}

output "full_policy_arn" {
  description = "ARN of the IAM policy for full Timestream access"
  value       = var.create_iam_policies ? aws_iam_policy.timestream_full[0].arn : null
}

output "write_policy_json" {
  description = "JSON policy document for Timestream write access (for inline policies)"
  value       = data.aws_iam_policy_document.timestream_write.json
}

output "read_policy_json" {
  description = "JSON policy document for Timestream read access (for inline policies)"
  value       = data.aws_iam_policy_document.timestream_read.json
}

output "full_policy_json" {
  description = "JSON policy document for full Timestream access (for inline policies)"
  value       = data.aws_iam_policy_document.timestream_full.json
}
