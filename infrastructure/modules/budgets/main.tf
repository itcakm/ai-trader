# AWS Budgets Module - Cost Management for AI-Assisted Crypto Trading System
# Creates monthly budgets with alerts at 50%, 80%, 100% thresholds
# Configures budget notifications to SNS
# Implements Requirements 23.2, 23.3

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  })

  # Define alert thresholds
  alert_thresholds = [
    {
      threshold      = var.alert_threshold_50
      threshold_type = "PERCENTAGE"
      notification_type = "FORECASTED"
      comparison_operator = "GREATER_THAN"
    },
    {
      threshold      = var.alert_threshold_80
      threshold_type = "PERCENTAGE"
      notification_type = "ACTUAL"
      comparison_operator = "GREATER_THAN"
    },
    {
      threshold      = var.alert_threshold_100
      threshold_type = "PERCENTAGE"
      notification_type = "ACTUAL"
      comparison_operator = "GREATER_THAN"
    }
  ]
}

# Get current AWS account ID
data "aws_caller_identity" "current" {}

#------------------------------------------------------------------------------
# Main Monthly Budget
# Creates a monthly cost budget with alerts at configured thresholds
# Requirements: 23.2
#------------------------------------------------------------------------------
resource "aws_budgets_budget" "monthly" {
  name         = "${local.name_prefix}-monthly-budget"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_amount
  limit_unit   = var.budget_currency
  time_unit    = var.budget_time_unit

  # Cost filters - filter by environment tag
  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Environment$${var.environment}"]
  }

  # 50% threshold notification (forecasted)
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = var.alert_threshold_50
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.notification_email_addresses
    subscriber_sns_topic_arns  = var.sns_topic_arn != null ? [var.sns_topic_arn] : []
  }

  # 80% threshold notification (actual)
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = var.alert_threshold_80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.notification_email_addresses
    subscriber_sns_topic_arns  = var.sns_topic_arn != null ? [var.sns_topic_arn] : []
  }

  # 100% threshold notification (actual)
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = var.alert_threshold_100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.notification_email_addresses
    subscriber_sns_topic_arns  = var.sns_topic_arn != null ? [var.sns_topic_arn] : []
  }

  tags = merge(local.common_tags, {
    Name       = "${local.name_prefix}-monthly-budget"
    BudgetType = "monthly-total"
  })
}

#------------------------------------------------------------------------------
# Service-Specific Budgets (Optional)
# Creates separate budgets for major AWS services
# Requirements: 23.3
#------------------------------------------------------------------------------

# Lambda Budget
resource "aws_budgets_budget" "lambda" {
  count = var.create_service_budgets ? 1 : 0

  name         = "${local.name_prefix}-lambda-budget"
  budget_type  = "COST"
  limit_amount = var.lambda_budget_amount
  limit_unit   = var.budget_currency
  time_unit    = var.budget_time_unit

  # Filter by Lambda service
  cost_filter {
    name   = "Service"
    values = ["AWS Lambda"]
  }

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Environment$${var.environment}"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = var.alert_threshold_80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.notification_email_addresses
    subscriber_sns_topic_arns  = var.sns_topic_arn != null ? [var.sns_topic_arn] : []
  }

  tags = merge(local.common_tags, {
    Name       = "${local.name_prefix}-lambda-budget"
    BudgetType = "service-lambda"
  })
}

# DynamoDB Budget
resource "aws_budgets_budget" "dynamodb" {
  count = var.create_service_budgets ? 1 : 0

  name         = "${local.name_prefix}-dynamodb-budget"
  budget_type  = "COST"
  limit_amount = var.dynamodb_budget_amount
  limit_unit   = var.budget_currency
  time_unit    = var.budget_time_unit

  # Filter by DynamoDB service
  cost_filter {
    name   = "Service"
    values = ["Amazon DynamoDB"]
  }

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Environment$${var.environment}"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = var.alert_threshold_80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.notification_email_addresses
    subscriber_sns_topic_arns  = var.sns_topic_arn != null ? [var.sns_topic_arn] : []
  }

  tags = merge(local.common_tags, {
    Name       = "${local.name_prefix}-dynamodb-budget"
    BudgetType = "service-dynamodb"
  })
}

# API Gateway Budget
resource "aws_budgets_budget" "api_gateway" {
  count = var.create_service_budgets ? 1 : 0

  name         = "${local.name_prefix}-api-gateway-budget"
  budget_type  = "COST"
  limit_amount = var.api_gateway_budget_amount
  limit_unit   = var.budget_currency
  time_unit    = var.budget_time_unit

  # Filter by API Gateway service
  cost_filter {
    name   = "Service"
    values = ["Amazon API Gateway"]
  }

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Environment$${var.environment}"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = var.alert_threshold_80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.notification_email_addresses
    subscriber_sns_topic_arns  = var.sns_topic_arn != null ? [var.sns_topic_arn] : []
  }

  tags = merge(local.common_tags, {
    Name       = "${local.name_prefix}-api-gateway-budget"
    BudgetType = "service-api-gateway"
  })
}
