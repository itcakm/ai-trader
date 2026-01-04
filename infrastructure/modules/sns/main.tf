# SNS Module - Notification Topics
# Creates SNS topics for critical-alerts, risk-events, system-health, and audit-notifications
# Requirements: 13.1, 13.2, 13.3, 13.4, 13.5

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  })

  # SNS topic definitions
  topics = {
    critical-alerts = {
      display_name = "Critical Alerts"
      description  = "Critical system alerts requiring immediate attention"
    }
    risk-events = {
      display_name = "Risk Events"
      description  = "Risk management events and notifications"
    }
    system-health = {
      display_name = "System Health"
      description  = "System health monitoring notifications"
    }
    audit-notifications = {
      display_name = "Audit Notifications"
      description  = "Audit and compliance notifications"
    }
  }
}

# Get current AWS account ID and region
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

#------------------------------------------------------------------------------
# KMS Key for SNS Encryption (if not provided)
#------------------------------------------------------------------------------
resource "aws_kms_key" "sns" {
  count = var.kms_key_arn == "" ? 1 : 0

  description             = "KMS key for SNS topic encryption in ${var.environment}"
  deletion_window_in_days = var.kms_deletion_window_in_days
  enable_key_rotation     = true
  is_enabled              = true

  policy = jsonencode({
    Version = "2012-10-17"
    Id      = "${local.name_prefix}-sns-key-policy"
    Statement = [
      {
        Sid    = "EnableRootAccountAccess"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowSNSService"
        Effect = "Allow"
        Principal = {
          Service = "sns.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:CallerAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
      {
        Sid    = "AllowCloudWatchAlarms"
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey*"
        ]
        Resource = "*"
      },
      {
        Sid    = "AllowEventBridge"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey*"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-sns-key"
    Purpose = "sns-encryption"
  })
}

resource "aws_kms_alias" "sns" {
  count = var.kms_key_arn == "" ? 1 : 0

  name          = "alias/${local.name_prefix}-sns"
  target_key_id = aws_kms_key.sns[0].key_id
}

locals {
  # Use provided KMS key or the one we created
  effective_kms_key_arn = var.kms_key_arn != "" ? var.kms_key_arn : (
    length(aws_kms_key.sns) > 0 ? aws_kms_key.sns[0].arn : null
  )
}

#------------------------------------------------------------------------------
# SNS Topics
#------------------------------------------------------------------------------
resource "aws_sns_topic" "topics" {
  for_each = local.topics

  name         = "${local.name_prefix}-${each.key}"
  display_name = each.value.display_name

  # Enable server-side encryption
  kms_master_key_id = local.effective_kms_key_arn

  # Delivery policy for retries
  delivery_policy = jsonencode({
    http = {
      defaultHealthyRetryPolicy = {
        minDelayTarget     = 20
        maxDelayTarget     = 20
        numRetries         = 3
        numMaxDelayRetries = 0
        numNoDelayRetries  = 0
        numMinDelayRetries = 0
        backoffFunction    = "linear"
      }
      disableSubscriptionOverrides = false
    }
  })

  tags = merge(local.common_tags, {
    Name        = "${local.name_prefix}-${each.key}"
    TopicType   = each.key
    Description = each.value.description
  })
}

#------------------------------------------------------------------------------
# SNS Topic Access Policies - Restrict Publishing to Authorized Services
#------------------------------------------------------------------------------
resource "aws_sns_topic_policy" "topics" {
  for_each = local.topics

  arn = aws_sns_topic.topics[each.key].arn

  policy = jsonencode({
    Version = "2012-10-17"
    Id      = "${local.name_prefix}-${each.key}-policy"
    Statement = concat(
      [
        {
          Sid    = "AllowAccountAccess"
          Effect = "Allow"
          Principal = {
            AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
          }
          Action = [
            "sns:Publish",
            "sns:Subscribe",
            "sns:GetTopicAttributes",
            "sns:SetTopicAttributes",
            "sns:AddPermission",
            "sns:RemovePermission",
            "sns:DeleteTopic",
            "sns:ListSubscriptionsByTopic"
          ]
          Resource = aws_sns_topic.topics[each.key].arn
        },
        {
          Sid    = "AllowCloudWatchAlarms"
          Effect = "Allow"
          Principal = {
            Service = "cloudwatch.amazonaws.com"
          }
          Action   = "sns:Publish"
          Resource = aws_sns_topic.topics[each.key].arn
          Condition = {
            StringEquals = {
              "AWS:SourceAccount" = data.aws_caller_identity.current.account_id
            }
          }
        },
        {
          Sid    = "AllowEventBridge"
          Effect = "Allow"
          Principal = {
            Service = "events.amazonaws.com"
          }
          Action   = "sns:Publish"
          Resource = aws_sns_topic.topics[each.key].arn
          Condition = {
            StringEquals = {
              "AWS:SourceAccount" = data.aws_caller_identity.current.account_id
            }
          }
        }
      ],
      # Allow Lambda functions to publish if role ARNs are provided
      length(var.lambda_role_arns) > 0 ? [
        {
          Sid    = "AllowLambdaPublish"
          Effect = "Allow"
          Principal = {
            AWS = var.lambda_role_arns
          }
          Action   = "sns:Publish"
          Resource = aws_sns_topic.topics[each.key].arn
        }
      ] : [],
      # Allow Step Functions to publish if role ARN is provided
      var.step_functions_role_arn != "" ? [
        {
          Sid    = "AllowStepFunctionsPublish"
          Effect = "Allow"
          Principal = {
            AWS = var.step_functions_role_arn
          }
          Action   = "sns:Publish"
          Resource = aws_sns_topic.topics[each.key].arn
        }
      ] : []
    )
  })
}


#------------------------------------------------------------------------------
# Email Subscriptions for Critical Alerts
#------------------------------------------------------------------------------
resource "aws_sns_topic_subscription" "critical_alerts_email" {
  for_each = toset(var.critical_alerts_email_endpoints)

  topic_arn = aws_sns_topic.topics["critical-alerts"].arn
  protocol  = "email"
  endpoint  = each.value
}

#------------------------------------------------------------------------------
# SMS Subscriptions for Critical Alerts (Production Only)
#------------------------------------------------------------------------------
resource "aws_sns_topic_subscription" "critical_alerts_sms" {
  for_each = var.enable_sms_notifications ? toset(var.critical_alerts_sms_endpoints) : toset([])

  topic_arn = aws_sns_topic.topics["critical-alerts"].arn
  protocol  = "sms"
  endpoint  = each.value
}

#------------------------------------------------------------------------------
# Email Subscriptions for Risk Events
#------------------------------------------------------------------------------
resource "aws_sns_topic_subscription" "risk_events_email" {
  for_each = toset(var.risk_events_email_endpoints)

  topic_arn = aws_sns_topic.topics["risk-events"].arn
  protocol  = "email"
  endpoint  = each.value
}

#------------------------------------------------------------------------------
# Email Subscriptions for System Health
#------------------------------------------------------------------------------
resource "aws_sns_topic_subscription" "system_health_email" {
  for_each = toset(var.system_health_email_endpoints)

  topic_arn = aws_sns_topic.topics["system-health"].arn
  protocol  = "email"
  endpoint  = each.value
}

#------------------------------------------------------------------------------
# Email Subscriptions for Audit Notifications
#------------------------------------------------------------------------------
resource "aws_sns_topic_subscription" "audit_notifications_email" {
  for_each = toset(var.audit_notifications_email_endpoints)

  topic_arn = aws_sns_topic.topics["audit-notifications"].arn
  protocol  = "email"
  endpoint  = each.value
}
