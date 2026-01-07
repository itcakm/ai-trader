# WAF Module - Web Application Firewall for API Protection
# Creates Web ACLs for API Gateway and CloudFront with managed rule groups
# Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 7.10

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    Module      = "waf"
    ManagedBy   = "terraform"
  })
}

# Get current AWS region and account
data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

#------------------------------------------------------------------------------
# S3 Bucket for WAF Logs (must start with aws-waf-logs-)
# Requirements: 15.5 - Enable WAF logging to S3
#------------------------------------------------------------------------------
resource "aws_s3_bucket" "waf_logs" {
  count = var.enable_logging && var.create_waf_log_bucket ? 1 : 0

  bucket = "aws-waf-logs-${local.name_prefix}-${data.aws_caller_identity.current.account_id}"

  tags = merge(local.common_tags, {
    Name    = "aws-waf-logs-${local.name_prefix}"
    Purpose = "waf-logs"
  })
}

resource "aws_s3_bucket_versioning" "waf_logs" {
  count = var.enable_logging && var.create_waf_log_bucket ? 1 : 0

  bucket = aws_s3_bucket.waf_logs[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "waf_logs" {
  count = var.enable_logging && var.create_waf_log_bucket ? 1 : 0

  bucket = aws_s3_bucket.waf_logs[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "waf_logs" {
  count = var.enable_logging && var.create_waf_log_bucket ? 1 : 0

  bucket = aws_s3_bucket.waf_logs[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "waf_logs" {
  count = var.enable_logging && var.create_waf_log_bucket ? 1 : 0

  bucket = aws_s3_bucket.waf_logs[0].id

  rule {
    id     = "waf-log-retention"
    status = "Enabled"

    filter {
      prefix = ""
    }

    expiration {
      days = var.waf_log_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.waf_log_retention_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.waf_logs]
}

#------------------------------------------------------------------------------
# WAF Web ACL for API Gateway (Regional)
# Requirements: 15.1 - Create Web ACL for API Gateway
#------------------------------------------------------------------------------
resource "aws_wafv2_web_acl" "api_gateway" {
  name        = "${local.name_prefix}-api-waf"
  description = "WAF Web ACL for API Gateway - ${var.environment}"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # Rule 1: AWS Managed Common Rule Set
  # Requirements: 15.3 - Enable AWS managed rule groups
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-common-rules"
      sampled_requests_enabled   = true
    }
  }

  # Rule 2: AWS Managed Known Bad Inputs Rule Set
  # Requirements: 15.3 - Enable AWS managed rule groups
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  # Rule 3: Rate-based rule
  # Requirements: 15.4 - Configure rate-based rules (2000 requests per 5 minutes per IP)
  rule {
    name     = "RateLimitRule"
    priority = 3

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # Rule 4: SQL Injection Protection (Production only)
  # Requirements: 15.6 - Enable SQL injection protection for production
  dynamic "rule" {
    for_each = var.enable_sql_injection_protection ? [1] : []
    content {
      name     = "AWSManagedRulesSQLiRuleSet"
      priority = 4

      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          name        = "AWSManagedRulesSQLiRuleSet"
          vendor_name = "AWS"
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name_prefix}-sqli-rules"
        sampled_requests_enabled   = true
      }
    }
  }


  # Rule 5: XSS Protection (Production only)
  # Requirements: 15.6 - Enable XSS protection for production
  dynamic "rule" {
    for_each = var.enable_xss_protection ? [1] : []
    content {
      name     = "AWSManagedRulesXSSRuleSet"
      priority = 5

      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          name        = "AWSManagedRulesKnownBadInputsRuleSet"
          vendor_name = "AWS"

          # XSS rules are included in the Known Bad Inputs rule set
          # Adding explicit scope reduction for XSS patterns
          scope_down_statement {
            byte_match_statement {
              search_string         = "<script"
              positional_constraint = "CONTAINS"
              field_to_match {
                body {
                  oversize_handling = "CONTINUE"
                }
              }
              text_transformation {
                priority = 0
                type     = "LOWERCASE"
              }
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name_prefix}-xss-rules"
        sampled_requests_enabled   = true
      }
    }
  }

  # Rule 6: IP Reputation List
  # Requirements: 15.7 - Configure IP reputation lists
  rule {
    name     = "AWSManagedRulesAmazonIpReputationList"
    priority = 6

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  # Rule 7: Auth Rate Limiting Rule Group (Higher Priority)
  # Requirements: 2.1, 2.2, 2.3, 2.8, 2.9 - Rate limiting for auth endpoints
  dynamic "rule" {
    for_each = var.enable_auth_rate_limiting ? [1] : []
    content {
      name     = "AuthRateLimiting"
      priority = 7

      override_action {
        none {}
      }

      statement {
        rule_group_reference_statement {
          arn = aws_wafv2_rule_group.auth_rate_limiting[0].arn
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name_prefix}-auth-rate-limiting"
        sampled_requests_enabled   = true
      }
    }
  }

  # Rule 8: SSO Callback Allowlist (Bypass rate limiting for SSO callbacks)
  # Requirements: 2.8 - Ensure SSO callback traffic is allowed
  dynamic "rule" {
    for_each = var.enable_auth_rate_limiting && length(var.sso_callback_paths) > 0 ? [1] : []
    content {
      name     = "SSOCallbackAllowlist"
      priority = 8

      action {
        allow {}
      }

      statement {
        byte_match_statement {
          search_string         = "/auth/sso/callback"
          positional_constraint = "STARTS_WITH"
          field_to_match {
            uri_path {}
          }
          text_transformation {
            priority = 0
            type     = "LOWERCASE"
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name_prefix}-sso-callback-allow"
        sampled_requests_enabled   = true
      }
    }
  }

  # Rule 9: Auth Security Rule Group (Lower Priority than rate limiting)
  # Requirements: 2.4, 2.5, 2.6, 2.7 - Security rules for auth endpoints
  dynamic "rule" {
    for_each = var.enable_auth_security_rules ? [1] : []
    content {
      name     = "AuthSecurity"
      priority = 9

      override_action {
        none {}
      }

      statement {
        rule_group_reference_statement {
          arn = aws_wafv2_rule_group.auth_security[0].arn
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name_prefix}-auth-security"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-api-waf"
    sampled_requests_enabled   = true
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-api-waf"
  })
}

#------------------------------------------------------------------------------
# WAF Web ACL for CloudFront (Global - must be in us-east-1)
# Requirements: 15.2 - Create Web ACL for CloudFront
# Note: This resource should be created in us-east-1 region for CloudFront
#------------------------------------------------------------------------------
resource "aws_wafv2_web_acl" "cloudfront" {
  count = var.create_cloudfront_waf ? 1 : 0

  provider    = aws.us_east_1
  name        = "${local.name_prefix}-cloudfront-waf"
  description = "WAF Web ACL for CloudFront - ${var.environment}"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Rule 1: AWS Managed Common Rule Set
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-cf-common-rules"
      sampled_requests_enabled   = true
    }
  }

  # Rule 2: AWS Managed Known Bad Inputs Rule Set
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-cf-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  # Rule 3: Rate-based rule for CloudFront
  rule {
    name     = "RateLimitRule"
    priority = 3

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.cloudfront_rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-cf-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # Rule 4: IP Reputation List for CloudFront
  rule {
    name     = "AWSManagedRulesAmazonIpReputationList"
    priority = 4

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-cf-ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-cloudfront-waf"
    sampled_requests_enabled   = true
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-cloudfront-waf"
  })
}


#------------------------------------------------------------------------------
# WAF Association with API Gateway
# Requirements: 7.10 - Associate Web ACL with API Gateway
#------------------------------------------------------------------------------
resource "aws_wafv2_web_acl_association" "api_gateway" {
  count = var.associate_api_gateway ? 1 : 0

  resource_arn = var.api_gateway_stage_arn
  web_acl_arn  = aws_wafv2_web_acl.api_gateway.arn
}

#------------------------------------------------------------------------------
# WAF Logging Configuration for API Gateway
# Requirements: 15.5 - Enable WAF logging to S3
#------------------------------------------------------------------------------
resource "aws_wafv2_web_acl_logging_configuration" "api_gateway" {
  count = var.enable_logging && var.create_waf_log_bucket ? 1 : 0

  log_destination_configs = [aws_s3_bucket.waf_logs[0].arn]
  resource_arn            = aws_wafv2_web_acl.api_gateway.arn

  # Optional: Filter logs to only include blocked requests
  dynamic "logging_filter" {
    for_each = var.log_blocked_requests_only ? [1] : []
    content {
      default_behavior = "DROP"

      filter {
        behavior    = "KEEP"
        requirement = "MEETS_ANY"

        condition {
          action_condition {
            action = "BLOCK"
          }
        }
      }
    }
  }

  # Redact sensitive fields from logs
  dynamic "redacted_fields" {
    for_each = var.redact_authorization_header ? [1] : []
    content {
      single_header {
        name = "authorization"
      }
    }
  }

  depends_on = [aws_s3_bucket.waf_logs]
}

#------------------------------------------------------------------------------
# S3 Bucket for CloudFront WAF Logs (must be in us-east-1)
# Requirements: 15.5 - Enable WAF logging to S3
#------------------------------------------------------------------------------
resource "aws_s3_bucket" "cloudfront_waf_logs" {
  count = var.create_cloudfront_waf && var.enable_logging && var.create_waf_log_bucket ? 1 : 0

  provider = aws.us_east_1
  bucket   = "aws-waf-logs-${local.name_prefix}-cf-${data.aws_caller_identity.current.account_id}"

  tags = merge(local.common_tags, {
    Name    = "aws-waf-logs-${local.name_prefix}-cf"
    Purpose = "cloudfront-waf-logs"
  })
}

resource "aws_s3_bucket_versioning" "cloudfront_waf_logs" {
  count = var.create_cloudfront_waf && var.enable_logging && var.create_waf_log_bucket ? 1 : 0

  provider = aws.us_east_1
  bucket   = aws_s3_bucket.cloudfront_waf_logs[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudfront_waf_logs" {
  count = var.create_cloudfront_waf && var.enable_logging && var.create_waf_log_bucket ? 1 : 0

  provider = aws.us_east_1
  bucket   = aws_s3_bucket.cloudfront_waf_logs[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "cloudfront_waf_logs" {
  count = var.create_cloudfront_waf && var.enable_logging && var.create_waf_log_bucket ? 1 : 0

  provider = aws.us_east_1
  bucket   = aws_s3_bucket.cloudfront_waf_logs[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "cloudfront_waf_logs" {
  count = var.create_cloudfront_waf && var.enable_logging && var.create_waf_log_bucket ? 1 : 0

  provider = aws.us_east_1
  bucket   = aws_s3_bucket.cloudfront_waf_logs[0].id

  rule {
    id     = "waf-log-retention"
    status = "Enabled"

    filter {
      prefix = ""
    }

    expiration {
      days = var.waf_log_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.waf_log_retention_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.cloudfront_waf_logs]
}

#------------------------------------------------------------------------------
# WAF Logging Configuration for CloudFront
# Requirements: 15.5 - Enable WAF logging to S3
#------------------------------------------------------------------------------
resource "aws_wafv2_web_acl_logging_configuration" "cloudfront" {
  count = var.create_cloudfront_waf && var.enable_logging && var.create_waf_log_bucket ? 1 : 0

  provider                = aws.us_east_1
  log_destination_configs = [aws_s3_bucket.cloudfront_waf_logs[0].arn]
  resource_arn            = aws_wafv2_web_acl.cloudfront[0].arn

  # Optional: Filter logs to only include blocked requests
  dynamic "logging_filter" {
    for_each = var.log_blocked_requests_only ? [1] : []
    content {
      default_behavior = "DROP"

      filter {
        behavior    = "KEEP"
        requirement = "MEETS_ANY"

        condition {
          action_condition {
            action = "BLOCK"
          }
        }
      }
    }
  }

  # Redact sensitive fields from logs
  dynamic "redacted_fields" {
    for_each = var.redact_authorization_header ? [1] : []
    content {
      single_header {
        name = "authorization"
      }
    }
  }

  depends_on = [aws_s3_bucket.cloudfront_waf_logs]
}

#------------------------------------------------------------------------------
# IP Set for Custom Blocking (Optional)
#------------------------------------------------------------------------------
resource "aws_wafv2_ip_set" "blocked_ips" {
  count = length(var.blocked_ip_addresses) > 0 ? 1 : 0

  name               = "${local.name_prefix}-blocked-ips"
  description        = "IP addresses blocked from accessing the API"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  addresses          = var.blocked_ip_addresses

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-blocked-ips"
  })
}

#------------------------------------------------------------------------------
# IP Set for Allowlist (Optional)
#------------------------------------------------------------------------------
resource "aws_wafv2_ip_set" "allowed_ips" {
  count = length(var.allowed_ip_addresses) > 0 ? 1 : 0

  name               = "${local.name_prefix}-allowed-ips"
  description        = "IP addresses allowed to bypass rate limiting"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  addresses          = var.allowed_ip_addresses

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-allowed-ips"
  })
}
