# Lambda Layers Configuration
# Creates shared Lambda layers for dependencies
# Requirements: 6.10

#------------------------------------------------------------------------------
# Layer Zip Archives
# Creates placeholder zip archives for initial deployment
#------------------------------------------------------------------------------
data "archive_file" "aws_sdk_layer" {
  type        = "zip"
  output_path = "${path.module}/layers/aws-sdk.zip"

  source {
    content  = "{}"
    filename = "nodejs/package.json"
  }
}

data "archive_file" "common_utils_layer" {
  type        = "zip"
  output_path = "${path.module}/layers/common-utils.zip"

  source {
    content  = "{}"
    filename = "nodejs/package.json"
  }
}

#------------------------------------------------------------------------------
# S3 Objects for Layer Packages
# Uploads layer zip files to S3 before creating layer versions
#------------------------------------------------------------------------------
resource "aws_s3_object" "aws_sdk_layer" {
  bucket = var.s3_deployment_bucket
  key    = "${var.s3_deployment_key_prefix}/layers/aws-sdk.zip"
  source = data.archive_file.aws_sdk_layer.output_path
  etag   = data.archive_file.aws_sdk_layer.output_md5
}

resource "aws_s3_object" "common_utils_layer" {
  bucket = var.s3_deployment_bucket
  key    = "${var.s3_deployment_key_prefix}/layers/common-utils.zip"
  source = data.archive_file.common_utils_layer.output_path
  etag   = data.archive_file.common_utils_layer.output_md5
}

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
  s3_key    = aws_s3_object.aws_sdk_layer.key

  depends_on = [aws_s3_object.aws_sdk_layer]
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
  s3_key    = aws_s3_object.common_utils_layer.key

  depends_on = [aws_s3_object.common_utils_layer]
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
