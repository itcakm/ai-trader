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
# Auth Rate Limiting Configuration
# Requirements: 2.1, 2.2, 2.3, 2.9 - Rate limiting for auth endpoints
#------------------------------------------------------------------------------
variable "enable_auth_rate_limiting" {
  type        = bool
  description = "Enable auth-specific rate limiting rules"
  default     = true
}

variable "auth_login_rate_limit" {
  type        = number
  description = "Rate limit for login endpoint (requests per 5 minutes per IP). Default: 100"
  default     = 100
}

variable "auth_signup_rate_limit" {
  type        = number
  description = "Rate limit for signup endpoint (requests per 5 minutes per IP). Default: 10"
  default     = 10
}

variable "auth_password_reset_rate_limit" {
  type        = number
  description = "Rate limit for password reset endpoints (requests per 5 minutes per IP). Minimum: 10 (AWS WAF requirement)"
  default     = 10

  validation {
    condition     = var.auth_password_reset_rate_limit >= 10
    error_message = "AWS WAF rate_based_statement limit must be at least 10."
  }
}

variable "auth_email_verification_rate_limit" {
  type        = number
  description = "Rate limit for email verification endpoints (requests per 5 minutes per IP). Default: 20"
  default     = 20
}

variable "auth_mfa_rate_limit" {
  type        = number
  description = "Rate limit for MFA endpoints (requests per 5 minutes per IP). Default: 50"
  default     = 50
}

#------------------------------------------------------------------------------
# Auth Security Rules Configuration
# Requirements: 2.4, 2.5, 2.6, 2.7 - Security rules for auth endpoints
#------------------------------------------------------------------------------
variable "enable_auth_security_rules" {
  type        = bool
  description = "Enable auth-specific security rules (SQL injection, XSS, IP reputation)"
  default     = true
}

variable "enable_auth_sql_injection_protection" {
  type        = bool
  description = "Enable SQL injection protection for auth endpoints"
  default     = true
}

variable "enable_auth_xss_protection" {
  type        = bool
  description = "Enable XSS protection for auth endpoints"
  default     = true
}

variable "enable_auth_ip_reputation" {
  type        = bool
  description = "Enable IP reputation blocking for auth endpoints"
  default     = true
}

#------------------------------------------------------------------------------
# SSO Configuration
# Requirements: 2.8 - Allow SSO callback traffic
#------------------------------------------------------------------------------
variable "sso_callback_paths" {
  type        = list(string)
  description = "List of SSO callback paths to allow through rate limiting"
  default     = ["/auth/sso/callback"]
}

#------------------------------------------------------------------------------
# Auth WAF Logging Configuration
# Requirements: 2.7 - Configure CloudWatch logging for blocked requests
#------------------------------------------------------------------------------
variable "auth_waf_log_retention_days" {
  type        = number
  description = "Retention period for auth WAF logs in CloudWatch (days)"
  default     = 90
}

#------------------------------------------------------------------------------
# Auth Security Alarms Configuration
# Requirements: 2.7 - Monitor blocked requests
#------------------------------------------------------------------------------
variable "enable_auth_security_alarms" {
  type        = bool
  description = "Enable CloudWatch alarms for auth security events"
  default     = true
}

variable "auth_sqli_alarm_threshold" {
  type        = number
  description = "Threshold for SQL injection alarm (blocked requests per 5 minutes)"
  default     = 10
}

variable "auth_xss_alarm_threshold" {
  type        = number
  description = "Threshold for XSS alarm (blocked requests per 5 minutes)"
  default     = 10
}

variable "auth_rate_limit_alarm_threshold" {
  type        = number
  description = "Threshold for rate limit alarm (blocked requests per 5 minutes)"
  default     = 50
}

variable "auth_security_alarm_actions" {
  type        = list(string)
  description = "List of ARNs to notify when auth security alarms trigger (e.g., SNS topic ARNs)"
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
