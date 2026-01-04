# AWS Backup Module Variables

variable "environment" {
  type        = string
  description = "Environment name (test/production)"

  validation {
    condition     = contains(["test", "production"], var.environment)
    error_message = "environment must be either 'test' or 'production'"
  }
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
  default     = "crypto-trading"
}

#------------------------------------------------------------------------------
# KMS Configuration
#------------------------------------------------------------------------------
variable "kms_key_arn" {
  type        = string
  description = "KMS key ARN for encrypting backups in primary vault"
  default     = null
}

variable "cross_region_kms_key_arn" {
  type        = string
  description = "KMS key ARN for encrypting backups in cross-region vault"
  default     = null
}

#------------------------------------------------------------------------------
# Retention Configuration
#------------------------------------------------------------------------------
variable "test_retention_days" {
  type        = number
  description = "Backup retention period for test environment (days)"
  default     = 7
}

variable "production_retention_days" {
  type        = number
  description = "Backup retention period for production environment (days)"
  default     = 35
}

#------------------------------------------------------------------------------
# Cross-Region Backup Configuration
#------------------------------------------------------------------------------
variable "enable_cross_region_backup" {
  type        = bool
  description = "Enable cross-region backup copy (recommended for production)"
  default     = false
}

variable "backup_region" {
  type        = string
  description = "AWS region for cross-region backup vault"
  default     = "eu-west-1"
}

#------------------------------------------------------------------------------
# Vault Lock Configuration (Production Only)
#------------------------------------------------------------------------------
variable "enable_vault_lock" {
  type        = bool
  description = "Enable backup vault lock for deletion protection (recommended for production)"
  default     = false
}

variable "vault_lock_min_retention_days" {
  type        = number
  description = "Minimum retention period enforced by vault lock"
  default     = 7
}

variable "vault_lock_max_retention_days" {
  type        = number
  description = "Maximum retention period enforced by vault lock"
  default     = 365
}

variable "vault_lock_changeable_days" {
  type        = number
  description = "Number of days before vault lock becomes immutable (0 for immediate)"
  default     = 3
}

#------------------------------------------------------------------------------
# Backup Selection
#------------------------------------------------------------------------------
variable "dynamodb_table_arns" {
  type        = list(string)
  description = "List of DynamoDB table ARNs to back up"
  default     = []
}

#------------------------------------------------------------------------------
# Continuous Backup
#------------------------------------------------------------------------------
variable "enable_continuous_backup" {
  type        = bool
  description = "Enable continuous backup for point-in-time recovery"
  default     = false
}

#------------------------------------------------------------------------------
# Notifications
#------------------------------------------------------------------------------
variable "sns_topic_arn" {
  type        = string
  description = "SNS topic ARN for backup notifications"
  default     = null
}

#------------------------------------------------------------------------------
# Tags
#------------------------------------------------------------------------------
variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}
