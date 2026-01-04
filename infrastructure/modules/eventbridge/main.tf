# EventBridge Module - Scheduled Rules and Event Bus for AI-Assisted Crypto Trading System
# Creates scheduled rules for data quality checks, retention policy enforcement, and performance aggregation
# Implements Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  })
}

# Get current AWS account and region
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

#------------------------------------------------------------------------------
# Custom Event Bus for Application Events
# Requirements: 12.4
#------------------------------------------------------------------------------
resource "aws_cloudwatch_event_bus" "application" {
  name = "${local.name_prefix}-application-events"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-application-events"
  })
}

#------------------------------------------------------------------------------
# Scheduled Rule: Data Quality Checks (Every 5 Minutes)
# Requirements: 12.1
#------------------------------------------------------------------------------
resource "aws_cloudwatch_event_rule" "data_quality_checks" {
  name                = "${local.name_prefix}-data-quality-checks"
  description         = "Triggers data quality checks every 5 minutes"
  schedule_expression = "rate(5 minutes)"
  state               = var.enable_scheduled_rules ? "ENABLED" : "DISABLED"

  tags = merge(local.common_tags, {
    Name     = "${local.name_prefix}-data-quality-checks"
    Schedule = "every-5-minutes"
    Purpose  = "data-quality"
  })
}

resource "aws_cloudwatch_event_target" "data_quality_checks" {
  rule      = aws_cloudwatch_event_rule.data_quality_checks.name
  target_id = "data-quality-lambda"
  arn       = var.lambda_function_arns["quality"]

  input = jsonencode({
    action    = "scheduled-check"
    source    = "eventbridge"
    timestamp = "$${aws.events.event.ingestion-time}"
  })

  retry_policy {
    maximum_event_age_in_seconds = 300
    maximum_retry_attempts       = 2
  }

  dead_letter_config {
    arn = aws_sqs_queue.eventbridge_dlq.arn
  }
}

resource "aws_lambda_permission" "data_quality_checks" {
  statement_id  = "AllowEventBridgeDataQuality"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_names["quality"]
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.data_quality_checks.arn
}

#------------------------------------------------------------------------------
# Scheduled Rule: Retention Policy Enforcement (Daily)
# Requirements: 12.2
#------------------------------------------------------------------------------
resource "aws_cloudwatch_event_rule" "retention_policy" {
  name                = "${local.name_prefix}-retention-policy"
  description         = "Triggers retention policy enforcement daily at 2 AM UTC"
  schedule_expression = "cron(0 2 * * ? *)"
  state               = var.enable_scheduled_rules ? "ENABLED" : "DISABLED"

  tags = merge(local.common_tags, {
    Name     = "${local.name_prefix}-retention-policy"
    Schedule = "daily"
    Purpose  = "retention-enforcement"
  })
}

resource "aws_cloudwatch_event_target" "retention_policy" {
  rule      = aws_cloudwatch_event_rule.retention_policy.name
  target_id = "retention-lambda"
  arn       = var.lambda_function_arns["retention"]

  input = jsonencode({
    action    = "enforce-retention"
    source    = "eventbridge"
    timestamp = "$${aws.events.event.ingestion-time}"
  })

  retry_policy {
    maximum_event_age_in_seconds = 3600
    maximum_retry_attempts       = 3
  }

  dead_letter_config {
    arn = aws_sqs_queue.eventbridge_dlq.arn
  }
}

resource "aws_lambda_permission" "retention_policy" {
  statement_id  = "AllowEventBridgeRetention"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_names["retention"]
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.retention_policy.arn
}

#------------------------------------------------------------------------------
# Scheduled Rule: Performance Metric Aggregation (Hourly)
# Requirements: 12.3
#------------------------------------------------------------------------------
resource "aws_cloudwatch_event_rule" "performance_aggregation" {
  name                = "${local.name_prefix}-performance-aggregation"
  description         = "Triggers performance metric aggregation every hour"
  schedule_expression = "rate(1 hour)"
  state               = var.enable_scheduled_rules ? "ENABLED" : "DISABLED"

  tags = merge(local.common_tags, {
    Name     = "${local.name_prefix}-performance-aggregation"
    Schedule = "hourly"
    Purpose  = "performance-metrics"
  })
}

resource "aws_cloudwatch_event_target" "performance_aggregation" {
  rule      = aws_cloudwatch_event_rule.performance_aggregation.name
  target_id = "performance-lambda"
  arn       = var.lambda_function_arns["performance"]

  input = jsonencode({
    action    = "aggregate-metrics"
    source    = "eventbridge"
    timestamp = "$${aws.events.event.ingestion-time}"
  })

  retry_policy {
    maximum_event_age_in_seconds = 1800
    maximum_retry_attempts       = 2
  }

  dead_letter_config {
    arn = aws_sqs_queue.eventbridge_dlq.arn
  }
}

