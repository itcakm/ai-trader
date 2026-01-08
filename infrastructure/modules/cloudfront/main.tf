# CloudFront Module - CDN Distribution for Frontend
# Creates CloudFront distribution for serving Next.js frontend from S3
# Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.9

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = var.project_name
    Module      = "cloudfront"
    ManagedBy   = "terraform"
  })

  # Combine primary domain with aliases
  all_aliases = concat([var.domain_name], var.domain_aliases)

  # AWS Managed Cache Policy IDs
  # https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html
  caching_disabled_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
}

#------------------------------------------------------------------------------
# Origin Access Identity (OAI) for S3 Access
# Requirements: 10.6 - Configure origin access identity for S3 bucket access
#------------------------------------------------------------------------------
resource "aws_cloudfront_origin_access_identity" "main" {
  comment = "OAI for ${local.name_prefix} frontend assets"
}

#------------------------------------------------------------------------------
# S3 Bucket Policy for CloudFront OAI Access
# Requirements: 10.6 - Configure origin access identity for S3 bucket access
# Note: Only create if manage_s3_bucket_policy is true (default: false)
# The S3 module can manage this policy using the cloudfront_oai_arn variable
#------------------------------------------------------------------------------
resource "aws_s3_bucket_policy" "cloudfront_access" {
  count  = var.manage_s3_bucket_policy ? 1 : 0
  bucket = var.s3_bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAIAccess"
        Effect = "Allow"
        Principal = {
          AWS = aws_cloudfront_origin_access_identity.main.iam_arn
        }
        Action   = "s3:GetObject"
        Resource = "${var.s3_bucket_arn}/*"
      }
    ]
  })
}

#------------------------------------------------------------------------------
# Cache Policy for Static Assets
# Requirements: 10.5 - Configure cache behaviors for static assets (1 year TTL)
#------------------------------------------------------------------------------
resource "aws_cloudfront_cache_policy" "static_assets" {
  name        = "${local.name_prefix}-static-assets"
  comment     = "Cache policy for static assets with 1 year TTL"
  default_ttl = var.static_assets_ttl
  max_ttl     = var.static_assets_ttl
  min_ttl     = var.static_assets_ttl

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

#------------------------------------------------------------------------------
# Origin Request Policy
#------------------------------------------------------------------------------
resource "aws_cloudfront_origin_request_policy" "s3_origin" {
  name    = "${local.name_prefix}-s3-origin"
  comment = "Origin request policy for S3 origin"

  cookies_config {
    cookie_behavior = "none"
  }
  headers_config {
    header_behavior = "none"
  }
  query_strings_config {
    query_string_behavior = "none"
  }
}

#------------------------------------------------------------------------------
# Response Headers Policy for Security
#------------------------------------------------------------------------------
resource "aws_cloudfront_response_headers_policy" "security_headers" {
  name    = "${local.name_prefix}-security-headers"
  comment = "Security headers policy for frontend"

  security_headers_config {
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
      override = true
    }
  }
}

#------------------------------------------------------------------------------
# CloudFront Distribution
# Requirements: 10.1 - Create distribution for frontend S3 bucket
# Requirements: 10.2 - Configure HTTPS-only access with TLS 1.2 minimum
# Requirements: 10.3 - Configure custom domain with ACM certificate
# Requirements: 10.4 - Enable compression for text-based assets
# Requirements: 10.9 - Integrate with WAF for request filtering
#------------------------------------------------------------------------------
resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = var.enable_ipv6
  comment             = "${local.name_prefix} frontend distribution"
  default_root_object = var.default_root_object
  price_class         = var.price_class
  http_version        = var.http_version
  aliases             = local.all_aliases

  # WAF Integration
  # Requirements: 10.9 - Integrate with WAF for request filtering
  web_acl_id = var.waf_web_acl_arn

  # S3 Origin Configuration
  # Requirements: 10.1 - Create distribution for frontend S3 bucket
  origin {
    domain_name = var.s3_bucket_regional_domain_name
    origin_id   = "S3-${var.s3_bucket_id}"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.main.cloudfront_access_identity_path
    }
  }

  # Default Cache Behavior (for HTML and dynamic content)
  # Requirements: 10.5 - Configure cache behaviors for dynamic content (no cache)
  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.s3_bucket_id}"

    # Use AWS managed CachingDisabled policy for dynamic content
    cache_policy_id            = local.caching_disabled_policy_id
    origin_request_policy_id   = aws_cloudfront_origin_request_policy.s3_origin.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id

    # Requirements: 10.2 - Configure HTTPS-only access
    viewer_protocol_policy = "redirect-to-https"

    # Requirements: 10.4 - Enable compression for text-based assets
    compress = var.enable_compression
  }

  # Cache Behavior for Static Assets (_next/static/*)
  # Requirements: 10.5 - Configure cache behaviors for static assets (1 year TTL)
  ordered_cache_behavior {
    path_pattern     = "_next/static/*"
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.s3_bucket_id}"

    cache_policy_id            = aws_cloudfront_cache_policy.static_assets.id
    origin_request_policy_id   = aws_cloudfront_origin_request_policy.s3_origin.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id

    viewer_protocol_policy = "redirect-to-https"
    compress               = var.enable_compression
  }

  # Cache Behavior for Static Files (images, fonts, etc.)
  ordered_cache_behavior {
    path_pattern     = "static/*"
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.s3_bucket_id}"

    cache_policy_id            = aws_cloudfront_cache_policy.static_assets.id
    origin_request_policy_id   = aws_cloudfront_origin_request_policy.s3_origin.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id

    viewer_protocol_policy = "redirect-to-https"
    compress               = var.enable_compression
  }

  # Cache Behavior for Favicon and other root static files
  ordered_cache_behavior {
    path_pattern     = "*.ico"
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.s3_bucket_id}"

    cache_policy_id            = aws_cloudfront_cache_policy.static_assets.id
    origin_request_policy_id   = aws_cloudfront_origin_request_policy.s3_origin.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id

    viewer_protocol_policy = "redirect-to-https"
    compress               = var.enable_compression
  }

  # Custom Error Responses for SPA Routing
  dynamic "custom_error_response" {
    for_each = var.custom_error_responses
    content {
      error_code            = custom_error_response.value.error_code
      response_code         = custom_error_response.value.response_code
      response_page_path    = custom_error_response.value.response_page_path
      error_caching_min_ttl = custom_error_response.value.error_caching_min_ttl
    }
  }

  # Geographic Restrictions
  # Requirements: 10.8 - Configure geographic restrictions if required
  restrictions {
    geo_restriction {
      restriction_type = var.geo_restriction_type
      locations        = var.geo_restriction_locations
    }
  }

  # SSL/TLS Configuration
  # Requirements: 10.2 - Configure HTTPS-only access with TLS 1.2 minimum
  # Requirements: 10.3 - Configure custom domain with ACM certificate
  viewer_certificate {
    acm_certificate_arn            = var.acm_certificate_arn
    ssl_support_method             = var.ssl_support_method
    minimum_protocol_version       = var.minimum_protocol_version
    cloudfront_default_certificate = false
  }

  # Access Logging
  # Requirements: 10.7 - Enable access logging to S3
  dynamic "logging_config" {
    for_each = var.enable_logging && var.logging_bucket_domain_name != null ? [1] : []
    content {
      bucket          = var.logging_bucket_domain_name
      prefix          = var.logging_prefix
      include_cookies = var.logging_include_cookies
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-distribution"
  })
}
