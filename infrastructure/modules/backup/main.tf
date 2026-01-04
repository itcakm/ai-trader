# AWS Backup Module - Disaster Recovery for AI-Assisted Crypto Trading System
# Creates backup plans, vaults, and IAM roles for DynamoDB tables
# Implements Requirements 22.1, 22.2, 22.3, 22.4, 22.5, 22.6

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  })

  # Determine backup frequency based on environment
  # Test: daily, Production: hourly
  backup_schedule = var.environment == "production" ? "cron(0 * * * ? *)" : "cron(0 5 * * ? *)"

  # Determine retention period based on environment
  # Test: 7 days, Production: 35 days
  retention_days = var.environment == "production" ? var.production_retention_days : var.test_retention_days
}

#------------------------------------------------------------------------------
# AWS Backup Vault
# Primary vault for storing backups
# Requirements: 22.1
#------------------------------------------------------------------------------
resource "aws_backup_vault" "main" {
  name        = "${local.name_prefix}-backup-vault"
  kms_key_arn = var.kms_key_arn

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-backup-vault"
  })
}

#------------------------------------------------------------------------------
# Backup Vault Lock (Production Only)
# Prevents deletion of backups for compliance
# Requirements: 22.6
#------------------------------------------------------------------------------
resource "aws_backup_vault_lock_configuration" "main" {
  count = var.enable_vault_lock ? 1 : 0

  backup_vault_name   = aws_backup_vault.main.name
  min_retention_days  = var.vault_lock_min_retention_days
  max_retention_days  = var.vault_lock_max_retention_days
  changeable_for_days = var.vault_lock_changeable_days
}

#------------------------------------------------------------------------------
# Cross-Region Backup Vault (Production Only)
# Secondary vault in different region for disaster recovery
# Requirements: 22.4
#------------------------------------------------------------------------------
resource "aws_backup_vault" "cross_region" {
  count    = var.enable_cross_region_backup ? 1 : 0
  provider = aws.backup_region

  name        = "${local.name_prefix}-backup-vault-dr"
  kms_key_arn = var.cross_region_kms_key_arn

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-backup-vault-dr"
    Type = "disaster-recovery"
  })
}

#------------------------------------------------------------------------------
# IAM Role for AWS Backup Service
# Requirements: 22.5
#------------------------------------------------------------------------------
data "aws_iam_policy_document" "backup_assume_role" {
  statement {
    sid     = "AllowBackupAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["backup.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backup" {
  name               = "${local.name_prefix}-backup-role"
  description        = "IAM role for AWS Backup service"
  assume_role_policy = data.aws_iam_policy_document.backup_assume_role.json

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-backup-role"
  })
}

# Attach AWS managed policy for backup operations
resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

# Attach AWS managed policy for restore operations
resource "aws_iam_role_policy_attachment" "restore" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
}


#------------------------------------------------------------------------------
# Backup Plan for DynamoDB Tables
# Configures backup frequency and retention
# Requirements: 22.1, 22.2, 22.3
#------------------------------------------------------------------------------
resource "aws_backup_plan" "dynamodb" {
  name = "${local.name_prefix}-dynamodb-backup-plan"

  # Primary backup rule
  rule {
    rule_name         = "${local.name_prefix}-dynamodb-backup-rule"
    target_vault_name = aws_backup_vault.main.name
    schedule          = local.backup_schedule

    # Start backup within 1 hour of scheduled time
    start_window = 60

    # Complete backup within 3 hours
    completion_window = 180

    # Retention period
    lifecycle {
      delete_after = local.retention_days
    }

    # Enable continuous backup for point-in-time recovery
    enable_continuous_backup = var.enable_continuous_backup

    # Recovery point tags
    recovery_point_tags = merge(local.common_tags, {
      BackupType = "scheduled"
    })

    # Cross-region copy (Production only)
    dynamic "copy_action" {
      for_each = var.enable_cross_region_backup ? [1] : []
      content {
        destination_vault_arn = aws_backup_vault.cross_region[0].arn

        lifecycle {
          delete_after = local.retention_days
        }
      }
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-dynamodb-backup-plan"
  })
}

#------------------------------------------------------------------------------
# Backup Selection - DynamoDB Tables
# Selects which resources to back up
# Requirements: 22.1
#------------------------------------------------------------------------------
resource "aws_backup_selection" "dynamodb" {
  name         = "${local.name_prefix}-dynamodb-selection"
  plan_id      = aws_backup_plan.dynamodb.id
  iam_role_arn = aws_iam_role.backup.arn

  # Select resources by tag
  selection_tag {
    type  = "STRINGEQUALS"
    key   = "BackupEnabled"
    value = "true"
  }

  # Alternatively, select specific table ARNs if provided
  resources = var.dynamodb_table_arns
}

#------------------------------------------------------------------------------
# Backup Vault Notifications (Optional)
# Send notifications for backup events
#------------------------------------------------------------------------------
resource "aws_backup_vault_notifications" "main" {
  count = var.sns_topic_arn != null ? 1 : 0

  backup_vault_name = aws_backup_vault.main.name
  sns_topic_arn     = var.sns_topic_arn
  backup_vault_events = [
    "BACKUP_JOB_STARTED",
    "BACKUP_JOB_COMPLETED",
    "BACKUP_JOB_FAILED",
    "RESTORE_JOB_STARTED",
    "RESTORE_JOB_COMPLETED",
    "RESTORE_JOB_FAILED",
    "COPY_JOB_STARTED",
    "COPY_JOB_SUCCESSFUL",
    "COPY_JOB_FAILED"
  ]
}
