# AWS Backup Module Outputs

#------------------------------------------------------------------------------
# Backup Vault Outputs
#------------------------------------------------------------------------------
output "backup_vault_name" {
  description = "Name of the primary backup vault"
  value       = aws_backup_vault.main.name
}

output "backup_vault_arn" {
  description = "ARN of the primary backup vault"
  value       = aws_backup_vault.main.arn
}

output "backup_vault_id" {
  description = "ID of the primary backup vault"
  value       = aws_backup_vault.main.id
}

output "backup_vault_recovery_points" {
  description = "Number of recovery points in the primary vault"
  value       = aws_backup_vault.main.recovery_points
}

#------------------------------------------------------------------------------
# Cross-Region Vault Outputs
#------------------------------------------------------------------------------
output "cross_region_vault_name" {
  description = "Name of the cross-region backup vault (if enabled)"
  value       = var.enable_cross_region_backup ? aws_backup_vault.cross_region[0].name : null
}

output "cross_region_vault_arn" {
  description = "ARN of the cross-region backup vault (if enabled)"
  value       = var.enable_cross_region_backup ? aws_backup_vault.cross_region[0].arn : null
}

#------------------------------------------------------------------------------
# Backup Plan Outputs
#------------------------------------------------------------------------------
output "backup_plan_id" {
  description = "ID of the DynamoDB backup plan"
  value       = aws_backup_plan.dynamodb.id
}

output "backup_plan_arn" {
  description = "ARN of the DynamoDB backup plan"
  value       = aws_backup_plan.dynamodb.arn
}

output "backup_plan_version" {
  description = "Version of the DynamoDB backup plan"
  value       = aws_backup_plan.dynamodb.version
}

#------------------------------------------------------------------------------
# Backup Selection Outputs
#------------------------------------------------------------------------------
output "backup_selection_id" {
  description = "ID of the backup selection"
  value       = aws_backup_selection.dynamodb.id
}

#------------------------------------------------------------------------------
# IAM Role Outputs
#------------------------------------------------------------------------------
output "backup_role_arn" {
  description = "ARN of the IAM role for AWS Backup"
  value       = aws_iam_role.backup.arn
}

output "backup_role_name" {
  description = "Name of the IAM role for AWS Backup"
  value       = aws_iam_role.backup.name
}

#------------------------------------------------------------------------------
# Configuration Outputs
#------------------------------------------------------------------------------
output "retention_days" {
  description = "Configured backup retention period in days"
  value       = local.retention_days
}

output "backup_schedule" {
  description = "Configured backup schedule (cron expression)"
  value       = local.backup_schedule
}

output "vault_lock_enabled" {
  description = "Whether vault lock is enabled"
  value       = var.enable_vault_lock
}

output "cross_region_backup_enabled" {
  description = "Whether cross-region backup is enabled"
  value       = var.enable_cross_region_backup
}
