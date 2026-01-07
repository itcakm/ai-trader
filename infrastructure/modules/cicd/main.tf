# CI/CD Module - IAM Roles and Resources for CI/CD Pipelines
# Creates IAM roles for GitHub Actions with OIDC, CodePipeline, ECR repository,
# and CloudWatch log groups for CI/CD execution
# Implements Requirements 21.1, 21.2, 21.3, 21.5

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  })
}

# Get current AWS account ID and region
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

#------------------------------------------------------------------------------
# GitHub Actions OIDC Provider
# Requirements: 21.1 - Create IAM role for GitHub Actions with OIDC provider
#------------------------------------------------------------------------------
resource "aws_iam_openid_connect_provider" "github_actions" {
  count = var.create_github_oidc_provider ? 1 : 0

  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  # GitHub's OIDC thumbprint
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-github-actions-oidc"
  })
}

#------------------------------------------------------------------------------
# GitHub Actions IAM Role
# Requirements: 21.1 - Create IAM role for GitHub Actions with OIDC provider
#------------------------------------------------------------------------------
data "aws_iam_policy_document" "github_actions_assume_role" {
  statement {
    sid     = "AllowGitHubActionsAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type = "Federated"
      identifiers = var.create_github_oidc_provider ? [
        aws_iam_openid_connect_provider.github_actions[0].arn
      ] : [var.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = var.github_repositories
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name               = "${local.name_prefix}-github-actions"
  description        = "IAM role for GitHub Actions CI/CD pipelines"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role.json

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-github-actions"
  })
}

#------------------------------------------------------------------------------
# GitHub Actions IAM Policy - Lambda Deployment
#------------------------------------------------------------------------------
data "aws_iam_policy_document" "github_actions_lambda" {
  # S3 permissions for Lambda deployment packages
  statement {
    sid    = "S3LambdaDeployment"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket"
    ]
    resources = [
      var.lambda_deployment_bucket_arn,
      "${var.lambda_deployment_bucket_arn}/*"
    ]
  }

  # Lambda function update permissions
  statement {
    sid    = "LambdaUpdate"
    effect = "Allow"
    actions = [
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:PublishVersion",
      "lambda:UpdateAlias",
      "lambda:GetAlias"
    ]
    resources = var.lambda_function_arns
  }

  # Lambda layer permissions
  statement {
    sid    = "LambdaLayers"
    effect = "Allow"
    actions = [
      "lambda:PublishLayerVersion",
      "lambda:GetLayerVersion",
      "lambda:DeleteLayerVersion"
    ]
    resources = ["arn:aws:lambda:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:layer:${local.name_prefix}-*"]
  }
}

resource "aws_iam_policy" "github_actions_lambda" {
  name        = "${local.name_prefix}-github-actions-lambda"
  description = "IAM policy for GitHub Actions Lambda deployment"
  policy      = data.aws_iam_policy_document.github_actions_lambda.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "github_actions_lambda" {
  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.github_actions_lambda.arn
}


#------------------------------------------------------------------------------
# GitHub Actions IAM Policy - Frontend Deployment
#------------------------------------------------------------------------------
data "aws_iam_policy_document" "github_actions_frontend" {
  # S3 permissions for frontend assets
  statement {
    sid    = "S3FrontendAssets"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket"
    ]
    resources = [
      var.frontend_assets_bucket_arn,
      "${var.frontend_assets_bucket_arn}/*"
    ]
  }

  # CloudFront invalidation permissions (only when distribution ARN is provided)
  dynamic "statement" {
    for_each = var.cloudfront_distribution_arn != null ? [1] : []
    content {
      sid    = "CloudFrontInvalidation"
      effect = "Allow"
      actions = [
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation",
        "cloudfront:ListInvalidations"
      ]
      resources = [var.cloudfront_distribution_arn]
    }
  }
}

resource "aws_iam_policy" "github_actions_frontend" {
  name        = "${local.name_prefix}-github-actions-frontend"
  description = "IAM policy for GitHub Actions frontend deployment"
  policy      = data.aws_iam_policy_document.github_actions_frontend.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "github_actions_frontend" {
  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.github_actions_frontend.arn
}

#------------------------------------------------------------------------------
# GitHub Actions IAM Policy - ECR Access
#------------------------------------------------------------------------------
data "aws_iam_policy_document" "github_actions_ecr" {
  count = var.create_ecr_repository ? 1 : 0

  # ECR authentication
  statement {
    sid    = "ECRAuth"
    effect = "Allow"
    actions = [
      "ecr:GetAuthorizationToken"
    ]
    resources = ["*"]
  }

  # ECR repository permissions
  statement {
    sid    = "ECRRepository"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeRepositories",
      "ecr:DescribeImages",
      "ecr:ListImages"
    ]
    resources = [aws_ecr_repository.main[0].arn]
  }
}

