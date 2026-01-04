# Route 53 Module Variables
# Variables for DNS management and hosted zone configuration
# Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6

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
# Hosted Zone Configuration
# Requirements: 18.1 - Create hosted zones for application domains
#------------------------------------------------------------------------------
variable "domain_name" {
  type        = string
  description = "Primary domain name for the hosted zone (e.g., acinaces.com)"
}

variable "api_domain_name" {
  type        = string
  description = "API subdomain name (e.g., api.acinaces.com)"
}

variable "create_hosted_zone" {
  type        = bool
  description = "Whether to create a new hosted zone or use an existing one"
  default     = true
}

variable "hosted_zone_id" {
  type        = string
  description = "Existing hosted zone ID (required if create_hosted_zone is false)"
  default     = ""
}

#------------------------------------------------------------------------------
# CloudFront Configuration
# Requirements: 18.2 - Create A records (alias) for CloudFront distribution
#------------------------------------------------------------------------------
variable "create_cloudfront_record" {
  type        = bool
  description = "Whether to create DNS record for CloudFront distribution"
  default     = true
}

variable "cloudfront_domain_name" {
  type        = string
  description = "Domain name of the CloudFront distribution"
  default     = null
}

variable "cloudfront_hosted_zone_id" {
  type        = string
  description = "Hosted zone ID of the CloudFront distribution (always Z2FDTNDATAQYW2 for CloudFront)"
  default     = "Z2FDTNDATAQYW2"
}

variable "create_www_record" {
  type        = bool
  description = "Whether to create www subdomain record pointing to CloudFront"
  default     = true
}

#------------------------------------------------------------------------------
# API Gateway Configuration
# Requirements: 18.3 - Create A records (alias) for API Gateway custom domain
#------------------------------------------------------------------------------
variable "create_api_gateway_record" {
  type        = bool
  description = "Whether to create DNS record for API Gateway"
  default     = true
}

variable "api_gateway_domain_name" {
  type        = string
  description = "Regional domain name of the API Gateway custom domain"
  default     = null
}

variable "api_gateway_hosted_zone_id" {
  type        = string
  description = "Regional hosted zone ID of the API Gateway custom domain"
  default     = null
}

#------------------------------------------------------------------------------
# Health Check Configuration
# Requirements: 18.4 - Configure health checks for production endpoints
#------------------------------------------------------------------------------
variable "enable_health_checks" {
  type        = bool
  description = "Whether to enable Route 53 health checks (recommended for production)"
  default     = false
}

variable "health_check_path" {
  type        = string
  description = "Path for CloudFront health check"
  default     = "/"
}

variable "api_health_check_path" {
  type        = string
  description = "Path for API Gateway health check (e.g., /health)"
  default     = null
}

variable "health_check_failure_threshold" {
  type        = number
  description = "Number of consecutive health check failures before marking unhealthy"
  default     = 3
}

variable "health_check_request_interval" {
  type        = number
  description = "Interval between health checks in seconds (10 or 30)"
  default     = 30
}

variable "health_check_regions" {
  type        = list(string)
  description = "AWS regions from which to perform health checks"
  default     = ["us-east-1", "eu-west-1", "ap-southeast-1"]
}

variable "sns_topic_arn" {
  type        = string
  description = "SNS topic ARN for health check alarm notifications"
  default     = null
}

#------------------------------------------------------------------------------
# Failover Configuration
# Requirements: 18.5 - Configure failover routing policies for production
#------------------------------------------------------------------------------
variable "enable_failover" {
  type        = bool
  description = "Whether to enable failover routing (requires health checks)"
  default     = false
}

variable "failover_domain_name" {
  type        = string
  description = "Domain name for failover CloudFront distribution or S3 website"
  default     = null
}

variable "failover_hosted_zone_id" {
  type        = string
  description = "Hosted zone ID for failover target"
  default     = null
}

variable "api_failover_domain_name" {
  type        = string
  description = "Domain name for failover API Gateway"
  default     = null
}

variable "api_failover_hosted_zone_id" {
  type        = string
  description = "Hosted zone ID for failover API Gateway"
  default     = null
}

#------------------------------------------------------------------------------
# DNSSEC Configuration
# Requirements: 18.6 - Enable DNSSEC for production hosted zones
#------------------------------------------------------------------------------
variable "enable_dnssec" {
  type        = bool
  description = "Whether to enable DNSSEC for the hosted zone (production only)"
  default     = false
}

variable "dnssec_kms_key_arn" {
  type        = string
  description = "ARN of the KMS key for DNSSEC signing (must be in us-east-1)"
  default     = null
}

#------------------------------------------------------------------------------
# IPv6 Configuration
#------------------------------------------------------------------------------
variable "enable_ipv6" {
  type        = bool
  description = "Whether to create AAAA records for IPv6 support"
  default     = true
}

#------------------------------------------------------------------------------
# Target Health Evaluation
#------------------------------------------------------------------------------
variable "evaluate_target_health" {
  type        = bool
  description = "Whether to evaluate target health for alias records"
  default     = false
}

#------------------------------------------------------------------------------
# Tags
#------------------------------------------------------------------------------
variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}