resource "aws_lambda_permission" "performance_aggregation" {
  statement_id  = "AllowEventBridgePerformance"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_names["performance"]
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.performance_aggregation.arn
}


#------------------------------------------------------------------------------
# Dead Letter Queue for Failed Event Deliveries
# Requirements: 12.6
#------------------------------------------------------------------------------
resource "aws_sqs_queue" "eventbridge_dlq" {
  name                       = "${local.name_prefix}-eventbridge-dlq"
  message_retention_seconds  = var.dlq_message_retention_seconds
  visibility_timeout_seconds = 300

  # Enable server-side encryption
  sqs_managed_sse_enabled = true

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-eventbridge-dlq"
    Purpose = "dead-letter-queue"
  })
}

# SQS Queue Policy to allow EventBridge to send messages
resource "aws_sqs_queue_policy" "eventbridge_dlq" {
  queue_url = aws_sqs_queue.eventbridge_dlq.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowEventBridgeSendMessage"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.eventbridge_dlq.arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:events:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:rule/${local.name_prefix}-*"
          }
        }
      }
    ]
  })
}

#------------------------------------------------------------------------------
# Risk Event Notification Rules
# Requirements: 12.5
#------------------------------------------------------------------------------
resource "aws_cloudwatch_event_rule" "risk_events" {
  for_each = var.enable_risk_event_rules ? toset(var.risk_event_types) : toset([])

  name           = "${local.name_prefix}-risk-event-${lower(replace(each.key, "_", "-"))}"
  description    = "Rule for ${each.key} risk events"
  event_bus_name = aws_cloudwatch_event_bus.application.name
  state          = "ENABLED"

  event_pattern = jsonencode({
    source      = ["crypto-trading.risk-events"]
    detail-type = ["Risk Event"]
    detail = {
      eventType = [each.key]
    }
  })

  tags = merge(local.common_tags, {
    Name      = "${local.name_prefix}-risk-event-${lower(replace(each.key, "_", "-"))}"
    EventType = each.key
    Purpose   = "risk-notification"
  })
}

# Target: Lambda function for risk event processing
resource "aws_cloudwatch_event_target" "risk_events_lambda" {
  for_each = var.enable_risk_event_rules ? toset(var.risk_event_types) : toset([])

  rule           = aws_cloudwatch_event_rule.risk_events[each.key].name
  event_bus_name = aws_cloudwatch_event_bus.application.name
  target_id      = "risk-events-lambda"
  arn            = var.lambda_function_arns["risk-events"]

  retry_policy {
    maximum_event_age_in_seconds = 600
    maximum_retry_attempts       = 3
  }

  dead_letter_config {
    arn = aws_sqs_queue.eventbridge_dlq.arn
  }
}

# Lambda permission for risk event rules
resource "aws_lambda_permission" "risk_events" {
  for_each = var.enable_risk_event_rules ? toset(var.risk_event_types) : toset([])

  statement_id  = "AllowEventBridgeRiskEvent${replace(each.key, "_", "")}"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_names["risk-events"]
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.risk_events[each.key].arn
}

# Target: SNS topic for critical risk events (if SNS topic is provided)
resource "aws_cloudwatch_event_target" "risk_events_sns" {
  for_each = var.enable_risk_event_rules && contains(keys(var.sns_topic_arns), "critical-alerts") ? toset([
    "KILL_SWITCH_ACTIVATED",
    "CIRCUIT_BREAKER_TRIGGERED"
  ]) : toset([])

  rule           = aws_cloudwatch_event_rule.risk_events[each.key].name
  event_bus_name = aws_cloudwatch_event_bus.application.name
  target_id      = "critical-alerts-sns"
  arn            = var.sns_topic_arns["critical-alerts"]

  input_transformer {
    input_paths = {
      eventType = "$.detail.eventType"
      severity  = "$.detail.severity"
      message   = "$.detail.message"
      timestamp = "$.time"
    }
    input_template = <<EOF
{
  "subject": "CRITICAL: <eventType> Alert",
  "message": "Risk Event: <eventType>\nSeverity: <severity>\nTime: <timestamp>\nDetails: <message>"
}
EOF
  }
}

#------------------------------------------------------------------------------
# CloudWatch Log Group for EventBridge
#------------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "eventbridge" {
  name              = "/aws/events/${local.name_prefix}"
  retention_in_days = var.environment == "production" ? 90 : 30

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-eventbridge-logs"
  })
}

#------------------------------------------------------------------------------
# Event Archive for Application Events (Production Only)
#------------------------------------------------------------------------------
resource "aws_cloudwatch_event_archive" "application_events" {
  count = var.environment == "production" ? 1 : 0

  name             = "${var.environment}-app-events-archive"
  description      = "Archive for application events"
  event_source_arn = aws_cloudwatch_event_bus.application.arn
  retention_days   = 90

  event_pattern = jsonencode({
    source = [
      "crypto-trading.risk-events",
      "crypto-trading.trade-lifecycle",
      "crypto-trading.audit"
    ]
  })
}