resource "aws_iam_policy" "github_actions_ecr" {
  count = var.create_ecr_repository ? 1 : 0

  name        = "${local.name_prefix}-github-actions-ecr"
  description = "IAM policy for GitHub Actions ECR access"
  policy      = data.aws_iam_policy_document.github_actions_ecr[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "github_actions_ecr" {
  count = var.create_ecr_repository ? 1 : 0

  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.github_actions_ecr[0].arn
}

#------------------------------------------------------------------------------
# GitHub Actions IAM Policy - CloudWatch Logs
#------------------------------------------------------------------------------
data "aws_iam_policy_document" "github_actions_logs" {
  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams"
    ]
    resources = [
      "${aws_cloudwatch_log_group.cicd.arn}:*"
    ]
  }
}

resource "aws_iam_policy" "github_actions_logs" {
  name        = "${local.name_prefix}-github-actions-logs"
  description = "IAM policy for GitHub Actions CloudWatch Logs access"
  policy      = data.aws_iam_policy_document.github_actions_logs.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "github_actions_logs" {
  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.github_actions_logs.arn
}

#------------------------------------------------------------------------------
# AWS CodePipeline IAM Role (Alternative)
# Requirements: 21.1 - Create IAM role for AWS CodePipeline (alternative)
#------------------------------------------------------------------------------
data "aws_iam_policy_document" "codepipeline_assume_role" {
  statement {
    sid     = "AllowCodePipelineAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["codepipeline.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "codepipeline" {
  count = var.create_codepipeline_role ? 1 : 0

  name               = "${local.name_prefix}-codepipeline"
  description        = "IAM role for AWS CodePipeline CI/CD"
  assume_role_policy = data.aws_iam_policy_document.codepipeline_assume_role.json

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-codepipeline"
  })
}

data "aws_iam_policy_document" "codepipeline" {
  count = var.create_codepipeline_role ? 1 : 0

  # S3 permissions
  statement {
    sid    = "S3Access"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:GetObjectVersion",
      "s3:GetBucketVersioning"
    ]
    resources = [
      var.lambda_deployment_bucket_arn,
      "${var.lambda_deployment_bucket_arn}/*",
      var.frontend_assets_bucket_arn,
      "${var.frontend_assets_bucket_arn}/*"
    ]
  }

  # CodeBuild permissions
  statement {
    sid    = "CodeBuild"
    effect = "Allow"
    actions = [
      "codebuild:BatchGetBuilds",
      "codebuild:StartBuild"
    ]
    resources = ["*"]
  }

  # Lambda permissions
  statement {
    sid    = "Lambda"
    effect = "Allow"
    actions = [
      "lambda:InvokeFunction",
      "lambda:ListFunctions"
    ]
    resources = ["*"]
  }

  # CloudWatch Logs permissions
  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "codepipeline" {
  count = var.create_codepipeline_role ? 1 : 0

  name        = "${local.name_prefix}-codepipeline"
  description = "IAM policy for AWS CodePipeline"
  policy      = data.aws_iam_policy_document.codepipeline[0].json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "codepipeline" {
  count = var.create_codepipeline_role ? 1 : 0

  role       = aws_iam_role.codepipeline[0].name
  policy_arn = aws_iam_policy.codepipeline[0].arn
}


#------------------------------------------------------------------------------
# ECR Repository for Container Images
# Requirements: 21.3 - Create ECR repository for container images (if needed)
#------------------------------------------------------------------------------
resource "aws_ecr_repository" "main" {
  count = var.create_ecr_repository ? 1 : 0

  name                 = "${local.name_prefix}-app"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-app"
  })
}

# ECR Lifecycle Policy - Keep only recent images
resource "aws_ecr_lifecycle_policy" "main" {
  count = var.create_ecr_repository ? 1 : 0

  repository = aws_ecr_repository.main[0].name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last ${var.ecr_image_retention_count} images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.ecr_image_retention_count
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

#------------------------------------------------------------------------------
# CloudWatch Log Groups for CI/CD Execution
# Requirements: 21.5 - Create CloudWatch log groups for CI/CD execution logs
#------------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "cicd" {
  name              = "/aws/cicd/${local.name_prefix}"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-cicd-logs"
  })
}

resource "aws_cloudwatch_log_group" "github_actions" {
  name              = "/aws/cicd/${local.name_prefix}/github-actions"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-github-actions-logs"
  })
}

resource "aws_cloudwatch_log_group" "codepipeline" {
  count = var.create_codepipeline_role ? 1 : 0

  name              = "/aws/cicd/${local.name_prefix}/codepipeline"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-codepipeline-logs"
  })
}

resource "aws_cloudwatch_log_group" "codebuild" {
  count = var.create_codepipeline_role ? 1 : 0

  name              = "/aws/codebuild/${local.name_prefix}"
  retention_in_days = var.log_retention_days

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-codebuild-logs"
  })
}
