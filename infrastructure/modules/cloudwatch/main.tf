# CloudWatch Module - Main Configuration
# Creates CloudWatch dashboards, alarms, log groups, and metric filters
# Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8

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
# CloudWatch Log Groups for Lambda Functions
# Requirements: 14.6
#------------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "lambda" {
  for_each = var.lambda_function_names

  name              = "/aws/lambda/${local.name_prefix}-${each.key}"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name     = "${local.name_prefix}-${each.key}-logs"
    Function = each.key
    Type     = "lambda"
  })
}

#------------------------------------------------------------------------------
# CloudWatch Log Group for API Gateway
# Requirements: 14.6
#------------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "api_gateway" {
  count = var.create_api_gateway_log_group ? 1 : 0

  name              = "/aws/api-gateway/${local.name_prefix}"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-api-gateway-logs"
    Type = "api-gateway"
  })
}

