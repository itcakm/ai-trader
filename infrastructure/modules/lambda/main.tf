# Lambda Module - Main Configuration
# Creates Lambda functions for AI-Assisted Crypto Trading System
# Implements Requirements 6.1, 6.2, 6.3, 6.4

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
# Requirements: 6.7
#------------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "lambda" {
  for_each = local.functions

  name              = "/aws/lambda/${local.name_prefix}-${each.key}"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name     = "${local.name_prefix}-${each.key}-logs"
    Function = each.key
  })
}

#------------------------------------------------------------------------------
# Lambda Functions
# Requirements: 6.1, 6.2, 6.3, 6.4
#------------------------------------------------------------------------------
resource "aws_lambda_function" "functions" {
  for_each = local.functions

  function_name = "${local.name_prefix}-${each.key}"
  description   = each.value.description
  role          = var.lambda_execution_role_arns[local.function_groups[each.key]]

  # Deployment package from S3
  s3_bucket = var.s3_deployment_bucket
  s3_key    = "${var.s3_deployment_key_prefix}/${each.key}.zip"

  # Runtime configuration
  runtime       = var.runtime
  handler       = each.value.handler
  architectures = [var.architecture]

  # Resource configuration
  memory_size = each.value.memory_size
  timeout     = each.value.timeout

  # Reserved concurrency for critical functions
  reserved_concurrent_executions = each.value.reserved_concurrency

  # VPC configuration - deploy in private subnets
  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = var.security_group_ids
  }

  # X-Ray tracing
  tracing_config {
    mode = "Active"
  }

  # Environment variables
  environment {
    variables = merge(
      # DynamoDB table names
      { for k, v in var.dynamodb_table_names : "DYNAMODB_TABLE_${upper(replace(k, "-", "_"))}" => v },
      # Redis configuration
      {
        REDIS_ENDPOINT = var.redis_endpoint
        REDIS_PORT     = tostring(var.redis_port)
      },
      # Timestream configuration
      {
        TIMESTREAM_DATABASE = var.timestream_database_name
      },
      # Secrets ARNs
      { for k, v in var.secrets_arns : "SECRET_ARN_${upper(replace(k, "-", "_"))}" => v },
      # Common configuration
      {
        ENVIRONMENT = var.environment
        AWS_REGION  = data.aws_region.current.id
        LOG_LEVEL   = var.environment == "production" ? "INFO" : "DEBUG"
      }
    )
  }

  # Lambda layers
  layers = [
    aws_lambda_layer_version.aws_sdk.arn,
    aws_lambda_layer_version.common_utils.arn
  ]

  # Ensure log group exists before function
  depends_on = [aws_cloudwatch_log_group.lambda]

  tags = merge(local.common_tags, {
    Name          = "${local.name_prefix}-${each.key}"
    Function      = each.key
    FunctionGroup = local.function_groups[each.key]
  })

  lifecycle {
    # Ignore changes to S3 key as it will be updated by CI/CD
    ignore_changes = [s3_key]
  }
}

#------------------------------------------------------------------------------
# Lambda Function Aliases (for versioning and traffic shifting)
#------------------------------------------------------------------------------
resource "aws_lambda_alias" "live" {
  for_each = local.functions

  name             = "live"
  description      = "Live alias for ${each.key}"
  function_name    = aws_lambda_function.functions[each.key].function_name
  function_version = "$LATEST"

  lifecycle {
    # Allow CI/CD to update the function version
    ignore_changes = [function_version]
  }
}

#------------------------------------------------------------------------------
# Provisioned Concurrency for Latency-Sensitive Functions (Production Only)
# Requirements: 6.9
#------------------------------------------------------------------------------
resource "aws_lambda_provisioned_concurrency_config" "latency_sensitive" {
  for_each = var.enable_provisioned_concurrency ? toset(local.latency_sensitive_functions) : toset([])

  function_name                     = aws_lambda_function.functions[each.key].function_name
  provisioned_concurrent_executions = var.provisioned_concurrency_count
  qualifier                         = aws_lambda_alias.live[each.key].name
}
