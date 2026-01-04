# CloudFront Module Variables
# Variables for CloudFront distribution configuration
# Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.9

variable "environment" {
  type        = string
  description = "Environment name (test/production)"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
  default     = "crypto-trading"
}

#------------------------------------------------------------------------------
# Origin Configuration
#------------------------------------------------------------------------------
variable "s3_bucket_id" {
  type        = string
  description = "ID of the S3 bucket to use as origin (frontend-assets bucket)"
}

variable "s3_bucket_arn" {
  type        = string
  description = "ARN of the S3 bucket to use as origin"
}

variable "s3_bucket_regional_domain_name" {
  type        = string
  description = "Regional domain name of the S3 bucket"
}

variable "manage_s3_bucket_policy" {
  type        = bool
  description = "Whether CloudFront module should manage the S3 bucket policy. Set to false if S3 module manages it."
  default     = false
}

#------------------------------------------------------------------------------
# Domain and Certificate Configuration
# Requirements: 10.3 - Configure custom domain with ACM certificate
#------------------------------------------------------------------------------
variable "domain_name" {
  type        = string
  description = "Custom domain name for CloudFront distribution"
}

variable "domain_aliases" {
  type        = list(string)
  description = "Additional domain aliases for CloudFront distribution"
  default     = []
}

variable "acm_certificate_arn" {
  type        = string
  description = "ARN of the ACM certificate in us-east-1 for CloudFront"
}

#------------------------------------------------------------------------------
# Security Configuration
# Requirements: 10.2 - Configure HTTPS-only access with TLS 1.2 minimum
#------------------------------------------------------------------------------
variable "minimum_protocol_version" {
  type        = string
  description = "Minimum TLS protocol version (TLSv1.2_2021 recommended)"
  default     = "TLSv1.2_2021"
}

variable "ssl_support_method" {
  type        = string
  description = "SSL support method (sni-only or vip)"
  default     = "sni-only"
}

variable "waf_web_acl_arn" {
  type        = string
  description = "ARN of the WAF Web ACL to associate with CloudFront"
  default     = null
}

#------------------------------------------------------------------------------
# Cache Behavior Configuration
# Requirements: 10.5 - Configure cache behaviors for static assets (1 year) and dynamic content (no cache)
#------------------------------------------------------------------------------
variable "default_ttl" {
  type        = number
  description = "Default TTL for cached objects in seconds"
  default     = 86400 # 1 day
}

variable "max_ttl" {
  type        = number
  description = "Maximum TTL for cached objects in seconds"
  default     = 31536000 # 1 year
}

variable "min_ttl" {
  type        = number
  description = "Minimum TTL for cached objects in seconds"
  default     = 0
}

variable "static_assets_ttl" {
  type        = number
  description = "TTL for static assets (js, css, images) in seconds"
  default     = 31536000 # 1 year
}

variable "static_assets_patterns" {
  type        = list(string)
  description = "Path patterns for static assets"
  default     = ["*.js", "*.css", "*.png", "*.jpg", "*.jpeg", "*.gif", "*.ico", "*.svg", "*.woff", "*.woff2", "*.ttf", "*.eot"]
}

#------------------------------------------------------------------------------
# Compression Configuration
# Requirements: 10.4 - Enable compression for text-based assets
#------------------------------------------------------------------------------
variable "enable_compression" {
  type        = bool
  description = "Enable automatic compression for text-based assets"
  default     = true
}

#------------------------------------------------------------------------------
# Logging Configuration
# Requirements: 10.7 - Enable access logging to S3
#------------------------------------------------------------------------------
variable "enable_logging" {
  type        = bool
  description = "Enable CloudFront access logging"
  default     = true
}

variable "logging_bucket_domain_name" {
  type        = string
  description = "Domain name of the S3 bucket for access logs"
  default     = null
}

variable "logging_prefix" {
  type        = string
  description = "Prefix for CloudFront access logs"
  default     = "cloudfront-logs/"
}

variable "logging_include_cookies" {
  type        = bool
  description = "Include cookies in access logs"
  default     = false
}

#------------------------------------------------------------------------------
# Geographic Restrictions
# Requirements: 10.8 - Configure geographic restrictions if required (production)
#------------------------------------------------------------------------------
variable "geo_restriction_type" {
  type        = string
  description = "Geographic restriction type (none, whitelist, blacklist)"
  default     = "none"
}

variable "geo_restriction_locations" {
  type        = list(string)
  description = "List of country codes for geographic restriction"
  default     = []
}

#------------------------------------------------------------------------------
# Error Response Configuration
#------------------------------------------------------------------------------
variable "custom_error_responses" {
  type = list(object({
    error_code            = number
    response_code         = number
    response_page_path    = string
    error_caching_min_ttl = number
  }))
  description = "Custom error response configurations for SPA routing"
  default = [
    {
      error_code            = 403
      response_code         = 200
      response_page_path    = "/index.html"
      error_caching_min_ttl = 10
    },
    {
      error_code            = 404
      response_code         = 200
      response_page_path    = "/index.html"
      error_caching_min_ttl = 10
    }
  ]
}

#------------------------------------------------------------------------------
# Price Class Configuration
#------------------------------------------------------------------------------
variable "price_class" {
  type        = string
  description = "CloudFront price class (PriceClass_All, PriceClass_200, PriceClass_100)"
  default     = "PriceClass_100"
}

#------------------------------------------------------------------------------
# Default Root Object
#------------------------------------------------------------------------------
variable "default_root_object" {
  type        = string
  description = "Default root object for the distribution"
  default     = "index.html"
}

#------------------------------------------------------------------------------
# HTTP Version
#------------------------------------------------------------------------------
variable "http_version" {
  type        = string
  description = "Maximum HTTP version to support (http1.1, http2, http2and3, http3)"
  default     = "http2and3"
}

#------------------------------------------------------------------------------
# IPv6 Support
#------------------------------------------------------------------------------
variable "enable_ipv6" {
  type        = bool
  description = "Enable IPv6 support"
  default     = true
}

#------------------------------------------------------------------------------
# Tags
#------------------------------------------------------------------------------
variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}
