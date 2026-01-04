# S3 Module - Storage Buckets for AI-Assisted Crypto Trading System
# Creates S3 buckets for audit-logs, prompt-templates, model-outputs, 
# frontend-assets, and lambda-deployments

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  })

  # Define bucket configurations
  buckets = {
    audit-logs = {
      purpose           = "audit-logs"
      enable_logging    = true
      block_public      = true
      lifecycle_enabled = true
    }
    prompt-templates = {
      purpose           = "prompt-templates"
      enable_logging    = false
      block_public      = true
      lifecycle_enabled = false
    }
    model-outputs = {
      purpose           = "model-outputs"
      enable_logging    = false
      block_public      = true
      lifecycle_enabled = false
    }
    frontend-assets = {
      purpose           = "frontend-assets"
      enable_logging    = false
      block_public      = false # CloudFront needs access
      lifecycle_enabled = false
    }
    lambda-deployments = {
      purpose           = "lambda-deployments"
      enable_logging    = false
      block_public      = true
      lifecycle_enabled = false
    }
  }
}

# Get current AWS account ID
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

#------------------------------------------------------------------------------
# S3 Buckets
#------------------------------------------------------------------------------
resource "aws_s3_bucket" "buckets" {
  for_each = local.buckets

  bucket = "${local.name_prefix}-${each.key}-${data.aws_caller_identity.current.account_id}"

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-${each.key}"
    Purpose = each.value.purpose
  })
}

#------------------------------------------------------------------------------
# Bucket Versioning - Enable on all buckets (Requirement 5.2)
#------------------------------------------------------------------------------
resource "aws_s3_bucket_versioning" "buckets" {
  for_each = local.buckets

  bucket = aws_s3_bucket.buckets[each.key].id

  versioning_configuration {
    status = "Enabled"
  }
}


#------------------------------------------------------------------------------
# Server-Side Encryption - SSE-S3 on all buckets (Requirement 5.3)
#------------------------------------------------------------------------------
resource "aws_s3_bucket_server_side_encryption_configuration" "buckets" {
  for_each = local.buckets

  bucket = aws_s3_bucket.buckets[each.key].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

#------------------------------------------------------------------------------
# Public Access Block - Block public access on backend buckets (Requirement 5.4)
#------------------------------------------------------------------------------
resource "aws_s3_bucket_public_access_block" "buckets" {
  for_each = { for k, v in local.buckets : k => v if v.block_public }

  bucket = aws_s3_bucket.buckets[each.key].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

#------------------------------------------------------------------------------
# Access Logging for Audit-Logs Bucket (Requirement 5.6)
#------------------------------------------------------------------------------
resource "aws_s3_bucket_logging" "audit_logs" {
  count = var.enable_access_logging ? 1 : 0

  bucket = aws_s3_bucket.buckets["audit-logs"].id

  target_bucket = aws_s3_bucket.buckets["audit-logs"].id
  target_prefix = "access-logs/"
}

#------------------------------------------------------------------------------
# Lifecycle Policies (Requirement 5.5)
#------------------------------------------------------------------------------
resource "aws_s3_bucket_lifecycle_configuration" "audit_logs" {
  bucket = aws_s3_bucket.buckets["audit-logs"].id

  rule {
    id     = "audit-log-retention"
    status = "Enabled"

    filter {
      prefix = ""
    }

    expiration {
      days = var.audit_log_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.audit_log_retention_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.buckets]
}


#------------------------------------------------------------------------------
# Frontend Assets Bucket Policy for CloudFront (Requirement 5.7)
#------------------------------------------------------------------------------
resource "aws_s3_bucket_policy" "frontend_assets" {
  count = var.cloudfront_oai_arn != null ? 1 : 0

  bucket = aws_s3_bucket.buckets["frontend-assets"].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAIAccess"
        Effect = "Allow"
        Principal = {
          AWS = var.cloudfront_oai_arn
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.buckets["frontend-assets"].arn}/*"
      }
    ]
  })
}

# Public access block for frontend-assets (less restrictive for CloudFront)
resource "aws_s3_bucket_public_access_block" "frontend_assets" {
  bucket = aws_s3_bucket.buckets["frontend-assets"].id

  block_public_acls       = true
  block_public_policy     = false # Allow bucket policy for CloudFront
  ignore_public_acls      = true
  restrict_public_buckets = false # Allow CloudFront access
}

#------------------------------------------------------------------------------
# CORS Configuration for Frontend Assets
#------------------------------------------------------------------------------
resource "aws_s3_bucket_cors_configuration" "frontend_assets" {
  bucket = aws_s3_bucket.buckets["frontend-assets"].id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}


#------------------------------------------------------------------------------
# Lifecycle Policy for Lambda Deployments (cleanup old versions)
#------------------------------------------------------------------------------
resource "aws_s3_bucket_lifecycle_configuration" "lambda_deployments" {
  count = var.enable_lambda_deployments_lifecycle ? 1 : 0

  bucket = aws_s3_bucket.buckets["lambda-deployments"].id

  rule {
    id     = "cleanup-old-deployments"
    status = "Enabled"

    filter {
      prefix = ""
    }

    noncurrent_version_expiration {
      noncurrent_days = var.lambda_deployments_retention_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.buckets]
}

#------------------------------------------------------------------------------
# Lifecycle Policy for Model Outputs (cleanup old outputs)
#------------------------------------------------------------------------------
resource "aws_s3_bucket_lifecycle_configuration" "model_outputs" {
  count = var.enable_model_outputs_lifecycle ? 1 : 0

  bucket = aws_s3_bucket.buckets["model-outputs"].id

  rule {
    id     = "cleanup-old-outputs"
    status = "Enabled"

    filter {
      prefix = ""
    }

    noncurrent_version_expiration {
      noncurrent_days = var.model_outputs_retention_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.buckets]
}
