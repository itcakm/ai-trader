# API Gateway Module Variables
# Defines input variables for REST API configuration
# Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9

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
# Domain Configuration
#------------------------------------------------------------------------------
variable "api_domain_name" {
  type        = string
  description = "Custom domain name for API Gateway"
}

variable "certificate_arn" {
  type        = string
  description = "ACM certificate ARN for custom domain"
}

variable "frontend_domain" {
  type        = string
  description = "Frontend domain for CORS configuration"
}

#------------------------------------------------------------------------------
# Lambda Integration
#------------------------------------------------------------------------------
variable "lambda_function_arns" {
  type        = map(string)
  description = "Map of Lambda function ARNs by function name"
}

variable "lambda_function_invoke_arns" {
  type        = map(string)
  description = "Map of Lambda function invoke ARNs by function name"
}

variable "lambda_function_names" {
  type        = map(string)
  description = "Map of Lambda function names by logical name"
}

#------------------------------------------------------------------------------
# Throttling Configuration
#------------------------------------------------------------------------------
variable "throttling_rate_limit" {
  type        = number
  description = "API Gateway rate limit (requests per second)"
  default     = 1000
}

variable "throttling_burst_limit" {
  type        = number
  description = "API Gateway burst limit"
  default     = 2000
}

#------------------------------------------------------------------------------
# Caching Configuration
#------------------------------------------------------------------------------
variable "enable_caching" {
  type        = bool
  description = "Enable API Gateway caching (production only)"
  default     = false
}

variable "cache_size" {
  type        = string
  description = "Cache cluster size (0.5, 1.6, 6.1, 13.5, 28.4, 58.2, 118, 237)"
  default     = "0.5"
}

variable "cache_ttl_seconds" {
  type        = number
  description = "Default cache TTL in seconds"
  default     = 300
}

#------------------------------------------------------------------------------
# Logging Configuration
#------------------------------------------------------------------------------
variable "log_retention_days" {
  type        = number
  description = "CloudWatch log retention in days"
  default     = 30
}

variable "enable_access_logging" {
  type        = bool
  description = "Enable API Gateway access logging"
  default     = true
}

variable "enable_execution_logging" {
  type        = bool
  description = "Enable API Gateway execution logging"
  default     = true
}

variable "logging_level" {
  type        = string
  description = "Logging level (OFF, ERROR, INFO)"
  default     = "INFO"
}

#------------------------------------------------------------------------------
# Usage Plans and API Keys
#------------------------------------------------------------------------------
variable "enable_api_keys" {
  type        = bool
  description = "Enable API keys for tenant isolation"
  default     = true
}

variable "usage_plan_quota_limit" {
  type        = number
  description = "Monthly quota limit for usage plan"
  default     = 1000000
}

variable "usage_plan_quota_period" {
  type        = string
  description = "Quota period (DAY, WEEK, MONTH)"
  default     = "MONTH"
}

#------------------------------------------------------------------------------
# WAF Integration
#------------------------------------------------------------------------------
variable "waf_web_acl_arn" {
  type        = string
  description = "WAF Web ACL ARN to associate with API Gateway"
  default     = ""
}

#------------------------------------------------------------------------------
# Tags
#------------------------------------------------------------------------------
variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}
