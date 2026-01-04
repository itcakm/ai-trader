# Lambda Layers Configuration
# Creates shared Lambda layers for dependencies
# Requirements: 6.10

#------------------------------------------------------------------------------
# AWS SDK Layer
# Contains AWS SDK and related dependencies
#------------------------------------------------------------------------------
resource "aws_lambda_layer_version" "aws_sdk" {
  layer_name               = "${local.name_prefix}-aws-sdk"
  description              = "AWS SDK and related dependencies"
  compatible_runtimes      = [var.runtime]
  compatible_architectures = [var.architecture]

  s3_bucket = var.s3_deployment_bucket
  s3_key    = "${var.s3_deployment_key_prefix}/layers/aws-sdk.zip"

  lifecycle {
    # Allow CI/CD to update the layer
    ignore_changes = [s3_key]
  }
}

#------------------------------------------------------------------------------
# Common Utilities Layer
# Contains shared utilities, helpers, and common code
#------------------------------------------------------------------------------
resource "aws_lambda_layer_version" "common_utils" {
  layer_name               = "${local.name_prefix}-common-utils"
  description              = "Common utilities and shared code"
  compatible_runtimes      = [var.runtime]
  compatible_architectures = [var.architecture]

  s3_bucket = var.s3_deployment_bucket
  s3_key    = "${var.s3_deployment_key_prefix}/layers/common-utils.zip"

  lifecycle {
    # Allow CI/CD to update the layer
    ignore_changes = [s3_key]
  }
}

#------------------------------------------------------------------------------
# Layer Permissions (if needed for cross-account access)
#------------------------------------------------------------------------------
# Uncomment if layers need to be shared across accounts
# resource "aws_lambda_layer_version_permission" "aws_sdk" {
#   layer_name     = aws_lambda_layer_version.aws_sdk.layer_name
#   version_number = aws_lambda_layer_version.aws_sdk.version
#   principal      = "*"
#   action         = "lambda:GetLayerVersion"
#   statement_id   = "allow-all-accounts"
# }
