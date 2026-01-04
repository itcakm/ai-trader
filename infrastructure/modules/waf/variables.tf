# WAF Module Variables
# Defines input variables for WAF Web ACL configuration
# Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 7.10

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
# Rate Limiting Configuration
# Requirements: 15.4 - Configure rate-based rules
#------------------------------------------------------------------------------
variable "rate_limit" {
  type        = number
  description = "Rate limit for API Gateway (requests per 5 minutes per IP). Default: 2000"
  default     = 2000
}

variable "cloudfront_rate_limit" {
  type        = number
  description = "Rate limit for CloudFront (requests per 5 minutes per IP). Default: 5000"
  default     = 5000
}

#------------------------------------------------------------------------------
# Protection Rules Configuration
# Requirements: 15.6 - Enable SQL injection and XSS protection for production
#------------------------------------------------------------------------------
variable "enable_sql_injection_protection" {
  type        = bool
  description = "Enable SQL injection protection rules (recommended for production)"
  default     = false
}

variable "enable_xss_protection" {
  type        = bool
  description = "Enable XSS protection rules (recommended for production)"
  default     = false
}

#------------------------------------------------------------------------------
# CloudFront WAF Configuration
# Requirements: 15.2 - Create Web ACL for CloudFront
#------------------------------------------------------------------------------
variable "create_cloudfront_waf" {
  type        = bool
  description = "Create WAF Web ACL for CloudFront (requires us-east-1 provider)"
  default     = false
}

#------------------------------------------------------------------------------
# API Gateway Association
# Requirements: 7.10 - Associate Web ACL with API Gateway
#------------------------------------------------------------------------------
variable "api_gateway_stage_arn" {
  type        = string
  description = "ARN of the API Gateway stage to associate with WAF"
  default     = ""
}

variable "associate_api_gateway" {
  type        = bool
  description = "Whether to associate WAF with API Gateway stage"
  default     = true
}

#------------------------------------------------------------------------------
# Logging Configuration
# Requirements: 15.5 - Enable WAF logging to S3
#------------------------------------------------------------------------------
variable "enable_logging" {
  type        = bool
  description = "Enable WAF logging"
  default     = true
}

variable "create_waf_log_bucket" {
  type        = bool
  description = "Create dedicated S3 bucket for WAF logs (must start with aws-waf-logs-)"
  default     = true
}

variable "waf_log_retention_days" {
  type        = number
  description = "Retention period for WAF logs in days"
  default     = 90
}

variable "log_blocked_requests_only" {
  type        = bool
  description = "Only log blocked requests (reduces log volume)"
  default     = false
}

variable "redact_authorization_header" {
  type        = bool
  description = "Redact Authorization header from WAF logs"
  default     = true
}

#------------------------------------------------------------------------------
# IP Lists Configuration
# Requirements: 15.7 - Configure IP reputation lists
#------------------------------------------------------------------------------
variable "blocked_ip_addresses" {
  type        = list(string)
  description = "List of IP addresses to block (CIDR notation)"
  default     = []
}

variable "allowed_ip_addresses" {
  type        = list(string)
  description = "List of IP addresses to allow (bypass rate limiting)"
  default     = []
}

#------------------------------------------------------------------------------
# Tags
#------------------------------------------------------------------------------
variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}
